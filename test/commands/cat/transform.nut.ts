'use strict';

import { readFile, writeFile, unlink } from 'node:fs/promises';

import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
          endLine: 1,
        },
      ],
    },
  ],
};

describe('convertToSonarQubeFormat non-unit tests', () => {
  let session: TestSession;
  let tempInputPath: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    tempInputPath = 'test-analyzer-input.json';
    tempOutputPath = 'test-sonarqube-output.json';
    await writeFile(tempInputPath, JSON.stringify(mockAnalyzerInput, null, 2));
  });

  afterEach(async () => {
    await Promise.all([
      unlink(tempInputPath),
      unlink(tempOutputPath).catch(() => {}), // tolerate missing file if test failed early
    ]);
  });

  beforeAll(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  afterAll(async () => {
    await session?.clean();
  });

  it('should convert Salesforce Code Analyzer output into SonarQube format', async () => {
    const command = `cat transform -i "${tempInputPath}" -o "${tempOutputPath}"`;

    execCmd(command, { ensureExitCode: 0 });

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
      severity: 'CRITICAL',
    });

    expect(output.issues[0].primaryLocation.filePath).toBe('force-app/main/default/classes/OldApi.cls');
    expect(output.issues[0].primaryLocation.textRange).toMatchObject({
      startLine: 1,
      endLine: 1,
    });
  });
});
