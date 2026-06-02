import { describe, it, expect } from 'vitest';
import { convertToGitHubAnnotations, serializeGitHubAnnotations } from '../../../src/utils/formats/github.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { mockAnalyzerInput } from '../fixtures.js';

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

  it('should encode CR and LF in property values (file path)', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'm',
          locations: [{ file: 'force-app\r\nmain/X.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out).toContain('force-app%0D%0Amain/X.cls');
  });

  it('should encode % in message bodies as %25', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        {
          rule: 'R',
          engine: 'pmd',
          severity: 2,
          tags: [],
          primaryLocationIndex: 0,
          message: 'coverage is 80% today',
          locations: [{ file: 'x.cls', startLine: 1 }],
        },
      ],
    };
    const out = serializeGitHubAnnotations(convertToGitHubAnnotations(input));
    expect(out).toContain('coverage is 80%25 today');
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
