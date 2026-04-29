import XMLBuilder from 'fast-xml-builder';
import { CodeAnalyzerOutput, Violation } from '../types.js';
import { NormalizedSeverity, normalizeSeverity } from '../severity.js';

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

const xmlBuilder = new XMLBuilder({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  format: true,
  indentBy: '  ',
  processEntities: true,
  suppressEmptyNode: false,
});

export function serializeJUnit(report: JUnitReport): string {
  const tree = {
    testsuites: {
      '@_name': report.name,
      '@_tests': report.tests,
      '@_failures': report.failures,
      testsuite: report.testsuites.map((ts) => ({
        '@_name': ts.name,
        '@_tests': ts.tests,
        '@_failures': ts.failures,
        testcase: ts.testcases.map((tc) => ({
          '@_classname': tc.classname,
          '@_name': tc.name,
          failure: {
            '@_type': tc.failure.type,
            '@_message': tc.failure.message,
            '#text': tc.failure.body,
          },
        })),
      })),
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build(tree)}`;
}
