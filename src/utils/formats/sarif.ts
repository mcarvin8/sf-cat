import type { Log, Result, ReportingDescriptor, Run } from 'sarif';
import { CodeAnalyzerOutput, Violation } from '../types.js';
import { mapIssueType, normalizeSeverity, sarifLevel } from '../severity.js';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';

const ENGINE_INFO_URI = 'https://developer.salesforce.com/docs/platform/salesforce-code-analyzer/guide/overview.html';

function buildRule(v: Violation): ReportingDescriptor {
  return {
    id: v.rule,
    name: v.rule,
    shortDescription: { text: v.message },
    fullDescription: { text: v.message },
    defaultConfiguration: {
      level: sarifLevel[normalizeSeverity(v.severity)],
    },
    properties: {
      tags: v.tags,
      issueType: mapIssueType(v.tags),
      analyzerSeverity: v.severity,
    },
  };
}

function buildResult(v: Violation): Result {
  const loc = v.locations[v.primaryLocationIndex];
  const startLine = loc.startLine;
  const endLine = loc.endLine ?? loc.startLine;

  return {
    ruleId: v.rule,
    level: sarifLevel[normalizeSeverity(v.severity)],
    message: { text: v.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: loc.file.replace(/\\/g, '/') },
          region: { startLine, endLine },
        },
      },
    ],
    properties: {
      tags: v.tags,
      issueType: mapIssueType(v.tags),
    },
  };
}

/**
 * Builds a SARIF v2.1.0 log from Code Analyzer output.
 *
 * Each engine (PMD, ESLint, RetireJS, SFGE, regex, etc.) becomes its own run
 * so consumers like GitHub Code Scanning surface them as distinct tools.
 */
export function convertToSarif(input: CodeAnalyzerOutput): Log {
  const byEngine = new Map<string, Violation[]>();
  for (const v of input.violations) {
    const list = byEngine.get(v.engine) ?? [];
    list.push(v);
    byEngine.set(v.engine, list);
  }

  const runs: Run[] = [];

  if (byEngine.size === 0) {
    runs.push({
      tool: {
        driver: {
          name: 'Salesforce Code Analyzer',
          informationUri: ENGINE_INFO_URI,
          rules: [],
        },
      },
      results: [],
    });
  }

  for (const [engine, violations] of byEngine) {
    const rules = new Map<string, ReportingDescriptor>();
    const results: Result[] = [];

    for (const v of violations) {
      if (!rules.has(v.rule)) {
        rules.set(v.rule, buildRule(v));
      }
      results.push(buildResult(v));
    }

    runs.push({
      tool: {
        driver: {
          name: `Salesforce Code Analyzer (${engine})`,
          informationUri: ENGINE_INFO_URI,
          rules: Array.from(rules.values()),
        },
      },
      results,
    });
  }

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs,
  };
}
