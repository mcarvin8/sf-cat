'use strict';

import { Messages } from '@salesforce/core';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { runTransform } from '../../core/runTransform.js';
import { OUTPUT_FORMATS, OutputFormat } from '../../utils/formats/index.js';
import { FAIL_ON_THRESHOLDS, FailOnThreshold } from '../../utils/severity.js';
import { TransformResult } from '../../utils/types.js';

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

    const result = await runTransform({
      inputFile: flags['input-file'],
      outputFile: flags['output-file'],
      format: flags.format,
      failOn: flags['fail-on'],
      stripPrefix: flags['strip-prefix'],
      projectRelative: flags['project-relative'],
      maxAnnotations: flags['max-annotations'],
      warn: this.warn.bind(this),
    });

    if (result.failures > 0) {
      process.exitCode = 1;
    }

    return result;
  }
}
