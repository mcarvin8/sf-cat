import { describe, it, expect } from 'vitest';
import { convertToJUnit, serializeJUnit } from '../../../src/utils/formats/junit.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { mockAnalyzerInput } from '../fixtures.js';

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

  it('should produce exact body lines with no blanks or unexpected content when tags present', () => {
    const report = convertToJUnit(mockAnalyzerInput);
    const body = report.testsuites[0].testcases[0].failure.body;
    expect(body.split('\n')).toEqual([
      'AvoidOldSalesforceApiVersions (regex, severity high)',
      'at force-app/main/default/classes/OldApi.cls:1',
      'Avoid using a Salesforce API version that is more than 3 years old.',
      'tags: maintainability',
    ]);
  });

  it('should produce exact body lines with no blanks or unexpected content when no tags', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'msg',
          locations: [{ file: 'a.cls', startLine: 3 }],
        },
      ],
    };
    const report = convertToJUnit(input);
    expect(report.testsuites[0].testcases[0].failure.body.split('\n')).toEqual([
      'R (pmd, severity high)',
      'at a.cls:3',
      'msg',
    ]);
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

  it('should include the rule+engine+severity in the failure body text', () => {
    const xml = serializeJUnit(convertToJUnit(mockAnalyzerInput));
    expect(xml).toContain('AvoidOldSalesforceApiVersions (regex, severity high)');
  });

  it('should include the file:line in the failure body text', () => {
    const xml = serializeJUnit(convertToJUnit(mockAnalyzerInput));
    expect(xml).toContain('at force-app/main/default/classes/OldApi.cls:1');
  });

  it('should include the rule and message in the failure message attribute', () => {
    const xml = serializeJUnit(convertToJUnit(mockAnalyzerInput));
    expect(xml).toContain('AvoidOldSalesforceApiVersions: Avoid using a Salesforce API version');
  });

  it('should join multiple tags with comma-space in the body', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: ['security', 'errorprone'],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: 'a.cls', startLine: 1 }],
        },
      ],
    };
    const report = convertToJUnit(input);
    expect(report.testsuites[0].testcases[0].failure.body).toContain('tags: security, errorprone');
  });

  it('should separate body lines with newlines', () => {
    const report = convertToJUnit(mockAnalyzerInput);
    const body = report.testsuites[0].testcases[0].failure.body;
    expect(body).toContain('AvoidOldSalesforceApiVersions (regex, severity high)\n');
  });
});
