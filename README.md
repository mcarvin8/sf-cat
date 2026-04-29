# sf-cat

[![NPM](https://img.shields.io/npm/v/sf-cat.svg?label=sf-cat)](https://www.npmjs.com/package/sf-cat)
[![Downloads/week](https://img.shields.io/npm/dw/sf-cat.svg)](https://npmjs.org/package/sf-cat)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/sf-cat/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)
[![codecov](https://codecov.io/gh/mcarvin8/sf-cat/graph/badge.svg?token=ENF0XXJGEM)](https://codecov.io/gh/mcarvin8/sf-cat)

A Salesforce CLI plugin that converts Salesforce Code Analyzer output into formats consumable by external code quality platforms — so you can surface Salesforce findings in SonarQube, GitHub Code Scanning, Azure DevOps, GitLab, and other SARIF-aware tools alongside the rest of your stack.

- [Install](#install)
- [Why sf-cat?](#why-sf-cat)
- [Quick Start](#quick-start)
  - [SonarQube](#sonarqube)
  - [SARIF (GitHub Code Scanning, Azure DevOps, GitLab, ...)](#sarif-github-code-scanning-azure-devops-gitlab-)
  - [CodeClimate / GitLab Code Quality](#codeclimate--gitlab-code-quality)
- [Command Reference](#command-reference)
  - [`sf cat transform`](#sf-cat-transform)
- [Column Data Handling](#column-data-handling)
- [Issues](#issues)
- [License](#license)

## Install

```bash
sf plugins install sf-cat@latest
```

## Why sf-cat?

**Salesforce Code Analyzer** scans Apex, Visualforce, Flows, and Lightning components using PMD, ESLint, RetireJS, and Salesforce Graph Engine — catching security issues, performance problems, and best-practice violations.

External code quality platforms — **SonarQube**, **GitHub Code Scanning**, **Azure DevOps**, **GitLab**, **Qodana**, etc. — are where many teams centralize results: CI pipelines, PR checks, and dashboards.

The problem: Code Analyzer output isn't compatible with any of them out of the box.

**sf-cat** bridges the gap by converting Code Analyzer JSON to:

- [SonarQube Generic Issue Data](https://docs.sonarsource.com/sonarqube-cloud/enriching/generic-issue-data/)
- [SARIF v2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) (GitHub Code Scanning, Azure DevOps, GitLab, Qodana, and any SARIF-aware tool)
- [CodeClimate JSON](https://github.com/codeclimate/platform/blob/master/spec/analyzers/SPEC.md#data-types) (GitLab [Code Quality](https://docs.gitlab.com/ee/ci/testing/code_quality.html), CodeClimate engines)

## Quick Start

**Run Salesforce Code Analyzer first** (JSON output):

```bash
sf code-analyzer run --workspace "./force-app/main/default/" --rule-selector Recommended -f "output.json"
```

### SonarQube

**1. Convert to SonarQube format:**

```bash
sf cat transform -i "output.json" -o "results.json"
```

**2. Run SonarQube** with the converted issues.

In `sonar-project.properties`:

```properties
sonar.externalIssuesReportPaths=results.json
```

Or via CLI:

```bash
sonar-scanner -Dsonar.externalIssuesReportPaths=results.json
```

### SARIF (GitHub Code Scanning, Azure DevOps, GitLab, ...)

**1. Convert to SARIF:**

```bash
sf cat transform -i "output.json" -f sarif -o "results.sarif"
```

Each Code Analyzer engine (PMD, ESLint, RetireJS, SFGE, regex, ...) is emitted as its own SARIF `run`, so consumers display them as distinct tools.

**2. Upload to GitHub Code Scanning** in a workflow:

```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

The same file can be consumed by Azure DevOps' SARIF extension, GitLab's `sast` artifact (via conversion), Qodana, and any other SARIF v2.1.0–compatible tool.

### CodeClimate / GitLab Code Quality

**1. Convert to CodeClimate JSON:**

```bash
sf cat transform -i "output.json" -f codeclimate
```

The default output path is `gl-code-quality-report.json`, the conventional filename for GitLab Code Quality reports. Each issue includes a stable `fingerprint` so GitLab can dedupe across pipeline runs.

**2. Publish from `.gitlab-ci.yml`:**

```yaml
sf-cat:
  script:
    - sf code-analyzer run --workspace ./force-app/main/default/ --rule-selector Recommended -f analyzer.json
    - sf cat transform -i analyzer.json -f codeclimate
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

The same file can be consumed by stand-alone CodeClimate engines or any tool that accepts the CodeClimate issue array spec.

## Command Reference

### `sf cat transform`

| Flag            | Short | Description                                                                                             |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `--input-file`  | `-i`  | Path to the JSON file from Salesforce Code Analyzer (required)                                          |
| `--format`      | `-f`  | Output format: `sonar` (default), `sarif`, or `codeclimate`                                             |
| `--output-file` | `-o`  | Path for the converted output (default: `output.json` / `output.sarif` / `gl-code-quality-report.json`) |

**Examples:**

```bash
sf cat transform -i "salesforce-code-analyzer.json" -o "sonar.json"
sf cat transform -i "salesforce-code-analyzer.json" -f sarif
sf cat transform -i "salesforce-code-analyzer.json" -f sarif -o "results.sarif"
sf cat transform -i "salesforce-code-analyzer.json" -f codeclimate
```

## Column Data Handling

Salesforce Code Analyzer sometimes reports `startColumn` and `endColumn` values that exceed the actual line length. SonarQube rejects these and fails the scan.

**sf-cat** strips column values from all issues before output. Line-level highlighting is preserved; all column data is removed so out-of-bounds column data don't cause downstream scans to fail.

## Issues

Found a bug or have an idea? Open an [issue](https://github.com/mcarvin8/sf-cat/issues).

## License

[MIT](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
