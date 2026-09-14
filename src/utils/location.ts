import { ViolationLocation } from './types.js';

/**
 * Placeholder values used when Code Analyzer emits a location-less violation.
 *
 * When an engine fails to instantiate or throws unexpectedly mid-run, Code
 * Analyzer core still writes a violation for it (rule `UninstantiableEngineError`
 * / `UnexpectedEngineError`, severity Critical) so the failure isn't silently
 * dropped — but that violation's location has no `file`/`startLine`/etc. Every
 * other location Code Analyzer produces always includes at least `file` and
 * `startLine`, so these fallbacks are only ever exercised by that edge case.
 */
export const UNKNOWN_FILE = '<unknown>';
export const UNKNOWN_LINE = 1;

/**
 * Returns a location's file path, or `UNKNOWN_FILE` when the location has
 * none (see module doc). Never throws, unlike dereferencing `loc.file` directly.
 */
export function resolveFile(loc: ViolationLocation): string {
  return loc.file ?? UNKNOWN_FILE;
}

/** Returns a location's start line, or `UNKNOWN_LINE` when the location has none. */
export function resolveStartLine(loc: ViolationLocation): number {
  return loc.startLine ?? UNKNOWN_LINE;
}

/** Returns a location's end line, falling back to its (resolved) start line when absent. */
export function resolveEndLine(loc: ViolationLocation): number {
  return loc.endLine ?? resolveStartLine(loc);
}
