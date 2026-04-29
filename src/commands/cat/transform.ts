'use strict';

import { readFile, writeFile } from 'node:fs/promises';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { CodeAnalyzerOutput, TransformResult } from '../../utils/types.js';
import { OUTPUT_FORMATS, OutputFormat, defaultOutputFiles, formatters } from '../../utils/formats/index.js';

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
  };

  public async run(): Promise<TransformResult> {
    const { flags } = await this.parse(TransformerTransform);
    const format = flags.format;
    const outputPath = flags['output-file'] ?? defaultOutputFiles[format];

    const raw = await readFile(flags['input-file'], 'utf8');
    const input = JSON.parse(raw) as CodeAnalyzerOutput;
    const report = formatters[format](input);

    await writeFile(outputPath, JSON.stringify(report, null, 2));
    return { path: outputPath };
  }
}
