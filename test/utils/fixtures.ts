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
