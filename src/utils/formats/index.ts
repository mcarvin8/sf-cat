import { CodeAnalyzerOutput } from '../types.js';
import { convertToSonarQube } from './sonar.js';
import { convertToSarif } from './sarif.js';
import { convertToCodeClimate } from './codeclimate.js';
import { convertToJUnit, serializeJUnit } from './junit.js';
import { convertToGitHubAnnotations, serializeGitHubAnnotations } from './github.js';

export const OUTPUT_FORMATS = ['sonar', 'sarif', 'codeclimate', 'junit', 'github'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Sentinel value for `defaultOutputFiles` that means "write to stdout instead
 * of a file." The transform command treats this as a special case.
 */
export const STDOUT_SENTINEL = '-';

export type FormatHandler = {
  convert: (input: CodeAnalyzerOutput) => unknown;
  serialize: (report: unknown) => string;
};

const jsonSerialize = (report: unknown): string => JSON.stringify(report, null, 2);

export const formatters: Record<OutputFormat, FormatHandler> = {
  sonar: { convert: convertToSonarQube, serialize: jsonSerialize },
  sarif: { convert: convertToSarif, serialize: jsonSerialize },
  codeclimate: { convert: convertToCodeClimate, serialize: jsonSerialize },
  junit: {
    convert: convertToJUnit,
    serialize: (report) => serializeJUnit(report as ReturnType<typeof convertToJUnit>),
  },
  github: {
    convert: convertToGitHubAnnotations,
    serialize: (report) => serializeGitHubAnnotations(report as ReturnType<typeof convertToGitHubAnnotations>),
  },
};

export const defaultExtensions: Record<OutputFormat, string> = {
  sonar: '.json',
  sarif: '.sarif',
  codeclimate: '.json',
  junit: '.xml',
  github: '',
};

export const defaultOutputFiles: Record<OutputFormat, string> = {
  sonar: 'output.json',
  sarif: 'output.sarif',
  codeclimate: 'gl-code-quality-report.json',
  junit: 'junit.xml',
  github: STDOUT_SENTINEL,
};
