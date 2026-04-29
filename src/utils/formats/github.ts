import { CodeAnalyzerOutput, Violation } from '../types.js';
import { GitHubLevel, githubLevel, normalizeSeverity } from '../severity.js';

export type GitHubAnnotation = {
  level: GitHubLevel;
  file: string;
  line: number;
  endLine: number;
  title: string;
  message: string;
};

export type GitHubAnnotationReport = GitHubAnnotation[];

function buildAnnotation(v: Violation): GitHubAnnotation {
  const loc = v.locations[v.primaryLocationIndex];
  return {
    level: githubLevel[normalizeSeverity(v.severity)],
    file: loc.file.replace(/\\/g, '/'),
    line: loc.startLine,
    endLine: loc.endLine ?? loc.startLine,
    // columns are intentionally dropped — Code Analyzer columns are routinely
    // out-of-bounds and GitHub silently skips annotations with bad columns
    title: v.rule,
    message: v.message,
  };
}

/**
 * Builds an array of GitHub Actions workflow command annotations from Code
 * Analyzer output. When printed to stdout inside a GitHub Actions step, each
 * line is parsed by the runner into an inline PR annotation — no SARIF upload
 * or GitHub Advanced Security license required.
 *
 * Spec: https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#setting-an-error-message
 */
export function convertToGitHubAnnotations(input: CodeAnalyzerOutput): GitHubAnnotationReport {
  return input.violations.map(buildAnnotation);
}

/**
 * Property values are delimited by ',' and ':', so all five must be escaped.
 * '%' must be replaced first since it's the escape character.
 */
function escapeProperty(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

/**
 * Message text after the second '::' only needs '%', CR, and LF escaped —
 * ':' and ',' are legal there.
 */
function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function renderAnnotation(a: GitHubAnnotation): string {
  const props = [
    `file=${escapeProperty(a.file)}`,
    `line=${a.line}`,
    `endLine=${a.endLine}`,
    `title=${escapeProperty(a.title)}`,
  ].join(',');
  return `::${a.level} ${props}::${escapeData(a.message)}`;
}

export function serializeGitHubAnnotations(annotations: GitHubAnnotationReport): string {
  if (annotations.length === 0) return '';
  return annotations.map(renderAnnotation).join('\n') + '\n';
}
