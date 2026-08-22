import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransform } from '../../src/core/runTransform.js';
import { STDOUT_SENTINEL } from '../../src/utils/formats/index.js';
import { CodeAnalyzerOutput } from '../../src/utils/types.js';
import { mockAnalyzerInput } from '../utils/fixtures.js';

describe('runTransform', () => {
  let dir: string;
  let inputFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sf-cat-run-transform-'));
    inputFile = join(dir, 'analyzer.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeInput(input: CodeAnalyzerOutput): Promise<void> {
    await writeFile(inputFile, JSON.stringify(input, null, 2));
  }

  it('writes the default output file for the requested format', async () => {
    await writeInput(mockAnalyzerInput);
    const outputFile = join(dir, 'sonar.json');

    const result = await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'never',
    });

    expect(result).toEqual({ path: outputFile, violations: 1, failures: 0 });
    const written = JSON.parse(await readFile(outputFile, 'utf8')) as { issues: unknown[] };
    expect(written.issues).toHaveLength(1);
  });

  it('writes github annotations to stdout instead of a file', async () => {
    await writeInput(mockAnalyzerInput);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const result = await runTransform({
      inputFile,
      format: 'github',
      failOn: 'never',
    });

    expect(result.path).toBe(STDOUT_SENTINEL);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('::error'));
    writeSpy.mockRestore();
  });

  it('truncates github annotations beyond maxAnnotations and warns', async () => {
    const manyViolations: CodeAnalyzerOutput = {
      violations: Array.from({ length: 3 }, (_, i) => ({
        rule: `R${i}`,
        engine: 'pmd',
        severity: 2,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: `msg${i}`,
        locations: [{ file: 'a.cls', startLine: i + 1 }],
      })),
    };
    await writeInput(manyViolations);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const warnings: string[] = [];

    await runTransform({
      inputFile,
      format: 'github',
      failOn: 'never',
      maxAnnotations: 2,
      warn: (msg) => warnings.push(msg),
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('only the first 2 will be emitted');
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output.trim().split('\n')).toHaveLength(2);
    writeSpy.mockRestore();
  });

  it('applies strip-prefix path normalization before formatting', async () => {
    await writeInput({
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: '/work/repo/force-app/classes/X.cls', startLine: 1 }],
        },
      ],
    });
    const outputFile = join(dir, 'sonar.json');

    await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'never',
      stripPrefix: '/work/repo/',
    });

    const written = JSON.parse(await readFile(outputFile, 'utf8')) as {
      issues: Array<{ primaryLocation: { filePath: string } }>;
    };
    expect(written.issues[0].primaryLocation.filePath).toBe('force-app/classes/X.cls');
  });

  it('counts failures at or above the fail-on threshold and warns', async () => {
    await writeInput(mockAnalyzerInput);
    const outputFile = join(dir, 'sonar.json');
    const warnings: string[] = [];

    const result = await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'high',
      warn: (msg) => warnings.push(msg),
    });

    expect(result.failures).toBe(1);
    expect(warnings.some((w) => w.includes("severity 'high' or higher"))).toBe(true);
  });

  it('pluralizes the failure warning message when more than one violation fails the threshold', async () => {
    const twoHighViolations: CodeAnalyzerOutput = {
      violations: [1, 2].map((sev, i) => ({
        rule: `R${i}`,
        engine: 'pmd',
        severity: sev,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: `msg${i}`,
        locations: [{ file: 'a.cls', startLine: i + 1 }],
      })),
    };
    await writeInput(twoHighViolations);
    const outputFile = join(dir, 'sonar.json');
    const warnings: string[] = [];

    const result = await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'high',
      warn: (msg) => warnings.push(msg),
    });

    expect(result.failures).toBe(2);
    expect(warnings.some((w) => w.startsWith('Found 2 violations '))).toBe(true);
  });

  it('falls back to a no-op warn function when none is provided', async () => {
    await writeInput(mockAnalyzerInput);
    const outputFile = join(dir, 'sonar.json');

    const result = await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'high',
    });

    expect(result.failures).toBe(1);
  });

  it('reports zero failures and does not warn when the threshold is never met', async () => {
    await writeInput(mockAnalyzerInput);
    const outputFile = join(dir, 'sonar.json');
    const warnings: string[] = [];

    const result = await runTransform({
      inputFile,
      outputFile,
      format: 'sonar',
      failOn: 'critical',
      warn: (msg) => warnings.push(msg),
    });

    expect(result.failures).toBe(0);
    expect(warnings).toHaveLength(0);
  });
});
