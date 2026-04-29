export type ViolationLocation = {
  file: string;
  startLine: number;
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
};
