/* eslint-disable camelcase -- CodeClimate spec uses snake_case keys. */
'use strict';

import { readFile, writeFile, unlink } from 'node:fs/promises';

import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { Log } from 'sarif';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { SonarQubeReport } from '../../../src/utils/formats/sonar.js';
import { CodeClimateReport } from '../../../src/utils/formats/codeclimate.js';

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
      unlink(`${tempOutputPath}-cc.json`).catch(() => {}),
      unlink(`${tempOutputPath}.xml`).catch(() => {}),
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

  it('should convert Salesforce Code Analyzer output into CodeClimate format', async () => {
    const outputPath = `${tempOutputPath}-cc.json`;
    const command = `cat transform -i "${tempInputPath}" -f codeclimate -o "${outputPath}"`;

    execCmd(command, { ensureExitCode: 0 });

    const issues = JSON.parse(await readFile(outputPath, 'utf8')) as CodeClimateReport;

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'issue',
      check_name: 'AvoidOldSalesforceApiVersions',
      engine_name: 'regex',
      severity: 'critical',
    });
    expect(issues[0].fingerprint).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should convert Salesforce Code Analyzer output into JUnit XML', async () => {
    const outputPath = `${tempOutputPath}.xml`;
    const command = `cat transform -i "${tempInputPath}" -f junit -o "${outputPath}"`;

    execCmd(command, { ensureExitCode: 0 });

    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites name="Salesforce Code Analyzer" tests="1" failures="1">');
    expect(xml).toContain('<testsuite name="regex" tests="1" failures="1">');
    expect(xml).toContain('classname="force-app/main/default/classes/OldApi.cls"');
    expect(xml).toContain('name="AvoidOldSalesforceApiVersions:1"');
  });

  it('should emit GitHub Actions workflow commands to stdout', () => {
    const command = `cat transform -i "${tempInputPath}" -f github`;

    const result = execCmd(command, { ensureExitCode: 0 });
    const stdout = result.shellOutput.stdout;

    expect(stdout).toContain(
      '::error file=force-app/main/default/classes/OldApi.cls,line=1,endLine=1,title=AvoidOldSalesforceApiVersions::Avoid using a Salesforce API version that is more than 3 years old.',
    );
  });

  it('should strip a leading prefix from violation paths via --strip-prefix', async () => {
    const absoluteInput: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [
            {
              file: '/home/runner/work/myrepo/myrepo/force-app/main/default/classes/X.cls',
              startLine: 1,
              endLine: 1,
            },
          ],
        },
      ],
    };
    await writeFile(tempInputPath, JSON.stringify(absoluteInput, null, 2));

    const outputPath = `${tempOutputPath}.json`;
    const command = `cat transform -i "${tempInputPath}" -o "${outputPath}" --strip-prefix "/home/runner/work/myrepo/myrepo/"`;

    execCmd(command, { ensureExitCode: 0 });

    const output = JSON.parse(await readFile(outputPath, 'utf8')) as SonarQubeReport;
    expect(output.issues[0].primaryLocation.filePath).toBe('force-app/main/default/classes/X.cls');
  });

  it('should exit non-zero when --fail-on is met', async () => {
    const outputPath = `${tempOutputPath}.json`;
    const command = `cat transform -i "${tempInputPath}" -o "${outputPath}" --fail-on high`;

    // mockAnalyzerInput has severity 2 ('high'), so this should trip the gate
    execCmd(command, { ensureExitCode: 1 });

    // The file is still written before the failing exit
    const output = JSON.parse(await readFile(outputPath, 'utf8')) as SonarQubeReport;
    expect(output.issues).toHaveLength(1);
  });

  it('should exit zero when --fail-on is set above the highest violation severity', () => {
    const outputPath = `${tempOutputPath}.json`;
    const command = `cat transform -i "${tempInputPath}" -o "${outputPath}" --fail-on critical`;

    // mockAnalyzerInput violations are 'high', not 'critical'
    execCmd(command, { ensureExitCode: 0 });
  });
});
