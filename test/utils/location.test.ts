import { describe, expect, it } from 'vitest';
import { resolveEndLine, resolveFile, resolveStartLine, UNKNOWN_FILE, UNKNOWN_LINE } from '../../src/utils/location.js';

describe('resolveFile unit tests', () => {
  it('should return the location file when present', () => {
    expect(resolveFile({ file: 'a.cls' })).toBe('a.cls');
  });

  it('should fall back to UNKNOWN_FILE when file is absent', () => {
    expect(resolveFile({})).toBe(UNKNOWN_FILE);
  });
});

describe('resolveStartLine unit tests', () => {
  it('should return the location startLine when present', () => {
    expect(resolveStartLine({ startLine: 42 })).toBe(42);
  });

  it('should fall back to UNKNOWN_LINE when startLine is absent', () => {
    expect(resolveStartLine({})).toBe(UNKNOWN_LINE);
  });

  it('should treat startLine 0 as present (not fall back)', () => {
    expect(resolveStartLine({ startLine: 0 })).toBe(0);
  });
});

describe('resolveEndLine unit tests', () => {
  it('should return the location endLine when present', () => {
    expect(resolveEndLine({ startLine: 1, endLine: 5 })).toBe(5);
  });

  it('should fall back to startLine when endLine is absent', () => {
    expect(resolveEndLine({ startLine: 3 })).toBe(3);
  });

  it('should fall back to UNKNOWN_LINE when both startLine and endLine are absent', () => {
    expect(resolveEndLine({})).toBe(UNKNOWN_LINE);
  });
});
