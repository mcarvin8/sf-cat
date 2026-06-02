import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizePaths } from '../../src/utils/normalizePaths.js';
import { CodeAnalyzerOutput } from '../../src/utils/types.js';

describe('normalizePaths unit tests', () => {
  const buildInput = (file: string): CodeAnalyzerOutput => ({
    violations: [
      {
        rule: 'R',
        engine: 'pmd',
        severity: 2,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: 'msg',
        locations: [{ file, startLine: 1 }],
      },
    ],
  });

  it('should return the input unchanged when no options are set', () => {
    const input = buildInput('/abs/path/file.cls');
    expect(normalizePaths(input, {})).toBe(input);
  });

  it('should strip a literal prefix from each path', () => {
    const input = buildInput('/home/runner/work/repo/repo/force-app/main/default/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/home/runner/work/repo/repo/' });
    expect(out.violations[0].locations[0].file).toBe('force-app/main/default/X.cls');
  });

  it('should normalize backslashes in both prefix and path before comparing', () => {
    const input = buildInput('C:\\Users\\me\\repo\\src\\X.cls');
    const out = normalizePaths(input, { stripPrefix: 'C:\\Users\\me\\repo' });
    expect(out.violations[0].locations[0].file).toBe('src/X.cls');
  });

  it('should accept a prefix with or without a trailing slash', () => {
    const a = normalizePaths(buildInput('/repo/src/X.cls'), { stripPrefix: '/repo' });
    const b = normalizePaths(buildInput('/repo/src/X.cls'), { stripPrefix: '/repo/' });
    expect(a.violations[0].locations[0].file).toBe('src/X.cls');
    expect(b.violations[0].locations[0].file).toBe('src/X.cls');
  });

  it('should leave paths unchanged when the prefix does not match', () => {
    const input = buildInput('/different/path/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/repo/' });
    expect(out.violations[0].locations[0].file).toBe('/different/path/X.cls');
  });

  it('should NOT strip a prefix that is only a partial path component match', () => {
    // '/repo' should NOT match the start of '/reports/X.cls'
    const input = buildInput('/reports/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations[0].file).toBe('/reports/X.cls');
  });

  it('should leave the path unchanged when it equals the prefix exactly (no valid relative path)', () => {
    // A file path identical to the prefix has no meaningful relative form — return as-is
    // rather than producing an empty string that all downstream formatters would mishandle.
    const input = buildInput('/repo');
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations[0].file).toBe('/repo');
  });

  it('should handle multi-violation, multi-location inputs', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R1',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [
            { file: '/repo/a.cls', startLine: 1 },
            { file: '/repo/b.cls', startLine: 2 },
          ],
        },
        {
          rule: 'R2',
          engine: 'pmd',
          severity: 3,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: '/repo/c.cls', startLine: 3 }],
        },
      ],
    };
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations.map((l) => l.file)).toEqual(['a.cls', 'b.cls']);
    expect(out.violations[1].locations[0].file).toBe('c.cls');
  });

  it('should not mutate the original input', () => {
    const input = buildInput('/repo/X.cls');
    const originalFile = input.violations[0].locations[0].file;
    normalizePaths(input, { stripPrefix: '/repo/' });
    expect(input.violations[0].locations[0].file).toBe(originalFile);
  });

  it('should ignore an empty stripPrefix', () => {
    const input = buildInput('/repo/X.cls');
    const out = normalizePaths(input, { stripPrefix: '' });
    expect(out).toBe(input);
  });

  it('should ignore a stripPrefix that becomes empty after slash trimming', () => {
    const input = buildInput('/repo/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/' });
    expect(out).toBe(input);
  });
});

describe('normalizePaths --project-relative integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Use realpath so the temp dir matches what process.cwd() reports on
    // macOS, where /var/folders/... is a symlink to /private/var/folders/...
    tempDir = await realpath(await mkdtemp(join(tmpdir(), 'sf-cat-proj-')));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should resolve the SFDX project root from sfdx-project.json and strip it', async () => {
    const projectDir = join(tempDir, 'my-sfdx-project');
    const subDir = join(projectDir, 'force-app', 'main', 'default');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(projectDir, 'sfdx-project.json'), '{"packageDirectories":[]}');

    const projectDirNormalized = projectDir.replace(/\\/g, '/');
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: `${projectDirNormalized}/force-app/main/default/X.cls`, startLine: 1 }],
        },
      ],
    };

    const out = normalizePaths(input, { projectRelative: true, cwd: subDir });
    expect(out.violations[0].locations[0].file).toBe('force-app/main/default/X.cls');
  });

  it('should throw a helpful error when no sfdx-project.json is found above cwd', () => {
    expect(() =>
      normalizePaths(
        {
          violations: [
            {
              rule: 'R',
              engine: 'pmd',
              severity: 2,
              tags: [],
              primaryLocationIndex: 0,
              message: 'm',
              locations: [{ file: '/x.cls', startLine: 1 }],
            },
          ],
        },
        { projectRelative: true, cwd: tempDir },
      ),
    ).toThrow(/sfdx-project\.json/);
  });

  it('should fall back to process.cwd() when no cwd option is provided', () => {
    // process.cwd() during test runs is the repo root, which has no sfdx-project.json
    expect(() =>
      normalizePaths(
        {
          violations: [
            {
              rule: 'R',
              engine: 'pmd',
              severity: 2,
              tags: [],
              primaryLocationIndex: 0,
              message: 'm',
              locations: [{ file: '/x.cls', startLine: 1 }],
            },
          ],
        },
        { projectRelative: true },
      ),
    ).toThrow(/sfdx-project\.json/);
  });
});
