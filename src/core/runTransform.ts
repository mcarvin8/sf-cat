import { readFile, writeFile } from 'node:fs/promises';
import { GitHubAnnotationReport } from '../utils/formats/github.js';
import { defaultOutputFiles, formatters, OutputFormat, STDOUT_SENTINEL } from '../utils/formats/index.js';
import { normalizePaths } from '../utils/normalizePaths.js';
import { countAtOrAboveThreshold, FailOnThreshold } from '../utils/severity.js';
import { CodeAnalyzerOutput, TransformResult } from '../utils/types.js';

export type RunTransformOptions = {
  inputFile: string;
  outputFile?: string;
  format: OutputFormat;
  failOn: FailOnThreshold;
  stripPrefix?: string;
  projectRelative?: boolean;
  maxAnnotations?: number;
  warn?: (msg: string) => void;
};

/**
 * Core transform logic shared by the `sf cat transform` command and the
 * standalone GitHub Action - both are thin wrappers around this function
 * that differ only in how flags/inputs are read and how results are reported.
 */
export async function runTransform({
  inputFile,
  outputFile,
  format,
  failOn,
  stripPrefix,
  projectRelative = false,
  maxAnnotations = 50,
  warn = (_msg: string): void => {
    /* noop default */
  },
}: RunTransformOptions): Promise<TransformResult> {
  const outputPath = outputFile ?? defaultOutputFiles[format];

  const raw = await readFile(inputFile, 'utf8');
  const parsed = JSON.parse(raw) as CodeAnalyzerOutput;

  const input = normalizePaths(parsed, { stripPrefix, projectRelative });

  const handler = formatters[format];
  let converted = handler.convert(input);

  if (format === 'github') {
    const annotations = converted as GitHubAnnotationReport;
    if (annotations.length > maxAnnotations) {
      const dropped = annotations.length - maxAnnotations;
      warn(
        `${annotations.length} annotations generated; only the first ${maxAnnotations} will be emitted (${dropped} dropped). GitHub silently drops annotations beyond its per-step cap. Increase --max-annotations or use --format sarif/junit for a full artifact.`,
      );
      converted = annotations.slice(0, maxAnnotations);
    }
  }

  const serialized = handler.serialize(converted);

  if (outputPath === STDOUT_SENTINEL) {
    process.stdout.write(serialized);
  } else {
    await writeFile(outputPath, serialized);
  }

  const failures = countAtOrAboveThreshold(input.violations, failOn);
  if (failures > 0) {
    warn(
      `Found ${failures} violation${failures === 1 ? '' : 's'} at severity '${failOn}' or higher; exiting with code 1.`,
    );
  }

  return {
    path: outputPath,
    violations: input.violations.length,
    failures,
  };
}
