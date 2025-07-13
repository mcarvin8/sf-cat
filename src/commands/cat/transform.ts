'use strict';

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { convertToSonarQubeFormat } from '../../utils/transformToSonar.js';
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
      // eslint-disable-next-line sf-plugin/dash-o
      char: 'o',
      required: true,
      default: 'output.json',
    }),
  };

  public async run(): Promise<TransformResult> {
    const { flags } = await this.parse(TransformerTransform);
    await convertToSonarQubeFormat(flags['input-file'], flags['output-file']);
    return { path: flags['output-file'] };
  }
}
