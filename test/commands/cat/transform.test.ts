/* eslint-disable camelcase -- CodeClimate spec uses snake_case keys. */
'use strict';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Log } from 'sarif';
import { convertToSonarQube, SonarQubeReport } from '../../../src/utils/formats/sonar.js';
import { convertToSarif } from '../../../src/utils/formats/sarif.js';
import { convertToCodeClimate } from '../../../src/utils/formats/codeclimate.js';
import { convertToJUnit, serializeJUnit } from '../../../src/utils/formats/junit.js';
import { convertToGitHubAnnotations, serializeGitHubAnnotations } from '../../../src/utils/formats/github.js';
import { countAtOrAboveThreshold } from '../../../src/utils/severity.js';
import { normalizePaths } from '../../../src/utils/normalizePaths.js';
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

describe('convertToCodeClimate unit tests', () => {
  it('should produce a CodeClimate-shaped issue array', () => {
    const out = convertToCodeClimate(mockAnalyzerInput);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'issue',
      check_name: 'AvoidOldSalesforceApiVersions',
      engine_name: 'regex',
      severity: 'critical',
      location: {
        path: 'force-app/main/default/classes/OldApi.cls',
        lines: { begin: 1, end: 1 },
      },
    });
    expect(out[0].fingerprint).toMatch(/^[a-f0-9]{32}$/);
  });

  it('should map analyzer severities to the CodeClimate scale', () => {
    const input: CodeAnalyzerOutput = {
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
    const out = convertToCodeClimate(input);
    expect(out.map((i) => i.severity)).toEqual(['blocker', 'critical', 'major', 'minor', 'info']);
  });

  it('should map tags to fixed CodeClimate categories', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'Sec',
          engine: 'pmd',
          severity: 2,
          tags: ['security', 'errorprone'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'Untagged',
          engine: 'pmd',
          severity: 3,
          tags: [],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'b.cls', startLine: 1 }],
        },
      ],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].categories).toEqual(expect.arrayContaining(['Security', 'Bug Risk']));
    expect(out[1].categories).toEqual(['Style']);
  });

  it('should ignore unrecognized tags and still fall back to Style', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'OnlyUnknown',
          engine: 'pmd',
          severity: 3,
          tags: ['some-future-tag', 'another-unknown'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'MixedKnownUnknown',
          engine: 'pmd',
          severity: 3,
          tags: ['some-future-tag', 'security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'b.cls', startLine: 1 }],
        },
      ],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].categories).toEqual(['Style']);
    expect(out[1].categories).toEqual(['Security']);
  });

  it('should produce stable fingerprints across runs', () => {
    const a = convertToCodeClimate(mockAnalyzerInput);
    const b = convertToCodeClimate(mockAnalyzerInput);
    expect(a[0].fingerprint).toBe(b[0].fingerprint);
  });

  it('should produce different fingerprints for different files', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'b.cls', startLine: 1 }],
        },
      ],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].fingerprint).not.toBe(out[1].fingerprint);
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
    const out = convertToCodeClimate(input);
    expect(out[0].location.path).toBe('force-app/main/default/classes/X.cls');
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
    const out = convertToCodeClimate(input);
    expect(out[0].location.lines).toEqual({ begin: 7, end: 7 });
  });

  it('should produce an empty array for empty input', () => {
    expect(convertToCodeClimate({ violations: [] })).toEqual([]);
  });
});

