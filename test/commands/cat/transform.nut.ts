'use strict';

import { readFile, writeFile, unlink } from 'node:fs/promises';

import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { Log } from 'sarif';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { SonarQubeReport } from '../../../src/utils/formats/sonar.js';

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

describe('sf cat transform non-unit tests', () => {
  let session: TestSession;
  let tempInputPath: string;
  let tempOutputPath: string;

  beforeEach(async () => {
    tempInputPath = 'test-analyzer-input.json';
    tempOutputPath = 'test-output';
    await writeFile(tempInputPath, JSON.stringify(mockAnalyzerInput, null, 2));
  });

  afterEach(async () => {
    await Promise.all([
      unlink(tempInputPath),
      unlink(`${tempOutputPath}.json`).catch(() => {}),
      unlink(`${tempOutputPath}.sarif`).catch(() => {}),
    ]);
  });

  beforeAll(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  afterAll(async () => {
    await session?.clean();
  });

  it('should convert Salesforce Code Analyzer output into SonarQube format', async () => {
    const outputPath = `${tempOutputPath}.json`;
    const command = `cat transform -i "${tempInputPath}" -o "${outputPath}"`;

    execCmd(command, { ensureExitCode: 0 });

    const output = JSON.parse(await readFile(outputPath, 'utf8')) as SonarQubeReport;

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

  it('should convert Salesforce Code Analyzer output into SARIF format', async () => {
    const outputPath = `${tempOutputPath}.sarif`;
    const command = `cat transform -i "${tempInputPath}" -f sarif -o "${outputPath}"`;

    execCmd(command, { ensureExitCode: 0 });

    const log = JSON.parse(await readFile(outputPath, 'utf8')) as Log;

    expect(log.version).toBe('2.1.0');
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0].tool.driver.name).toBe('Salesforce Code Analyzer (regex)');
    expect(log.runs[0].results).toHaveLength(1);
    expect(log.runs[0].results?.[0].level).toBe('error');
  });
});
