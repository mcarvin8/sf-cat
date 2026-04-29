export type NormalizedSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

export type IssueType = 'BUG' | 'VULNERABILITY' | 'CODE_SMELL';

export const severityFromAnalyzer: Record<number, NormalizedSeverity> = {
  1: 'critical',
  2: 'high',
  3: 'moderate',
  4: 'low',
  5: 'info',
};

export const sonarSeverity: Record<NormalizedSeverity, string> = {
  critical: 'BLOCKER',
  high: 'CRITICAL',
  moderate: 'MAJOR',
  low: 'MINOR',
  info: 'INFO',
};

export const sarifLevel: Record<NormalizedSeverity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  moderate: 'warning',
  low: 'note',
  info: 'note',
};

export type CodeClimateSeverity = 'info' | 'minor' | 'major' | 'critical' | 'blocker';

export const codeClimateSeverity: Record<NormalizedSeverity, CodeClimateSeverity> = {
  critical: 'blocker',
  high: 'critical',
  moderate: 'major',
  low: 'minor',
  info: 'info',
};

export type CodeClimateCategory =
  | 'Bug Risk'
  | 'Clarity'
  | 'Compatibility'
  | 'Complexity'
  | 'Duplication'
  | 'Performance'
  | 'Security'
  | 'Style';

const TAG_TO_CATEGORY: Record<string, CodeClimateCategory> = {
  security: 'Security',
  errorprone: 'Bug Risk',
  reliability: 'Bug Risk',
  performance: 'Performance',
  design: 'Complexity',
  documentation: 'Clarity',
  portability: 'Compatibility',
  bestpractices: 'Style',
  codestyle: 'Style',
  maintainability: 'Style',
};

/**
 * Maps Code Analyzer tags to the fixed CodeClimate category set. Returns at
 * least one category — falls back to "Style" when no tags match.
 */
export function mapCodeClimateCategories(tags: string[]): CodeClimateCategory[] {
  const out = new Set<CodeClimateCategory>();
  for (const tag of tags) {
    const cat = TAG_TO_CATEGORY[tag.toLowerCase()];
    if (cat) out.add(cat);
  }
  if (out.size === 0) out.add('Style');
  return Array.from(out);
}

export function normalizeSeverity(severity: number): NormalizedSeverity {
  return severityFromAnalyzer[severity] ?? 'moderate';
}

/**
 * Maps Salesforce Code Analyzer category tags to a coarse issue type.
 * SonarQube only supports: BUG, VULNERABILITY, CODE_SMELL — SARIF doesn't
 * require this but it's a useful normalized signal for any consumer.
 *
 * Aligned with COMMON_TAGS.CATEGORIES from code-analyzer-engine-api:
 * https://github.com/forcedotcom/code-analyzer-core/blob/dev/packages/code-analyzer-engine-api/src/rules.ts
 */
export function mapIssueType(tags: string[]): IssueType {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  if (tagSet.has('security')) return 'VULNERABILITY';
  if (tagSet.has('errorprone')) return 'BUG';
  return 'CODE_SMELL';
}
