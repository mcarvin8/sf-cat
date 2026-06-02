import { describe, it, expect } from 'vitest';
import type { Log } from 'sarif';
import { convertToSarif } from '../../../src/utils/formats/sarif.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { mockAnalyzerInput } from '../fixtures.js';

describe('convertToSarif unit tests', () => {
  it('should produce a valid SARIF v2.1.0 log skeleton', () => {
    const log = convertToSarif(mockAnalyzerInput);
    expect(log.version).toBe('2.1.0');
    expect(log.$schema).toContain('sarif-2.1.0');
    expect(log.runs).toHaveLength(1);
  });

  it('should map severity 2 (high) to SARIF level "error"', () => {
    const log = convertToSarif(mockAnalyzerInput);
    expect(log.runs[0].results?.[0].level).toBe('error');
    expect(log.runs[0].tool.driver.rules?.[0].defaultConfiguration?.level).toBe('error');
  });

  it('should map severity 3 (moderate) to "warning" and 5 (info) to "note"', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'ModerateRule',
          engine: 'pmd',
          severity: 3,
          tags: ['design'],
          primaryLocationIndex: 0,
          message: 'Moderate issue',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'InfoRule',
          engine: 'pmd',
          severity: 5,
          tags: ['documentation'],
          primaryLocationIndex: 0,
          message: 'Info issue',
          locations: [{ file: 'b.cls', startLine: 2 }],
        },
      ],
    };
    const log = convertToSarif(input);
    expect(log.runs[0].results?.[0].level).toBe('warning');
    expect(log.runs[0].results?.[1].level).toBe('note');
  });

  it('should group violations into one run per engine', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R1',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'pmd issue',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'R2',
          engine: 'eslint',
          severity: 3,
          tags: ['design'],
          primaryLocationIndex: 0,
          message: 'eslint issue',
          locations: [{ file: 'b.js', startLine: 2 }],
        },
      ],
    };
    const log = convertToSarif(input);
    expect(log.runs).toHaveLength(2);
    const engines = log.runs.map((r) => r.tool.driver.name).sort();
    expect(engines).toEqual(['Salesforce Code Analyzer (eslint)', 'Salesforce Code Analyzer (pmd)']);
  });

  it('should deduplicate rules within a single run', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'SameRule',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'SameRule',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'b.cls', startLine: 2 }],
        },
      ],
    };
    const log = convertToSarif(input);
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].tool.driver.rules).toHaveLength(1);
    expect(log.runs[0].results).toHaveLength(2);
  });

  it('should use first violation message for rule descriptions when deduplicating', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'DupRule',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'first message',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'DupRule',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'second message',
          locations: [{ file: 'b.cls', startLine: 2 }],
        },
      ],
    };
    const log = convertToSarif(input);
    expect(log.runs[0].tool.driver.rules).toHaveLength(1);
    const rule = log.runs[0].tool.driver.rules?.[0];
    expect((rule?.shortDescription as { text: string })?.text).toBe('first message');
    expect((rule?.fullDescription as { text: string })?.text).toBe('first message');
  });

  it('should normalize Windows-style backslash paths to forward slashes', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'force-app\\main\\default\\classes\\X.cls', startLine: 1 }],
        },
      ],
    };
    const log = convertToSarif(input);
    const uri = log.runs[0].results?.[0].locations?.[0].physicalLocation?.artifactLocation?.uri;
    expect(uri).toBe('force-app/main/default/classes/X.cls');
  });

  it('should produce an empty default run when there are no violations', () => {
    const log: Log = convertToSarif({ violations: [] });
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].results).toHaveLength(0);
    expect(log.runs[0].tool.driver.rules).toHaveLength(0);
  });

  it('should default missing endLine to startLine', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 7 }],
        },
      ],
    };
    const log = convertToSarif(input);
    const region = log.runs[0].results?.[0].locations?.[0].physicalLocation?.region;
    expect(region?.startLine).toBe(7);
    expect(region?.endLine).toBe(7);
  });
});

describe('convertToSarif field completeness', () => {
  const input: CodeAnalyzerOutput = {
    violations: [
      {
        rule: 'MyRule',
        engine: 'pmd',
        severity: 3,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: 'Something is wrong',
        locations: [{ file: 'a.cls', startLine: 5, endLine: 10 }],
      },
    ],
  };

  it('should include informationUri in the tool driver', () => {
    const log = convertToSarif(input);
    expect(log.runs[0].tool.driver.informationUri).toContain('salesforce');
  });

  it('should include message text in each result', () => {
    const log = convertToSarif(input);
    expect(log.runs[0].results?.[0].message?.text).toBe('Something is wrong');
  });

  it('should include issueType in result properties', () => {
    const log = convertToSarif(input);
    expect(log.runs[0].results?.[0].properties?.['issueType']).toBe('VULNERABILITY');
  });

  it('should include shortDescription and fullDescription in rules', () => {
    const log = convertToSarif(input);
    const rule = log.runs[0].tool.driver.rules?.[0];
    expect((rule?.shortDescription as { text: string })?.text).toBe('Something is wrong');
    expect((rule?.fullDescription as { text: string })?.text).toBe('Something is wrong');
  });

  it('should include analyzerSeverity in rule properties', () => {
    const log = convertToSarif(input);
    const rule = log.runs[0].tool.driver.rules?.[0];
    expect(rule?.properties?.['analyzerSeverity']).toBe(3);
  });

  it('should use the plain tool name for the empty-violations run', () => {
    const log = convertToSarif({ violations: [] });
    expect(log.runs[0].tool.driver.name).toBe('Salesforce Code Analyzer');
  });

  it('should include informationUri in the empty-violations run', () => {
    const log = convertToSarif({ violations: [] });
    expect(log.runs[0].tool.driver.informationUri).toContain('salesforce');
  });
});