describe('convertToJUnit unit tests', () => {
  it('should produce a single testsuite per engine with one testcase per violation', () => {
    const report = convertToJUnit(mockAnalyzerInput);
    expect(report.tests).toBe(1);
    expect(report.failures).toBe(1);
    expect(report.testsuites).toHaveLength(1);
    expect(report.testsuites[0]).toMatchObject({
      name: 'regex',
      tests: 1,
      failures: 1,
    });
    expect(report.testsuites[0].testcases[0]).toMatchObject({
      classname: 'force-app/main/default/classes/OldApi.cls',
      name: 'AvoidOldSalesforceApiVersions:1',
      failure: { type: 'high' },
    });
  });

  it('should group violations into one testsuite per engine', () => {
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
        {
          rule: 'R3',
          engine: 'pmd',
          severity: 4,
          tags: ['style'],
          primaryLocationIndex: 0,
          message: 'another pmd issue',
          locations: [{ file: 'c.cls', startLine: 3 }],
        },
      ],
    };
    const report = convertToJUnit(input);
    expect(report.tests).toBe(3);
    expect(report.testsuites).toHaveLength(2);
    const pmd = report.testsuites.find((s) => s.name === 'pmd');
    const eslint = report.testsuites.find((s) => s.name === 'eslint');
    expect(pmd?.tests).toBe(2);
    expect(eslint?.tests).toBe(1);
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
    const report = convertToJUnit(input);
    expect(report.testsuites[0].testcases[0].classname).toBe('force-app/main/default/classes/X.cls');
  });

  it('should produce an empty report for empty input', () => {
    const report = convertToJUnit({ violations: [] });
    expect(report.tests).toBe(0);
    expect(report.failures).toBe(0);
    expect(report.testsuites).toHaveLength(0);
  });

  it('should include tags in the failure body when present', () => {
    const report = convertToJUnit(mockAnalyzerInput);
    expect(report.testsuites[0].testcases[0].failure.body).toContain('tags: maintainability');
  });

  it('should omit the tags line when there are no tags', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
      ],
    };
    const report = convertToJUnit(input);
    expect(report.testsuites[0].testcases[0].failure.body).not.toContain('tags:');
  });
});

describe('serializeJUnit unit tests', () => {
  it('should produce a valid XML document with the JUnit shape', () => {
    const xml = serializeJUnit(convertToJUnit(mockAnalyzerInput));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuites name="Salesforce Code Analyzer" tests="1" failures="1">');
    expect(xml).toContain('<testsuite name="regex" tests="1" failures="1">');
    expect(xml).toContain('<testcase classname="force-app/main/default/classes/OldApi.cls"');
    expect(xml).toContain('<failure type="high"');
    expect(xml.trim().endsWith('</testsuites>')).toBe(true);
  });

  it('should produce a self-contained empty <testsuites/> when there are no violations', () => {
    const xml = serializeJUnit(convertToJUnit({ violations: [] }));
    expect(xml).toContain('<testsuites name="Salesforce Code Analyzer" tests="0" failures="0">');
    expect(xml).toContain('</testsuites>');
    expect(xml).not.toContain('<testsuite ');
  });

  it('should escape XML-significant characters in attributes and text', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'Rule<&">',
          engine: 'pmd',
          severity: 2,
          tags: ['a&b'],
          primaryLocationIndex: 0,
          message: 'a < b && c > d "quoted"',
          locations: [{ file: 'path/with "quote"&amp.cls', startLine: 1 }],
        },
      ],
    };
    const xml = serializeJUnit(convertToJUnit(input));
    expect(xml).not.toContain('Rule<&">');
    expect(xml).toContain('Rule&lt;&amp;&quot;&gt;');
    expect(xml).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(xml).toContain('path/with &quot;quote&quot;&amp;amp.cls');
  });
});

describe('convertToGitHubAnnotations unit tests', () => {
  it('should produce one annotation per violation with mapped fields', () => {
    const out = convertToGitHubAnnotations(mockAnalyzerInput);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      level: 'error',
      file: 'force-app/main/default/classes/OldApi.cls',
      line: 1,
      endLine: 1,
      title: 'AvoidOldSalesforceApiVersions',
      message: 'Avoid using a Salesforce API version that is more than 3 years old.',
    });
  });

  it('should map analyzer severities to GitHub annotation levels', () => {
    const input: CodeAnalyzerOutput = {
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
    const out = convertToGitHubAnnotations(input);
    expect(out.map((a) => a.level)).toEqual(['error', 'error', 'warning', 'notice', 'notice']);
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
    const out = convertToGitHubAnnotations(input);
    expect(out[0].file).toBe('force-app/main/default/classes/X.cls');
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
    const out = convertToGitHubAnnotations(input);
    expect(out[0].line).toBe(7);
    expect(out[0].endLine).toBe(7);
  });

  it('should produce an empty array for empty input', () => {
    expect(convertToGitHubAnnotations({ violations: [] })).toEqual([]);
  });
});

