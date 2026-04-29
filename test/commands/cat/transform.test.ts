'use strict';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Log } from 'sarif';
import { convertToSonarQube, SonarQubeReport } from '../../../src/utils/formats/sonar.js';
import { convertToSarif } from '../../../src/utils/formats/sarif.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';

const mockAnalyzerInput: CodeAnalyzerOutput = {
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
    const unknownSeverityInput: CodeAnalyzerOutput = {
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

    const output = convertToSonarQube(unknownSeverityInput);
    expect(output.rules[0].severity).toBe('MAJOR');
    expect(output.issues[0].type).toBe('VULNERABILITY');
  });

  it('should deduplicate rules when multiple violations share the same rule id', () => {
    const duplicateRuleInput: CodeAnalyzerOutput = {
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

    const output = convertToSonarQube(duplicateRuleInput);
    expect(output.rules).toHaveLength(1);
    expect(output.issues).toHaveLength(2);
  });

  it('should classify issue as BUG when tag includes "errorprone"', () => {
    const bugTagInput: CodeAnalyzerOutput = {
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

    const output = convertToSonarQube(bugTagInput);
    expect(output.issues[0].type).toBe('BUG');
  });

  it('should round-trip through JSON unchanged', async () => {
    const output: SonarQubeReport = convertToSonarQube(mockAnalyzerInput);
    await writeFile(tempOutputPath, JSON.stringify(output, null, 2));
    const parsed = JSON.parse(await readFile(tempOutputPath, 'utf8')) as SonarQubeReport;
    expect(parsed).toEqual(output);
  });
});

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
