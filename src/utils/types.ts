/**
 * `file`/`startLine` are optional because Code Analyzer core emits a
 * location-less violation (an `UndefinedCodeLocation`, serialized with no
 * `file`/`startLine`/`startColumn`/`endLine`/`endColumn` keys at all) when an
 * engine fails to instantiate or throws unexpectedly mid-run — see the
 * `UninstantiableEngineError` / `UnexpectedEngineError` synthetic violations
 * in `@salesforce/code-analyzer-core`. Every consumer of `ViolationLocation`
 * must go through `resolveFile`/`resolveStartLine`/`resolveEndLine` in
 * `./location.js` rather than assuming these fields are present.
 */
export type ViolationLocation = {
  file?: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

export type Violation = {
  rule: string;
  engine: string;
  severity: number;
  tags: string[];
  primaryLocationIndex: number;
  locations: ViolationLocation[];
  message: string;
};

export type CodeAnalyzerOutput = {
  violations: Violation[];
};

export type TransformResult = {
  path: string;
  violations: number;
  failures: number;
};
