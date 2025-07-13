'use strict';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, unlink } from 'node:fs/promises';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TestContext } from '@salesforce/core/testSetup';
import { convertToSonarQubeFormat } from '../../../src/utils/transformToSonar.js';
import { CodeAnalyzerOutput, SonarQubeIssue, SonarQubeRule } from '../../../src/utils/types.js';

// Sample mock input for testing
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

describe('convertToSonarQubeFormat unit tests', () => {
  const $$ = new TestContext();
  let tempInputPath: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    tempInputPath = join(tmpdir(), 'test-analyzer-input.json');
    tempOutputPath = join(tmpdir(), 'test-sonarqube-output.json');
    await writeFile(tempInputPath, JSON.stringify(mockAnalyzerInput, null, 2));
  });

  afterEach(async () => {
    await Promise.all([
      unlink(tempInputPath),
      unlink(tempOutputPath).catch(() => {}), // tolerate missing file if test failed early
    ]);
    $$.restore();
  });

  it('should convert Salesforce Code Analyzer output into SonarQube format', async () => {
    await convertToSonarQubeFormat(tempInputPath, tempOutputPath);

    const outputRaw = await readFile(tempOutputPath, 'utf8');
    const output = JSON.parse(outputRaw) as {
      rules: SonarQubeRule[];
      issues: SonarQubeIssue[];
    };

    expect(output.rules).toHaveLength(1);
    expect(output.issues).toHaveLength(1);

    expect(output.rules[0]).toMatchObject({
      id: 'AvoidOldSalesforceApiVersions',
      engineId: 'regex',
      type: 'CODE_SMELL',
      severity: 'MAJOR',
    });

    expect(output.issues[0].primaryLocation.filePath).toBe('force-app/main/default/classes/OldApi.cls');
    expect(output.issues[0].primaryLocation.textRange).toMatchObject({
      startLine: 1,
      startColumn: 5,
      endLine: 1,
      endColumn: 20,
    });
  });

  it('should throw an error if the input file is invalid JSON', async () => {
    await writeFile(tempInputPath, '{ not valid JSON }');
    await expect(convertToSonarQubeFormat(tempInputPath, tempOutputPath)).rejects.toThrow(SyntaxError);
  });

  it('should generate an empty issue set if violations array is empty', async () => {
    await writeFile(tempInputPath, JSON.stringify({ violations: [] }));
    await convertToSonarQubeFormat(tempInputPath, tempOutputPath);

    const outputRaw = await readFile(tempOutputPath, 'utf8');
    const output = JSON.parse(outputRaw) as {
      rules: SonarQubeRule[];
      issues: SonarQubeIssue[];
    };

    expect(output.issues).toHaveLength(0);
    expect(output.rules).toHaveLength(0);
  });
  it('should fallback to "MAJOR" severity if severity is unknown', async () => {
    const unknownSeverityInput: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'UnknownSeverityRule',
          engine: 'regex',
          severity: 999, // not in severityMap
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'Rule with unknown severity',
          locations: [
            {
              file: 'force-app/main/default/classes/SecurityRisk.cls',
              startLine: 10,
              startColumn: 1,
              endLine: 10,
              endColumn: 5,
            },
          ],
        },
      ],
    };

    await writeFile(tempInputPath, JSON.stringify(unknownSeverityInput, null, 2));
    await convertToSonarQubeFormat(tempInputPath, tempOutputPath);

    const outputRaw = await readFile(tempOutputPath, 'utf8');
    const output = JSON.parse(outputRaw) as {
      rules: SonarQubeRule[];
      issues: SonarQubeIssue[];
    };

    expect(output.rules[0].severity).toBe('MAJOR'); // fallback triggered
  });
});
