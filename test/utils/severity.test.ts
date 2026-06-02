import { describe, it, expect } from 'vitest';
import { countAtOrAboveThreshold } from '../../src/utils/severity.js';
import { convertToSonarQube } from '../../src/utils/formats/sonar.js';
import { convertToSarif } from '../../src/utils/formats/sarif.js';
import { CodeAnalyzerOutput } from '../../src/utils/types.js';

describe('countAtOrAboveThreshold unit tests', () => {
  const fiveSeverities: CodeAnalyzerOutput = {
    violations: [1, 2, 3, 4, 5].map((sev, i) => ({
      rule: `R${sev}`,
      engine: 'pmd',
      severity: sev,
      tags: ['security'],
      primaryLocationIndex: 0,
      message: 'msg',
      locations: [{ file: 'a.cls', startLine: i + 1 }],
    })),
  };

  it('should return 0 for the "never" threshold regardless of input', () => {
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'never')).toBe(0);
    expect(countAtOrAboveThreshold([], 'never')).toBe(0);
  });

  it('should count only violations at or above the requested threshold', () => {
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'critical')).toBe(1);
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'high')).toBe(2);
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'moderate')).toBe(3);
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'low')).toBe(4);
    expect(countAtOrAboveThreshold(fiveSeverities.violations, 'info')).toBe(5);
  });

  it('should treat unknown analyzer severities as "moderate"', () => {
    const violations = [{ severity: 999 }, { severity: 1 }];
    // 999 normalizes to 'moderate'; 1 is 'critical'
    expect(countAtOrAboveThreshold(violations, 'critical')).toBe(1);
    expect(countAtOrAboveThreshold(violations, 'high')).toBe(1);
    expect(countAtOrAboveThreshold(violations, 'moderate')).toBe(2);
  });

  it('should return 0 for empty violations regardless of threshold', () => {
    expect(countAtOrAboveThreshold([], 'critical')).toBe(0);
    expect(countAtOrAboveThreshold([], 'info')).toBe(0);
  });
});

describe('sonarSeverity mapping completeness', () => {
  const mkInput = (severity: number): CodeAnalyzerOutput => ({
    violations: [
      {
        rule: 'R',
        engine: 'pmd',
        severity,
        tags: [],
        primaryLocationIndex: 0,
        message: 'm',
        locations: [{ file: 'x.cls', startLine: 1 }],
      },
    ],
  });

  it('should map severity 1 (critical) to BLOCKER in SonarQube output', () => {
    expect(convertToSonarQube(mkInput(1)).issues[0].severity).toBe('BLOCKER');
    expect(convertToSonarQube(mkInput(1)).rules[0].severity).toBe('BLOCKER');
  });

  it('should map severity 4 (low) to MINOR in SonarQube output', () => {
    expect(convertToSonarQube(mkInput(4)).issues[0].severity).toBe('MINOR');
  });

  it('should map severity 5 (info) to INFO in SonarQube output', () => {
    expect(convertToSonarQube(mkInput(5)).issues[0].severity).toBe('INFO');
  });

  it('should map severity 1 (critical) to SARIF level error', () => {
    const log = convertToSarif(mkInput(1));
    expect(log.runs[0].results?.[0].level).toBe('error');
    expect(log.runs[0].tool.driver.rules?.[0].defaultConfiguration?.level).toBe('error');
  });

  it('should map severity 4 (low) to SARIF level note', () => {
    const log = convertToSarif(mkInput(4));
    expect(log.runs[0].results?.[0].level).toBe('note');
    expect(log.runs[0].tool.driver.rules?.[0].defaultConfiguration?.level).toBe('note');
  });
});
