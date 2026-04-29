import { CodeAnalyzerOutput } from '../types.js';
import { convertToSonarQube } from './sonar.js';
import { convertToSarif } from './sarif.js';

export const OUTPUT_FORMATS = ['sonar', 'sarif'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const formatters: Record<OutputFormat, (input: CodeAnalyzerOutput) => unknown> = {
  sonar: convertToSonarQube,
  sarif: convertToSarif,
};

export const defaultExtensions: Record<OutputFormat, string> = {
  sonar: '.json',
  sarif: '.sarif',
};

export const defaultOutputFiles: Record<OutputFormat, string> = {
  sonar: 'output.json',
  sarif: 'output.sarif',
};
