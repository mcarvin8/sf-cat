import { describe, it, expect } from 'vitest';
import {
  STDOUT_SENTINEL,
  formatters,
  defaultExtensions,
  defaultOutputFiles,
  OUTPUT_FORMATS,
} from '../../../src/utils/formats/index.js';
import { convertToJUnit } from '../../../src/utils/formats/junit.js';
import { convertToGitHubAnnotations } from '../../../src/utils/formats/github.js';
import { mockAnalyzerInput } from '../fixtures.js';

describe('formats/index module constants', () => {
  it('STDOUT_SENTINEL is the dash character', () => {
    expect(STDOUT_SENTINEL).toBe('-');
  });

  it('OUTPUT_FORMATS includes all five supported formats', () => {
    expect(OUTPUT_FORMATS).toContain('sonar');
    expect(OUTPUT_FORMATS).toContain('sarif');
    expect(OUTPUT_FORMATS).toContain('codeclimate');
    expect(OUTPUT_FORMATS).toContain('junit');
    expect(OUTPUT_FORMATS).toContain('github');
  });

  it('formatters has a convert and serialize function for every output format', () => {
    for (const fmt of OUTPUT_FORMATS) {
      expect(typeof formatters[fmt].convert).toBe('function');
      expect(typeof formatters[fmt].serialize).toBe('function');
    }
  });

  it('formatters json serializers produce pretty-printed JSON', () => {
    expect(formatters.sonar.serialize({ rules: [], issues: [] })).toContain('"rules"');
    expect(formatters.sarif.serialize({ version: '2.1.0', runs: [] })).toContain('"version"');
    expect(formatters.codeclimate.serialize([])).toBe('[]');
  });

  it('formatters junit serializer delegates to serializeJUnit', () => {
    const report = convertToJUnit(mockAnalyzerInput);
    const xml = formatters.junit.serialize(report);
    expect(xml).toContain('<testsuites');
  });

  it('formatters github serializer delegates to serializeGitHubAnnotations', () => {
    const annotations = convertToGitHubAnnotations(mockAnalyzerInput);
    const out = formatters.github.serialize(annotations);
    expect(typeof out).toBe('string');
    expect(out).toContain('::error');
  });

  it('defaultExtensions maps all output formats to the correct file extension', () => {
    expect(defaultExtensions.sonar).toBe('.json');
    expect(defaultExtensions.sarif).toBe('.sarif');
    expect(defaultExtensions.codeclimate).toBe('.json');
    expect(defaultExtensions.junit).toBe('.xml');
    expect(defaultExtensions.github).toBe('');
  });

  it('defaultOutputFiles maps all output formats to the correct default filename', () => {
    expect(defaultOutputFiles.sonar).toBe('output.json');
    expect(defaultOutputFiles.sarif).toBe('output.sarif');
    expect(defaultOutputFiles.codeclimate).toBe('gl-code-quality-report.json');
    expect(defaultOutputFiles.junit).toBe('junit.xml');
    expect(defaultOutputFiles.github).toBe(STDOUT_SENTINEL);
  });
});