describe('serializeGitHubAnnotations unit tests', () => {
  it('should render workflow command lines with the documented shape', () => {
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(mockAnalyzerInput));
    expect(out).toBe(
      '::error file=force-app/main/default/classes/OldApi.cls,line=1,endLine=1,title=AvoidOldSalesforceApiVersions::Avoid using a Salesforce API version that is more than 3 years old.\n',
    );
  });

  it('should produce an empty string for an empty annotation array', () => {
    expect(serializeGitHubAnnotations([])).toBe('');
  });

  it('should escape "%", ":", and "," in property values', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'rule:with,commas%signs',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'plain message',
          locations: [{ file: 'a:b,c%d.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out).toContain('file=a%3Ab%2Cc%25d.cls');
    expect(out).toContain('title=rule%3Awith%2Ccommas%25signs');
  });

  it('should escape "%" before other replacements (no double-encoding)', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: '%foo,bar',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out).toContain('title=%25foo%2Cbar');
    expect(out).not.toContain('%2525');
  });

  it('should NOT escape ":" or "," in the message body (only %, CR, LF)', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'see: a, b, c',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out.trimEnd().endsWith('::see: a, b, c')).toBe(true);
  });

  it('should encode CR/LF in message bodies as %0D / %0A', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'line1\nline2\r\nline3',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out).toContain('line1%0Aline2%0D%0Aline3');
  });

  it('should join multiple annotations with newlines (one per line)', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R1',
          engine: 'pmd',
          severity: 2,
          tags: ['security'],
          primaryLocationIndex: 0,
          message: 'm1',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
        {
          rule: 'R2',
          engine: 'pmd',
          severity: 4,
          tags: ['style'],
          primaryLocationIndex: 0,
          message: 'm2',
          locations: [{ file: 'b.cls', startLine: 2 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    const lines = out.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('::error ')).toBe(true);
    expect(lines[1].startsWith('::notice ')).toBe(true);
  });

  it('serializeGitHubAnnotations should emit all annotations when count is within limit', () => {
    const annotations = convertToGitHubAnnotations(mockAnalyzerInput);
    const out = serializeGitHubAnnotations(annotations.slice(0, 50));
    expect(out.trimEnd().split('\n')).toHaveLength(annotations.length);
  });

  it('slicing annotations to max-annotations cap should truncate output', () => {
    const input: CodeAnalyzerOutput = {
      violations: Array.from({ length: 5 }, (_, i) => ({
        rule: `R${i}`,
        engine: 'pmd',
        severity: 2,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: `msg${i}`,
        locations: [{ file: `file${i}.cls`, startLine: i + 1 }],
      })),
    };
    const all = convertToGitHubAnnotations(input);
    expect(all).toHaveLength(5);
    const capped = all.slice(0, 3);
    const out = serializeGitHubAnnotations(capped);
    expect(out.trimEnd().split('\n')).toHaveLength(3);
  });
});

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

