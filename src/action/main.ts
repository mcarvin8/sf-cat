'use strict';

import * as core from '@actions/core';
import { runTransform } from '../core/runTransform.js';
import { OUTPUT_FORMATS, OutputFormat, STDOUT_SENTINEL } from '../utils/formats/index.js';
import { FAIL_ON_THRESHOLDS, FailOnThreshold } from '../utils/severity.js';

export async function run(): Promise<void> {
  try {
    const inputFile = core.getInput('input-file', { required: true });
    const outputFileInput = core.getInput('output-file');
    const formatInput = core.getInput('format') || 'sonar';
    const failOnInput = core.getInput('fail-on') || 'never';
    const stripPrefixInput = core.getInput('strip-prefix');
    const projectRelative = core.getBooleanInput('project-relative');
    const maxAnnotationsInput = core.getInput('max-annotations') || '50';

    if (!isOutputFormat(formatInput)) {
      core.setFailed(`Invalid 'format' input '${formatInput}'. Must be one of: ${OUTPUT_FORMATS.join(', ')}.`);
      return;
    }
    if (!isFailOnThreshold(failOnInput)) {
      core.setFailed(`Invalid 'fail-on' input '${failOnInput}'. Must be one of: ${FAIL_ON_THRESHOLDS.join(', ')}.`);
      return;
    }
    if (stripPrefixInput !== '' && projectRelative) {
      core.setFailed("Inputs 'strip-prefix' and 'project-relative' are mutually exclusive.");
      return;
    }

    const maxAnnotations = Number(maxAnnotationsInput);
    if (!Number.isInteger(maxAnnotations) || maxAnnotations < 1) {
      core.setFailed(`Invalid 'max-annotations' input '${maxAnnotationsInput}'. Must be an integer >= 1.`);
      return;
    }

    const warnings: string[] = [];

    const result = await runTransform({
      inputFile,
      outputFile: outputFileInput === '' ? undefined : outputFileInput,
      format: formatInput,
      failOn: failOnInput,
      stripPrefix: stripPrefixInput === '' ? undefined : stripPrefixInput,
      projectRelative,
      maxAnnotations,
      warn: (msg) => warnings.push(msg),
    });

    core.setOutput('output-path', result.path === STDOUT_SENTINEL ? '' : result.path);
    core.setOutput('violations', result.violations);
    core.setOutput('failures', result.failures);
    core.setOutput('warnings', warnings.join('\n'));

    warnings.forEach((warning) => core.warning(warning));

    if (result.path === STDOUT_SENTINEL) {
      core.info('Transformed report written to stdout as GitHub Actions annotations.');
    } else {
      core.info(`Transformed report written to: ${result.path}`);
    }

    if (result.failures > 0) {
      core.setFailed(
        `Found ${result.failures} violation${result.failures === 1 ? '' : 's'} at severity '${failOnInput}' or higher.`,
      );
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}

function isFailOnThreshold(value: string): value is FailOnThreshold {
  return (FAIL_ON_THRESHOLDS as readonly string[]).includes(value);
}
