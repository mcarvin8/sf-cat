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

export type GitHubLevel = 'error' | 'warning' | 'notice';

export const githubLevel: Record<NormalizedSeverity, GitHubLevel> = {
  critical: 'error',
  high: 'error',
  moderate: 'warning',
  low: 'notice',
  info: 'notice',
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

// SonarQube only accepts these three values for softwareQuality.
const TAG_TO_SONAR_QUALITY: Record<string, string> = {
  security: 'SECURITY',
  errorprone: 'RELIABILITY',
  reliability: 'RELIABILITY',
  performance: 'RELIABILITY',
  design: 'MAINTAINABILITY',
  documentation: 'MAINTAINABILITY',
  portability: 'MAINTAINABILITY',
  bestpractices: 'MAINTAINABILITY',
  codestyle: 'MAINTAINABILITY',
  maintainability: 'MAINTAINABILITY',
};

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

export const FAIL_ON_THRESHOLDS = ['critical', 'high', 'moderate', 'low', 'info', 'never'] as const;
export type FailOnThreshold = (typeof FAIL_ON_THRESHOLDS)[number];

const SEVERITY_RANK: Record<NormalizedSeverity, number> = {
  critical: 1,
  high: 2,
  moderate: 3,
  low: 4,
  info: 5,
};

/**
 * Counts violations whose normalized severity is at or higher than `threshold`.
 * Returns 0 when threshold === 'never'. Lower rank number = higher severity, so
 * "at or higher" means rank <= threshold rank.
 */
export function countAtOrAboveThreshold(
  violations: ReadonlyArray<{ severity: number }>,
  threshold: FailOnThreshold,
): number {
  if (threshold === 'never') return 0;
  const limit = SEVERITY_RANK[threshold];
  return violations.filter((v) => SEVERITY_RANK[normalizeSeverity(v.severity)] <= limit).length;
}

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
/**
 * Maps Code Analyzer tags to valid SonarQube softwareQuality values.
 * SonarQube rejects any value outside MAINTAINABILITY, RELIABILITY, SECURITY.
 * Deduplicates; falls back to ['MAINTAINABILITY'] when no tags match.
 */
export function mapSonarSoftwareQualities(tags: string[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const q = TAG_TO_SONAR_QUALITY[tag.toLowerCase()];
    if (q) out.add(q);
  }
  if (out.size === 0) out.add('MAINTAINABILITY');
  return Array.from(out);
}

export function mapIssueType(tags: string[]): IssueType {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  if (tagSet.has('security')) return 'VULNERABILITY';
  if (tagSet.has('errorprone')) return 'BUG';
  return 'CODE_SMELL';
}
