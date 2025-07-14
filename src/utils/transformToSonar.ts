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
      1: 'MINOR',
      2: 'MAJOR',
      3: 'CRITICAL',
      4: 'BLOCKER',
      5: 'INFO',
    };

    // Construct rule if not already added
    if (!ruleMap.has(ruleId)) {
      ruleMap.set(ruleId, {
        id: ruleId,
        name: ruleId.replace(/([a-z])([A-Z])/g, '$1 $2'),
        description: v.message,
        engineId: v.engine,
        cleanCodeAttribute: 'FORMATTED',
        type: 'CODE_SMELL',
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
      type: 'CODE_SMELL',
      primaryLocation: {
        message: v.message,
        filePath: loc.file.replace(/\\/g, '/'),
        textRange: {
          startLine: loc.startLine,
          startColumn: loc.startColumn,
          endLine: loc.endLine,
          endColumn: loc.endColumn,
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
