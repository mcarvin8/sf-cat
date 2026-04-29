import { existsSync } from 'node:fs';
import { dirname, parse, resolve } from 'node:path';
import { CodeAnalyzerOutput } from './types.js';

const PROJECT_MARKER = 'sfdx-project.json';

export type PathRewriteOptions = {
  stripPrefix?: string;
  projectRelative?: boolean;
};

/**
 * Returns a new CodeAnalyzerOutput with each violation location's `file`
 * rewritten according to the supplied options. When neither option is set,
 * the input is returned as-is (no allocation).
 *
 * `stripPrefix` and `projectRelative` are mutually exclusive at the CLI layer;
 * `projectRelative: true` walks upward from `process.cwd()` until it finds an
 * `sfdx-project.json` and uses that directory as the prefix.
 *
 * Prefixes are matched after normalizing both sides to forward slashes, so
 * Windows-style absolute paths from CI runners work without manual escaping.
 */
export function normalizePaths(input: CodeAnalyzerOutput, opts: PathRewriteOptions): CodeAnalyzerOutput {
  const rawPrefix = opts.projectRelative ? findSfdxProjectRoot() : opts.stripPrefix;
  if (!rawPrefix) return input;

  const prefix = rawPrefix.replace(/\\/g, '/').replace(/\/$/, '');
  if (prefix.length === 0) return input;

  return {
    ...input,
    violations: input.violations.map((v) => ({
      ...v,
      locations: v.locations.map((loc) => ({
        ...loc,
        file: stripLeadingPrefix(loc.file, prefix),
      })),
    })),
  };
}

function stripLeadingPrefix(file: string, prefix: string): string {
  const normalized = file.replace(/\\/g, '/');
  if (normalized === prefix) return '';
  if (normalized.startsWith(`${prefix}/`)) {
    return normalized.slice(prefix.length + 1);
  }
  return file;
}

/**
 * Walks upward from the current working directory looking for an
 * `sfdx-project.json` file. Returns the absolute path of the directory that
 * contains it. Throws a helpful error when no marker is found.
 */
function findSfdxProjectRoot(): string {
  let current = resolve(process.cwd());
  const { root } = parse(current);

  for (;;) {
    if (existsSync(resolve(current, PROJECT_MARKER))) return current;
    if (current === root) break;
    current = dirname(current);
  }

  throw new Error(
    `Could not locate ${PROJECT_MARKER} in the current directory or any parent. Run from inside a Salesforce DX project, or use --strip-prefix instead of --project-relative.`,
  );
}
