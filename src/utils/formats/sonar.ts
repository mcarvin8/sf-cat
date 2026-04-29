import { CodeAnalyzerOutput } from '../types.js';
import { mapIssueType, normalizeSeverity, sonarSeverity, IssueType } from '../severity.js';

export type SonarQubeIssue = {
  ruleId: string;
  engineId: string;
  severity: string;
  effortMinutes: number;
  type: IssueType;
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
  type: IssueType;
  severity: string;
  impacts: Impacts[];
};

export type SonarQubeReport = {
  rules: SonarQubeRule[];
  issues: SonarQubeIssue[];
};

export function convertToSonarQube(input: CodeAnalyzerOutput): SonarQubeReport {
  const ruleMap = new Map<string, SonarQubeRule>();
  const issues: SonarQubeIssue[] = [];

  for (const v of input.violations) {
    const ruleId = v.rule;
    const severity = sonarSeverity[normalizeSeverity(v.severity)];
    const issueType = mapIssueType(v.tags);

    if (!ruleMap.has(ruleId)) {
      ruleMap.set(ruleId, {
        id: ruleId,
        name: ruleId.replace(/([a-z])([A-Z])/g, '$1 $2'),
        description: v.message,
        engineId: v.engine,
        cleanCodeAttribute: 'FORMATTED',
        type: issueType,
        severity,
        impacts: v.tags.map((tag) => ({
          softwareQuality: tag.toUpperCase(),
          severity: 'MEDIUM',
        })),
      });
    }

    const loc = v.locations[v.primaryLocationIndex];
    issues.push({
      ruleId,
      engineId: v.engine,
      severity,
      effortMinutes: 5,
      type: issueType,
      primaryLocation: {
        message: v.message,
        filePath: loc.file.replace(/\\/g, '/'),
        textRange: {
          startLine: loc.startLine,
          endLine: loc.endLine,
        },
      },
    });
  }

  return {
    rules: Array.from(ruleMap.values()),
    issues,
  };
}
