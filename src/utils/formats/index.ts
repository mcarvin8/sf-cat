import { CodeAnalyzerOutput } from '../types.js';
import { convertToSonarQube } from './sonar.js';
import { convertToSarif } from './sarif.js';
import { convertToCodeClimate } from './codeclimate.js';

export const OUTPUT_FORMATS = ['sonar', 'sarif', 'codeclimate'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const formatters: Record<OutputFormat, (input: CodeAnalyzerOutput) => unknown> = {
  sonar: convertToSonarQube,
  sarif: convertToSarif,
  codeclimate: convertToCodeClimate,
};

export const defaultExtensions: Record<OutputFormat, string> = {
  sonar: '.json',
  sarif: '.sarif',
  codeclimate: '.json',
};

export const defaultOutputFiles: Record<OutputFormat, string> = {
  sonar: 'output.json',
  sarif: 'output.sarif',
  codeclimate: 'gl-code-quality-report.json',
};
