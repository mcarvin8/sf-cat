import { NormalizedSeverity, normalizeSeverity } from '../severity.js';
import { CodeAnalyzerOutput, Violation } from '../types.js';

export type JUnitFailure = {
  type: NormalizedSeverity;
  message: string;
  body: string;
};

export type JUnitTestcase = {
  classname: string;
  name: string;
  failure: JUnitFailure;
};

export type JUnitTestsuite = {
  name: string;
  tests: number;
  failures: number;
  testcases: JUnitTestcase[];
};

export type JUnitReport = {
  name: string;
  tests: number;
  failures: number;
  testsuites: JUnitTestsuite[];
};

const SUITE_NAME = 'Salesforce Code Analyzer';

function buildTestcase(v: Violation): JUnitTestcase {
  const loc = v.locations[v.primaryLocationIndex];
  const file = loc.file.replace(/\\/g, '/');
  const line = loc.startLine;
  const severity = normalizeSeverity(v.severity);

  const body = [
    `${v.rule} (${v.engine}, severity ${severity})`,
    `at ${file}:${line}`,
    '',
    v.message,
    v.tags.length > 0 ? `tags: ${v.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    classname: file,
    name: `${v.rule}:${line}`,
    failure: {
      type: severity,
      message: `${v.rule}: ${v.message}`,
      body,
    },
  };
}

/**
 * Builds a JUnit XML report from Code Analyzer output.
 *
 * Each engine (PMD, ESLint, RetireJS, SFGE, regex, ...) becomes its own
 * <testsuite>; each violation becomes a failing <testcase>. CI systems that
 * accept JUnit (Jenkins, GitHub Actions test reporters, GitLab, Azure DevOps,
 * CircleCI, Bitbucket, etc.) will render every violation as a test failure.
 */
export function convertToJUnit(input: CodeAnalyzerOutput): JUnitReport {
  const byEngine = new Map<string, Violation[]>();
  for (const v of input.violations) {
    const list = byEngine.get(v.engine) ?? [];
    list.push(v);
    byEngine.set(v.engine, list);
  }

  const testsuites: JUnitTestsuite[] = [];
  for (const [engine, violations] of byEngine) {
    const testcases = violations.map(buildTestcase);
    testsuites.push({
      name: engine,
      tests: testcases.length,
      failures: testcases.length,
      testcases,
    });
  }

  return {
    name: SUITE_NAME,
    tests: input.violations.length,
    failures: input.violations.length,
    testsuites,
  };
}

function escapeXml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function attr(name: string, value: string | number): string {
  return ` ${name}="${escapeXml(value)}"`;
}

function buildFailureXml(failure: JUnitFailure, indent: string): string {
  return `${indent}<failure${attr('type', failure.type)}${attr('message', failure.message)}>${escapeXml(failure.body)}</failure>`;
}

function buildTestcaseXml(tc: JUnitTestcase, indent: string): string {
  const inner = `${indent}  `;
  return [
    `${indent}<testcase${attr('classname', tc.classname)}${attr('name', tc.name)}>`,
    buildFailureXml(tc.failure, inner),
    `${indent}</testcase>`,
  ].join('\n');
}

function buildTestsuiteXml(ts: JUnitTestsuite, indent: string): string {
  const inner = `${indent}  `;
  const lines = [
    `${indent}<testsuite${attr('name', ts.name)}${attr('tests', ts.tests)}${attr('failures', ts.failures)}>`,
  ];
  for (const tc of ts.testcases) {
    lines.push(buildTestcaseXml(tc, inner));
  }
  lines.push(`${indent}</testsuite>`);
  return lines.join('\n');
}

export function serializeJUnit(report: JUnitReport): string {
  const lines = [
    `<testsuites${attr('name', report.name)}${attr('tests', report.tests)}${attr('failures', report.failures)}>`,
  ];
  for (const ts of report.testsuites) {
    lines.push(buildTestsuiteXml(ts, '  '));
  }
  lines.push('</testsuites>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join('\n')}\n`;
}
