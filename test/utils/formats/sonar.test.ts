import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convertToSonarQube, SonarQubeReport } from '../../../src/utils/formats/sonar.js';
import { mapSonarSoftwareQualities } from '../../../src/utils/severity.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { mockAnalyzerInput } from '../fixtures.js';

describe('convertToSonarQube unit tests', () => {
  let tempInputPath: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    tempInputPath = join(tmpdir(), 'test-analyzer-input.json');
    tempOutputPath = join(tmpdir(), 'test-sonarqube-output.json');
    await writeFile(tempInputPath, JSON.stringify(mockAnalyzerInput, null, 2));
  });

  afterEach(async () => {
    await Promise.all([unlink(tempInputPath), unlink(tempOutputPath).catch(() => {})]);
  });

  it('should convert Salesforce Code Analyzer output into SonarQube format', () => {
    const output = convertToSonarQube(mockAnalyzerInput);

    expect(output.rules).toHaveLength(1);
    expect(output.issues).toHaveLength(1);

    expect(output.rules[0]).toMatchObject({
      id: 'AvoidOldSalesforceApiVersions',
      engineId: 'regex',
      type: 'CODE_SMELL',
      severity: 'CRITICAL',
    });

    expect(output.issues[0].primaryLocation.filePath).toBe('force-app/main/default/classes/OldApi.cls');
    expect(output.issues[0].primaryLocation.textRange).toMatchObject({
      startLine: 1,
      endLine: 1,
    });
  });

  it('should generate an empty issue set if violations array is empty', () => {
    const output = convertToSonarQube({ violations: [] });
    expect(output.issues).toHaveLength(0);
    expect(output.rules).toHaveLength(0);
  });

  it('should fallback to "MAJOR" severity if severity is unknown', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'UnknownSeverityRule',
          engine: 'regex',
          severity: 999,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'Rule with unknown severity',
          locations: [
            {
              file: 'force-app/main/default/classes/SecurityRisk.cls',
              startLine: 10,
              endLine: 10,
            },
          ],
        },
      ],
    };

    const output = convertToSonarQube(input);
    expect(output.rules[0].severity).toBe('MAJOR');
    expect(output.issues[0].type).toBe('VULNERABILITY');
  });

  it('should deduplicate rules when multiple violations share the same rule id', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'AvoidOldSalesforceApiVersions',
          engine: 'regex',
          severity: 2,
          tags: ['maintainability'],
          primaryLocationIndex: 0,
          message: 'Avoid using a Salesforce API version that is more than 3 years old.',
          locations: [{ file: 'force-app/main/default/classes/OldApi.cls', startLine: 1, endLine: 1 }],
        },
        {
          rule: 'AvoidOldSalesforceApiVersions',
          engine: 'regex',
          severity: 2,
          tags: ['maintainability'],
          primaryLocationIndex: 0,
          message: 'Avoid using a Salesforce API version that is more than 3 years old.',
          locations: [{ file: 'force-app/main/default/classes/OtherOldApi.cls', startLine: 5, endLine: 5 }],
        },
      ],
    };

    const output = convertToSonarQube(input);
    expect(output.rules).toHaveLength(1);
    expect(output.issues).toHaveLength(2);
  });

  it('should classify issue as BUG when tag includes "errorprone"', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'LogicFlaw',
          engine: 'pmd',
          severity: 3,
          tags: ['errorprone', 'reliability'],
          primaryLocationIndex: 0,
          message: 'This code may result in unexpected behavior.',
          locations: [{ file: 'force-app/main/default/classes/BuggyLogic.cls', startLine: 15, endLine: 15 }],
        },
      ],
    };

    const output = convertToSonarQube(input);
    expect(output.issues[0].type).toBe('BUG');
  });

  it('should use the first violation message as rule description when deduplicating', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'DupRule',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'first message',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'DupRule',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'second message',
          locations: [{ file: 'b.cls', startLine: 1 }],
        },
      ],
    };
    const output = convertToSonarQube(input);
    expect(output.rules).toHaveLength(1);
    expect(output.rules[0].description).toBe('first message');
  });

  it('should normalize Windows-style backslash paths to forward slashes in filePath', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: 'force-app\\main\\default\\X.cls', startLine: 1 }],
        },
      ],
    };
    const output = convertToSonarQube(input);
    expect(output.issues[0].primaryLocation.filePath).toBe('force-app/main/default/X.cls');
  });

  it('should round-trip through JSON unchanged', async () => {
    const output: SonarQubeReport = convertToSonarQube(mockAnalyzerInput);
    await writeFile(tempOutputPath, JSON.stringify(output, null, 2));
    const parsed = JSON.parse(await readFile(tempOutputPath, 'utf8')) as SonarQubeReport;
    expect(parsed).toEqual(output);
  });

  it('should use startLine as endLine when violation has no endLine', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'NoEndLine',
          engine: 'pmd',
          severity: 3,
          tags: ['bestpractices'],
          primaryLocationIndex: 0,
          message: 'Missing end line.',
          locations: [{ file: 'force-app/main/default/classes/X.cls', startLine: 7 }],
        },
      ],
    };
    const output = convertToSonarQube(input);
    expect(output.issues[0].primaryLocation.textRange).toEqual({ startLine: 7, endLine: 7 });
  });
});

