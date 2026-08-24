import { describe, expect, it } from 'vitest';
import { convertToCodeClimate } from '../../../src/utils/formats/codeclimate.js';
import { CodeAnalyzerOutput } from '../../../src/utils/types.js';
import { mkViolation, mockAnalyzerInput } from '../fixtures.js';

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
      violations: [1, 2, 3, 4, 5].map((sev, i) =>
        mkViolation({ rule: `R${sev}`, severity: sev, locations: [{ file: 'a.cls', startLine: i + 1 }] }),
      ),
    };
    const out = convertToCodeClimate(input);
    expect(out.map((i) => i.severity)).toEqual(['blocker', 'critical', 'major', 'minor', 'info']);
  });

  it('should map tags to fixed CodeClimate categories', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        mkViolation({ rule: 'Sec', tags: ['security', 'errorprone'] }),
        mkViolation({ rule: 'Untagged', severity: 3, tags: [], locations: [{ file: 'b.cls', startLine: 1 }] }),
      ],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].categories).toEqual(expect.arrayContaining(['Security', 'Bug Risk']));
    expect(out[1].categories).toEqual(['Style']);
  });

  it('should ignore unrecognized tags and still fall back to Style', () => {
    const input: CodeAnalyzerOutput = {
      violations: [
        mkViolation({ rule: 'OnlyUnknown', severity: 3, tags: ['some-future-tag', 'another-unknown'] }),
        mkViolation({
          rule: 'MixedKnownUnknown',
          severity: 3,
          tags: ['some-future-tag', 'security'],
          locations: [{ file: 'b.cls', startLine: 1 }],
        }),
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
      violations: [mkViolation(), mkViolation({ locations: [{ file: 'b.cls', startLine: 1 }] })],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].fingerprint).not.toBe(out[1].fingerprint);
  });

  it('should normalize Windows-style backslash paths to forward slashes', () => {
    const input: CodeAnalyzerOutput = {
      violations: [mkViolation({ locations: [{ file: 'force-app\\main\\default\\classes\\X.cls', startLine: 1 }] })],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].location.path).toBe('force-app/main/default/classes/X.cls');
  });

  it('should default missing endLine to startLine', () => {
    const input: CodeAnalyzerOutput = {
      violations: [mkViolation({ locations: [{ file: 'a.cls', startLine: 7 }] })],
    };
    const out = convertToCodeClimate(input);
    expect(out[0].location.lines).toEqual({ begin: 7, end: 7 });
  });

  it('should produce an empty array for empty input', () => {
    expect(convertToCodeClimate({ violations: [] })).toEqual([]);
  });
});

describe('convertToCodeClimate TAG_TO_CATEGORY completeness', () => {
  it('should map reliability tag to Bug Risk category', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['reliability'] })] });
    expect(out[0].categories).toContain('Bug Risk');
  });

  it('should map performance tag to Performance category', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['performance'] })] });
    expect(out[0].categories).toContain('Performance');
  });

  it('should map design tag to Complexity category', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['design'] })] });
    expect(out[0].categories).toContain('Complexity');
  });

  it('should map documentation tag to Clarity category', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['documentation'] })] });
    expect(out[0].categories).toContain('Clarity');
  });

  it('should map portability tag to Compatibility category', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['portability'] })] });
    expect(out[0].categories).toContain('Compatibility');
  });

  it('should map bestpractices tag to Style (verified without fallback masking)', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['bestpractices', 'security'] })] });
    expect(out[0].categories).toContain('Style');
    expect(out[0].categories).toContain('Security');
  });

  it('should map codestyle tag to Style (verified without fallback masking)', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['codestyle', 'security'] })] });
    expect(out[0].categories).toContain('Style');
    expect(out[0].categories).toContain('Security');
  });

  it('should map maintainability tag to Style (verified without fallback masking)', () => {
    const out = convertToCodeClimate({ violations: [mkViolation({ tags: ['maintainability', 'security'] })] });
    expect(out[0].categories).toContain('Style');
    expect(out[0].categories).toContain('Security');
  });
});
