import * as core from '@actions/core';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { run } from '../../src/action/main.js';
import { runTransform } from '../../src/core/runTransform.js';
import { STDOUT_SENTINEL } from '../../src/utils/formats/index.js';

vi.mock('@actions/core');
vi.mock('../../src/core/runTransform.js');

const runTransformMock = runTransform as unknown as Mock;
const getInputMock = core.getInput as unknown as Mock;
const getBooleanInputMock = core.getBooleanInput as unknown as Mock;

function stubInputs(inputs: Record<string, string>, booleanInputs: Record<string, boolean> = {}): void {
  getInputMock.mockImplementation((name: string) => inputs[name] ?? '');
  getBooleanInputMock.mockImplementation((name: string) => booleanInputs[name] ?? false);
}

const baseResult = { path: 'sonar.json', violations: 1, failures: 0 };

describe('GitHub Action entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps inputs to runTransform, defaulting format/fail-on/max-annotations', async () => {
    stubInputs({ 'input-file': 'analyzer.json' });
    runTransformMock.mockResolvedValue(baseResult);

    await run();

    expect(runTransformMock).toHaveBeenCalledWith({
      inputFile: 'analyzer.json',
      outputFile: undefined,
      format: 'sonar',
      failOn: 'never',
      stripPrefix: undefined,
      projectRelative: false,
      maxAnnotations: 50,
      warn: expect.any(Function),
    });
  });

  it('passes through non-default inputs', async () => {
    stubInputs(
      {
        'input-file': 'analyzer.json',
        'output-file': 'out.sarif',
        format: 'sarif',
        'fail-on': 'high',
        'strip-prefix': '/work/repo/',
        'max-annotations': '10',
      },
      { 'project-relative': false },
    );
    runTransformMock.mockResolvedValue(baseResult);

    await run();

    expect(runTransformMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outputFile: 'out.sarif',
        format: 'sarif',
        failOn: 'high',
        stripPrefix: '/work/repo/',
        maxAnnotations: 10,
      }),
    );
  });

  it('fails fast on an invalid format without calling runTransform', async () => {
    stubInputs({ 'input-file': 'analyzer.json', format: 'bogus' });

    await run();

    expect(runTransformMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid 'format' input 'bogus'"));
  });

  it('fails fast on an invalid fail-on threshold without calling runTransform', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'fail-on': 'bogus' });

    await run();

    expect(runTransformMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid 'fail-on' input 'bogus'"));
  });

  it('fails fast when strip-prefix and project-relative are both set', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'strip-prefix': '/work/repo/' }, { 'project-relative': true });

    await run();

    expect(runTransformMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith("Inputs 'strip-prefix' and 'project-relative' are mutually exclusive.");
  });

  it('fails fast on a non-integer max-annotations', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'max-annotations': 'abc' });

    await run();

    expect(runTransformMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid 'max-annotations' input 'abc'"));
  });

  it('fails fast on a max-annotations below 1', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'max-annotations': '0' });

    await run();

    expect(runTransformMock).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("Invalid 'max-annotations' input '0'"));
  });

  it('sets outputs and logs the written path on success', async () => {
    stubInputs({ 'input-file': 'analyzer.json' });
    runTransformMock.mockResolvedValue(baseResult);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith('output-path', 'sonar.json');
    expect(core.setOutput).toHaveBeenCalledWith('violations', 1);
    expect(core.setOutput).toHaveBeenCalledWith('failures', 0);
    expect(core.setOutput).toHaveBeenCalledWith('warnings', '');
    expect(core.info).toHaveBeenCalledWith('Transformed report written to: sonar.json');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reports an empty output-path and a stdout log message for the github stdout sentinel', async () => {
    stubInputs({ 'input-file': 'analyzer.json', format: 'github' });
    runTransformMock.mockResolvedValue({ path: STDOUT_SENTINEL, violations: 1, failures: 0 });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith('output-path', '');
    expect(core.info).toHaveBeenCalledWith('Transformed report written to stdout as GitHub Actions annotations.');
  });

  it('propagates warnings from the warn callback to core.warning and the warnings output', async () => {
    stubInputs({ 'input-file': 'analyzer.json' });
    runTransformMock.mockImplementation(async ({ warn }: { warn: (msg: string) => void }) => {
      warn('first warning');
      warn('second warning');
      return baseResult;
    });

    await run();

    expect(core.warning).toHaveBeenCalledWith('first warning');
    expect(core.warning).toHaveBeenCalledWith('second warning');
    expect(core.setOutput).toHaveBeenCalledWith('warnings', 'first warning\nsecond warning');
  });

  it('fails the action when failures are above zero', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'fail-on': 'high' });
    runTransformMock.mockResolvedValue({ path: 'sonar.json', violations: 2, failures: 2 });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("Found 2 violations at severity 'high' or higher.");
  });

  it('fails the action with a singular message for a single failure', async () => {
    stubInputs({ 'input-file': 'analyzer.json', 'fail-on': 'high' });
    runTransformMock.mockResolvedValue({ path: 'sonar.json', violations: 1, failures: 1 });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("Found 1 violation at severity 'high' or higher.");
  });

  it('fails the action with the error message when runTransform throws', async () => {
    stubInputs({ 'input-file': 'analyzer.json' });
    runTransformMock.mockRejectedValue(new Error('boom'));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('boom');
  });

  it('fails the action with String(error) when the thrown value is not an Error instance', async () => {
    stubInputs({ 'input-file': 'analyzer.json' });
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    runTransformMock.mockRejectedValue('a plain string rejection');

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('a plain string rejection');
  });
});
