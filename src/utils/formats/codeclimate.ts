/* eslint-disable camelcase -- CodeClimate / GitLab Code Quality spec requires snake_case keys. */
import { createHash } from 'node:crypto';
import { CodeAnalyzerOutput, Violation } from '../types.js';
import {
  CodeClimateCategory,
  CodeClimateSeverity,
  codeClimateSeverity,
  mapCodeClimateCategories,
  normalizeSeverity,
} from '../severity.js';

/**
 * CodeClimate JSON / GitLab Code Quality issue.
 * Spec: https://github.com/codeclimate/platform/blob/master/spec/analyzers/SPEC.md
 * GitLab: https://docs.gitlab.com/ee/ci/testing/code_quality.html
 */
export type CodeClimateIssue = {
  type: 'issue';
  check_name: string;
  description: string;
  categories: CodeClimateCategory[];
  location: {
    path: string;
    lines: {
      begin: number;
      end: number;
    };
  };
  severity: CodeClimateSeverity;
  fingerprint: string;
  engine_name?: string;
};

export type CodeClimateReport = CodeClimateIssue[];

/**
 * Stable fingerprint per violation (rule + file + line + message). MD5 is used
 * for identity only, not security; matches conventions of existing CodeClimate
 * engines and is what GitLab dedupes on.
 */
function fingerprint(v: Violation, path: string, line: number): string {
  const key = `${v.engine}|${v.rule}|${path}|${line}|${v.message}`;
  return createHash('md5').update(key).digest('hex');
}

export function convertToCodeClimate(input: CodeAnalyzerOutput): CodeClimateReport {
  const issues: CodeClimateIssue[] = [];

  for (const v of input.violations) {
    const loc = v.locations[v.primaryLocationIndex];
    const path = loc.file.replace(/\\/g, '/');
    const begin = loc.startLine;
    const end = loc.endLine ?? loc.startLine;

    issues.push({
      type: 'issue',
      check_name: v.rule,
      description: v.message,
      categories: mapCodeClimateCategories(v.tags),
      location: {
        path,
        lines: { begin, end },
      },
      severity: codeClimateSeverity[normalizeSeverity(v.severity)],
      fingerprint: fingerprint(v, path, begin),
      engine_name: v.engine,
    });
  }

  return issues;
}
