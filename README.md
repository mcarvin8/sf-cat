# sf-cat

[![NPM](https://img.shields.io/npm/v/sf-cat.svg?label=sf-cat)](https://www.npmjs.com/package/sf-cat)
[![Downloads/week](https://img.shields.io/npm/dw/sf-cat.svg)](https://npmjs.org/package/sf-cat)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/sf-cat/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)
[![codecov](https://codecov.io/gh/mcarvin8/sf-cat/graph/badge.svg?token=ENF0XXJGEM)](https://codecov.io/gh/mcarvin8/sf-cat)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fmcarvin8%2Fsf-cat%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/mcarvin8/sf-cat/main)

A Salesforce CLI plugin that converts **Salesforce Code Analyzer** output into formats consumable by external code quality platforms — SonarQube, GitHub Code Scanning, Azure DevOps, GitLab, and any other SARIF-aware tool.

- [Install](#install)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
  - [SonarQube](#sonarqube)
  - [SARIF (GitHub Code Scanning, Azure DevOps, GitLab, ...)](#sarif-github-code-scanning-azure-devops-gitlab-)
  - [CodeClimate / GitLab Code Quality](#codeclimate--gitlab-code-quality)
  - [JUnit XML (Jenkins, GitHub Actions, GitLab, Azure DevOps, ...)](#junit-xml-jenkins-github-actions-gitlab-azure-devops-)
  - [GitHub Actions workflow commands (inline PR annotations, no GHAS)](#github-actions-workflow-commands-inline-pr-annotations-no-ghas)
- [Failing the Build on High-Severity Findings](#failing-the-build-on-high-severity-findings)
- [Path Normalization](#path-normalization)
- [Column Data Handling](#column-data-handling)
- [Command Reference](#command-reference)
- [Issues](#issues)
- [License](#license)

## Install

```bash
sf plugins install sf-cat@latest
```

Requires Salesforce CLI with **Code Analyzer v5** (`sf code-analyzer`).

## How It Works

**Salesforce Code Analyzer** scans Apex, Visualforce, Flows, and Lightning components using PMD, ESLint, RetireJS, and Salesforce Graph Engine. Its JSON output isn't directly compatible with any external code quality platform.

**sf-cat** is a single conversion step between Code Analyzer and your platform of choice:

```
sf code-analyzer run → JSON → sf cat transform → SonarQube / SARIF / CodeClimate / JUnit / GitHub
```

Supported output formats:

| Format        | Use with                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `sonar`       | SonarQube / SonarCloud generic issue data                                    |
| `sarif`       | GitHub Code Scanning, Azure DevOps, GitLab, Qodana                           |
| `codeclimate` | GitLab Code Quality, CodeClimate engines                                     |
| `junit`       | Jenkins, GitHub Actions, GitLab, Azure DevOps, CircleCI, Bitbucket Pipelines |
| `github`      | GitHub PR inline annotations (no GHAS required)                              |

## Quick Start

**Step 1 — Run Code Analyzer and save JSON output:**

```bash
sf code-analyzer run --workspace "./force-app/main/default/" --rule-selector Recommended --output-file "analyzer.json"
```

> Note: `sf code-analyzer run` uses `--output-file` (not `-f`) for the output path. sf-cat uses `-f` for output format — these are different flags on different commands.

**Step 2 — Convert with sf-cat:**

```bash
sf cat transform -i "analyzer.json" -f <format> -o "results.<ext>"
```

Platform-specific examples below.

### SonarQube

```bash
sf cat transform -i "analyzer.json" -o "sonar.json"
```

`sonar` is the default format, so `-f sonar` is optional.

In `sonar-project.properties`:

```properties
sonar.externalIssuesReportPaths=sonar.json
```

Or via CLI:

```bash
sonar-scanner -Dsonar.externalIssuesReportPaths=sonar.json
```

### SARIF (GitHub Code Scanning, Azure DevOps, GitLab, ...)

```bash
sf cat transform -i "analyzer.json" -f sarif -o "results.sarif"
```

Each Code Analyzer engine (PMD, ESLint, RetireJS, SFGE, ...) is emitted as a separate SARIF `run`, so consumers display them as distinct tools.

**Upload to GitHub Code Scanning:**

```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

The same SARIF file works with Azure DevOps' SARIF extension, GitLab `sast` artifacts, Qodana, and any other SARIF v2.1.0–compatible tool.

### CodeClimate / GitLab Code Quality

```bash
sf cat transform -i "analyzer.json" -f codeclimate
```

Default output path is `gl-code-quality-report.json` — the conventional filename for GitLab Code Quality reports. Each issue gets a stable `fingerprint` so GitLab deduplicates findings across pipeline runs.

**GitLab CI (`gitlab-ci.yml`):**

```yaml
sf-cat:
  script:
    - sf code-analyzer run --workspace ./force-app/main/default/ --rule-selector Recommended --output-file analyzer.json
    - sf cat transform -i analyzer.json -f codeclimate
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

### JUnit XML (Jenkins, GitHub Actions, GitLab, Azure DevOps, ...)

Use JUnit when your CI doesn't support SARIF (no GHAS, GitLab Free tier, etc.) or you want violations to appear in the standard CI test results panel.

```bash
sf cat transform -i "analyzer.json" -f junit
```

Each Code Analyzer engine becomes a `<testsuite>`; each violation becomes a failing `<testcase>`. Default output path is `junit.xml`.

**Jenkins:**

```groovy
junit 'junit.xml'
```

**GitHub Actions** (via [`dorny/test-reporter`](https://github.com/dorny/test-reporter)):

```yaml
- uses: dorny/test-reporter@v2
  if: always()
  with:
    name: Salesforce Code Analyzer
    path: junit.xml
    reporter: java-junit
```

**GitLab CI:**

```yaml
artifacts:
  reports:
    junit: junit.xml
```

**Azure DevOps:**

```yaml
- task: PublishTestResults@2
  inputs:
    testResultsFormat: JUnit
    testResultsFiles: junit.xml
```

### GitHub Actions workflow commands (inline PR annotations, no GHAS)

Use this when you want inline PR annotations on GitHub but don't have GitHub Advanced Security (which `upload-sarif` requires on private repos). The plugin prints `::error file=...,line=...::message` lines to stdout; the GitHub Actions runner renders them as annotations on the PR Files Changed view automatically.

```yaml
jobs:
  code-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g @salesforce/cli && sf plugins install sf-cat
      - run: sf code-analyzer run --workspace ./force-app/main/default/ --rule-selector Recommended --output-file analyzer.json
      - run: sf cat transform -i analyzer.json -f github
```

No `upload-sarif`, no Code Scanning configuration needed — works on every GitHub plan including free private repos and self-hosted runners.

Severity → annotation level: `Critical` / `High` → `error`, `Moderate` → `warning`, `Low` / `Info` → `notice`.

> **Note:** GitHub caps annotations at 10 errors / 10 warnings / 10 notices per workflow step and silently drops the rest. sf-cat enforces a default cap of 50 and prints a warning when violations exceed it. Use `--max-annotations` to adjust. For full results, also produce a SARIF or JUnit artifact in the same job.

## Failing the Build on High-Severity Findings

`--fail-on <severity>` lets `sf cat transform` act as a CI gate. The output file is written first (so artifact uploads in later steps still see it), then the process exits with code `1` if any violation meets or exceeds the threshold.

```bash
# Fail the job if any High or Critical violations exist; still write the SARIF artifact
sf cat transform -i analyzer.json -f sarif -o results.sarif --fail-on high
```

Severity ranking (highest → lowest): `critical` → `high` → `moderate` → `low` → `info`. Default is `never` (no failure).

## Path Normalization

Code Analyzer on CI runners often emits absolute file paths (e.g. `/home/runner/work/myrepo/myrepo/force-app/main/default/classes/MyClass.cls`). Most external tools — GitHub Code Scanning anchors, CodeClimate fingerprints, JUnit `classname` attributes — expect repo-relative paths and will silently fail to link annotations or generate inconsistent fingerprints across runs when given absolute paths.

Two flags normalize paths for every output format simultaneously:

```bash
# Strip a literal prefix
sf cat transform -i analyzer.json -f sarif --strip-prefix "/home/runner/work/myrepo/myrepo/"

# Auto-detect from sfdx-project.json (walks up from current directory)
sf cat transform -i analyzer.json -f sarif --project-relative
```

`--strip-prefix` and `--project-relative` are mutually exclusive — use whichever matches your CI setup.

## Column Data Handling

Code Analyzer sometimes reports `startColumn`/`endColumn` values that exceed the actual line length. Some external tools reject these values and fail the entire scan.

sf-cat strips all column values before output. Line-level highlighting is preserved; column data is dropped so out-of-bounds values don't cause downstream failures.

## Command Reference

### `sf cat transform`

| Flag                 | Short | Description                                                                                                                                                           |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--input-file`       | `-i`  | Path to the JSON file from Salesforce Code Analyzer (required)                                                                                                        |
| `--format`           | `-f`  | Output format: `sonar` (default), `sarif`, `codeclimate`, `junit`, or `github`                                                                                        |
| `--output-file`      | `-o`  | Path for converted output. Defaults: `output.json` (sonar), `output.sarif` (sarif), `gl-code-quality-report.json` (codeclimate), `junit.xml` (junit), stdout (github) |
| `--fail-on`          |       | Exit non-zero when any violation is at this severity or higher: `critical`, `high`, `moderate`, `low`, `info`, or `never` (default)                                   |
| `--strip-prefix`     |       | Strip a leading path prefix from every violation file path before formatting                                                                                          |
| `--project-relative` |       | Make every violation file path relative to the SFDX project root (`sfdx-project.json` location)                                                                       |
| `--max-annotations`  |       | Maximum annotations to emit for `--format github`. Default: `50`. Prints a warning and truncates when total exceeds this limit.                                       |

**Examples:**

```bash
sf cat transform -i "analyzer.json" -o "sonar.json"
sf cat transform -i "analyzer.json" -f sarif
sf cat transform -i "analyzer.json" -f sarif -o "results.sarif"
sf cat transform -i "analyzer.json" -f codeclimate
sf cat transform -i "analyzer.json" -f junit
sf cat transform -i "analyzer.json" -f github
sf cat transform -i "analyzer.json" --fail-on high
sf cat transform -i "analyzer.json" -f sarif --project-relative
sf cat transform -i "analyzer.json" -f sarif --strip-prefix "/home/runner/work/myrepo/myrepo/"
```

## Issues

Found a bug or have an idea? Open an [issue](https://github.com/mcarvin8/sf-cat/issues).

## License

[MIT](LICENSE.md)
