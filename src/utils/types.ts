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

export type SonarQubeIssue = {
  ruleId: string;
  effortMinutes: number;
  primaryLocation: {
    message: string;
    filePath: string;
    textRange: {
      startLine: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
    };
  };
};

type Impacts = {
  softwareQuality: string;
  severity: string;
};

export type SonarQubeRule = {
  id: string;
  name: string;
  description: string;
  engineId: string;
  cleanCodeAttribute: string;
  type: string;
  severity: string;
  impacts: Impacts[];
};

export type TransformResult = {
  path: string;
};