describe('mapSonarSoftwareQualities unit tests', () => {
  it('should fall back to MAINTAINABILITY when no tags match known sonar qualities', () => {
    expect(mapSonarSoftwareQualities([])).toEqual(['MAINTAINABILITY']);
    expect(mapSonarSoftwareQualities(['unknowntag', 'anotherbadtag'])).toEqual(['MAINTAINABILITY']);
  });

  it('should map known tags to valid SonarQube softwareQuality values', () => {
    expect(mapSonarSoftwareQualities(['security'])).toEqual(['SECURITY']);
    expect(mapSonarSoftwareQualities(['errorprone'])).toEqual(['RELIABILITY']);
    expect(mapSonarSoftwareQualities(['maintainability'])).toEqual(['MAINTAINABILITY']);
  });

  it('should deduplicate qualities when multiple tags map to the same value', () => {
    const result = mapSonarSoftwareQualities(['errorprone', 'reliability', 'performance']);
    expect(result).toEqual(['RELIABILITY']);
  });

  it('should return multiple qualities when tags map to different values', () => {
    const result = mapSonarSoftwareQualities(['security', 'errorprone']);
    expect(result).toContain('SECURITY');
    expect(result).toContain('RELIABILITY');
    expect(result).toHaveLength(2);
  });

  it('should map reliability tag to RELIABILITY without relying on other tags', () => {
    expect(mapSonarSoftwareQualities(['reliability'])).toEqual(['RELIABILITY']);
  });

  it('should map performance tag to RELIABILITY without relying on other tags', () => {
    expect(mapSonarSoftwareQualities(['performance'])).toEqual(['RELIABILITY']);
  });

  it('should map design/documentation/portability/bestpractices/codestyle/maintainability to MAINTAINABILITY', () => {
    for (const tag of ['design', 'documentation', 'portability', 'bestpractices', 'codestyle', 'maintainability']) {
      const result = mapSonarSoftwareQualities(['security', tag]);
      expect(result).toContain('SECURITY');
      expect(result).toContain('MAINTAINABILITY');
      expect(result).toHaveLength(2);
    }
  });
});

describe('convertToSonarQube rule field completeness', () => {
  it('should reformat camelCase rule id into a human-readable name', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'AvoidOldSalesforceApiVersions',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const output = convertToSonarQube(input);
    expect(output.rules[0].name).toBe('Avoid Old Salesforce Api Versions');
  });

  it('should set cleanCodeAttribute to FORMATTED on every rule', () => {
    const output = convertToSonarQube(mockAnalyzerInput);
    expect(output.rules[0].cleanCodeAttribute).toBe('FORMATTED');
  });

  it('should populate impacts with softwareQuality entries at MEDIUM severity', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const output = convertToSonarQube(input);
    expect(output.rules[0].impacts).toHaveLength(1);
    expect(output.rules[0].impacts[0].softwareQuality).toBe('SECURITY');
    expect(output.rules[0].impacts[0].severity).toBe('MEDIUM');
  });
});