describe('normalizePaths unit tests', () => {
  const buildInput = (file: string): CodeAnalyzerOutput => ({
    violations: [
      {
        rule: 'R',
        engine: 'pmd',
        severity: 2,
        tags: ['security'],
        primaryLocationIndex: 0,
        message: 'msg',
        locations: [{ file, startLine: 1 }],
      },
    ],
  });

  it('should return the input unchanged when no options are set', () => {
    const input = buildInput('/abs/path/file.cls');
    expect(normalizePaths(input, {})).toBe(input);
  });

  it('should strip a literal prefix from each path', () => {
    const input = buildInput('/home/runner/work/repo/repo/force-app/main/default/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/home/runner/work/repo/repo/' });
    expect(out.violations[0].locations[0].file).toBe('force-app/main/default/X.cls');
  });

  it('should normalize backslashes in both prefix and path before comparing', () => {
    const input = buildInput('C:\\Users\\me\\repo\\src\\X.cls');
    const out = normalizePaths(input, { stripPrefix: 'C:\\Users\\me\\repo' });
    expect(out.violations[0].locations[0].file).toBe('src/X.cls');
  });

  it('should accept a prefix with or without a trailing slash', () => {
    const a = normalizePaths(buildInput('/repo/src/X.cls'), { stripPrefix: '/repo' });
    const b = normalizePaths(buildInput('/repo/src/X.cls'), { stripPrefix: '/repo/' });
    expect(a.violations[0].locations[0].file).toBe('src/X.cls');
    expect(b.violations[0].locations[0].file).toBe('src/X.cls');
  });

  it('should leave paths unchanged when the prefix does not match', () => {
    const input = buildInput('/different/path/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/repo/' });
    expect(out.violations[0].locations[0].file).toBe('/different/path/X.cls');
  });

  it('should NOT strip a prefix that is only a partial path component match', () => {
    // '/repo' should NOT match the start of '/reports/X.cls'
    const input = buildInput('/reports/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations[0].file).toBe('/reports/X.cls');
  });

  it('should leave the path unchanged when it equals the prefix exactly (no valid relative path)', () => {
    // A file path identical to the prefix has no meaningful relative form — return as-is
    // rather than producing an empty string that all downstream formatters would mishandle.
    const input = buildInput('/repo');
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations[0].file).toBe('/repo');
  });

  it('should handle multi-violation, multi-location inputs', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R1',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [
            { file: '/repo/a.cls', startLine: 1 },
            { file: '/repo/b.cls', startLine: 2 },
          ],
        },
        {
          rule: 'R2',
          engine: 'pmd',
          severity: 3,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: '/repo/c.cls', startLine: 3 }],
        },
      ],
    };
    const out = normalizePaths(input, { stripPrefix: '/repo' });
    expect(out.violations[0].locations.map((l) => l.file)).toEqual(['a.cls', 'b.cls']);
    expect(out.violations[1].locations[0].file).toBe('c.cls');
  });

  it('should not mutate the original input', () => {
    const input = buildInput('/repo/X.cls');
    const originalFile = input.violations[0].locations[0].file;
    normalizePaths(input, { stripPrefix: '/repo/' });
    expect(input.violations[0].locations[0].file).toBe(originalFile);
  });

  it('should ignore an empty stripPrefix', () => {
    const input = buildInput('/repo/X.cls');
    const out = normalizePaths(input, { stripPrefix: '' });
    expect(out).toBe(input);
  });

  it('should ignore a stripPrefix that becomes empty after slash trimming', () => {
    const input = buildInput('/repo/X.cls');
    const out = normalizePaths(input, { stripPrefix: '/' });
    expect(out).toBe(input);
  });
});

describe('normalizePaths --project-relative integration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    // Use realpath so the temp dir matches what process.cwd() reports on
    // macOS, where /var/folders/... is a symlink to /private/var/folders/...
    tempDir = await realpath(await mkdtemp(join(tmpdir(), 'sf-cat-proj-')));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should resolve the SFDX project root from sfdx-project.json and strip it', async () => {
    const projectDir = join(tempDir, 'my-sfdx-project');
    const subDir = join(projectDir, 'force-app', 'main', 'default');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(projectDir, 'sfdx-project.json'), '{"packageDirectories":[]}');

    process.chdir(subDir);

    const projectDirNormalized = projectDir.replace(/\\/g, '/');
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: `${projectDirNormalized}/force-app/main/default/X.cls`, startLine: 1 }],
        },
      ],
    };

    const out = normalizePaths(input, { projectRelative: true });
    expect(out.violations[0].locations[0].file).toBe('force-app/main/default/X.cls');
  });

  it('should throw a helpful error when no sfdx-project.json is found above cwd', () => {
    process.chdir(tempDir);
    expect(() =>
      normalizePaths(
        {
          violations: [
            {
              rule: 'R',
              engine: 'pmd',
              severity: 2,
              tags: [],
              primaryLocationIndex: 0,
              message: 'm',
              locations: [{ file: '/x.cls', startLine: 1 }],
            },
          ],
        },
        { projectRelative: true },
      ),
    ).toThrow(/sfdx-project\.json/);
  });
});
