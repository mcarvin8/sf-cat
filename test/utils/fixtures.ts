import { CodeAnalyzerOutput, Violation } from '../../src/utils/types.js';

export const mkViolation = (overrides: Partial<Violation> = {}): Violation => ({
  rule: 'R',
  engine: 'pmd',
  severity: 2,
  tags: ['security'],
  primaryLocationIndex: 0,
  message: 'msg',
  locations: [{ file: 'a.cls', startLine: 1 }],
  ...overrides,
});

/**
 * Shape of the synthetic violation Code Analyzer core emits when an engine
 * fails to instantiate or throws unexpectedly mid-run (rule
 * `UninstantiableEngineError` / `UnexpectedEngineError`). Its location has no
 * `file`/`startLine`/etc. — `JSON.stringify` drops the `undefined` keys, so
 * a location like this is exactly what round-trips through `analyzer.json`.
 */
export const mkEngineErrorViolation = (overrides: Partial<Violation> = {}): Violation => ({
  rule: 'UnexpectedEngineError',
  engine: 'pmd',
  severity: 1,
  tags: [],
  primaryLocationIndex: 0,
  message: 'The pmd engine threw an unexpected error while running rules: some underlying failure',
  locations: [{}],
  ...overrides,
});

export const mockAnalyzerInput: CodeAnalyzerOutput = {
  violations: [
    {
      rule: 'AvoidOldSalesforceApiVersions',
      engine: 'regex',
      severity: 2,
      tags: ['maintainability'],
      primaryLocationIndex: 0,
      message: 'Avoid using a Salesforce API version that is more than 3 years old.',
      locations: [
        {
          file: 'force-app/main/default/classes/OldApi.cls',
          startLine: 1,
          startColumn: 5,
          endLine: 1,
          endColumn: 20,
        },
      ],
    },
  ],
};
