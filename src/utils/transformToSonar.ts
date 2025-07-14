import { readFile, writeFile } from 'node:fs/promises';
import { SonarQubeIssue, SonarQubeRule, CodeAnalyzerOutput } from './types.js';

export async function convertToSonarQubeFormat(inputPath: string, outputPath: string): Promise<void> {
  const raw = await readFile(inputPath, 'utf8');
  const input = JSON.parse(raw) as CodeAnalyzerOutput;

  const ruleMap = new Map<string, SonarQubeRule>();
  const issues: SonarQubeIssue[] = [];

  for (const v of input.violations) {
    const ruleId = v.rule;
    const severityMap: Record<number, string> = {
      1: 'BLOCKER', // Critical
      2: 'CRITICAL', // High
      3: 'MAJOR', // Moderate
      4: 'MINOR', // Low
      5: 'INFO', // Info
    };
    const issueType = mapIssueType(v.tags);
    // Construct rule if not already added
    if (!ruleMap.has(ruleId)) {
      ruleMap.set(ruleId, {
        id: ruleId,
        name: ruleId.replace(/([a-z])([A-Z])/g, '$1 $2'),
        description: v.message,
        engineId: v.engine,
        cleanCodeAttribute: 'FORMATTED',
        type: issueType,
        severity: severityMap[v.severity] || 'MAJOR',
        impacts: v.tags.map((tag) => ({
          softwareQuality: tag.toUpperCase(),
          severity: 'MEDIUM',
        })),
      });
    }

    const loc = v.locations[v.primaryLocationIndex];
    const issue: SonarQubeIssue = {
      ruleId,
      engineId: v.engine,
      severity: severityMap[v.severity] || 'MAJOR',
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
    };

    issues.push(issue);
  }

  const output = {
    rules: Array.from(ruleMap.values()),
    issues,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2));
}
/*
Map issue types to the COMMON_TAGS
https://github.com/forcedotcom/code-analyzer-core/blob/dev/packages/code-analyzer-engine-api/src/rules.ts
*/
function mapIssueType(tags: string[]): 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));

  if (tagSet.has('security')) return 'VULNERABILITY'; // SECURITY → VULNERABILITY
  if (tagSet.has('errorprone')) return 'BUG'; // ERROR_PRONE → BUG
  return 'CODE_SMELL'; // Everything else → CODE_SMELL
}
