'use strict';

import { readFile, writeFile } from 'node:fs/promises';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { CodeAnalyzerOutput, TransformResult } from '../../utils/types.js';
import {
  OUTPUT_FORMATS,
  OutputFormat,
  STDOUT_SENTINEL,
  defaultOutputFiles,
  formatters,
} from '../../utils/formats/index.js';
import { GitHubAnnotationReport } from '../../utils/formats/github.js';
import { FAIL_ON_THRESHOLDS, FailOnThreshold, countAtOrAboveThreshold } from '../../utils/severity.js';
import { normalizePaths } from '../../utils/normalizePaths.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('sf-cat', 'transformer.transform');

export default class TransformerTransform extends SfCommand<TransformResult> {
  public static override readonly summary = messages.getMessage('summary');
  public static override readonly description = messages.getMessage('description');
  public static override readonly examples = messages.getMessages('examples');

  public static override readonly flags = {
    'input-file': Flags.file({
      summary: messages.getMessage('flags.input-file.summary'),
      char: 'i',
      required: true,
    }),
    'output-file': Flags.file({
      summary: messages.getMessage('flags.output-file.summary'),
      // eslint-disable-next-line sf-plugin/dash-o
      char: 'o',
    }),
    format: Flags.option({
      summary: messages.getMessage('flags.format.summary'),
      char: 'f',
      options: OUTPUT_FORMATS,
      default: 'sonar' as OutputFormat,
    })(),
    'fail-on': Flags.option({
      summary: messages.getMessage('flags.fail-on.summary'),
      options: FAIL_ON_THRESHOLDS,
      default: 'never' as FailOnThreshold,
    })(),
    'strip-prefix': Flags.string({
      summary: messages.getMessage('flags.strip-prefix.summary'),
      exclusive: ['project-relative'],
    }),
    'project-relative': Flags.boolean({
      summary: messages.getMessage('flags.project-relative.summary'),
      exclusive: ['strip-prefix'],
      default: false,
    }),
    'max-annotations': Flags.integer({
      summary: messages.getMessage('flags.max-annotations.summary'),
      default: 50,
      min: 1,
    }),
  };

  public async run(): Promise<TransformResult> {
    const { flags } = await this.parse(TransformerTransform);
    const format = flags.format;
    const outputPath = flags['output-file'] ?? defaultOutputFiles[format];

    const raw = await readFile(flags['input-file'], 'utf8');
    const parsed = JSON.parse(raw) as CodeAnalyzerOutput;

    const input = normalizePaths(parsed, {
      stripPrefix: flags['strip-prefix'],
      projectRelative: flags['project-relative'],
    });

    const handler = formatters[format];
    let converted = handler.convert(input);

    if (format === 'github') {
      const annotations = converted as GitHubAnnotationReport;
      const maxAnnotations = flags['max-annotations'];
      if (annotations.length > maxAnnotations) {
        const dropped = annotations.length - maxAnnotations;
        this.warn(
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

    const failures = countAtOrAboveThreshold(input.violations, flags['fail-on']);
    if (failures > 0) {
      process.exitCode = 1;
      this.warn(
        `Found ${failures} violation${failures === 1 ? '' : 's'} at severity '${flags['fail-on']}' or higher; exiting with code 1.`,
      );
    }

    return {
      path: outputPath,
      violations: input.violations.length,
      failures,
    };
  }
}
