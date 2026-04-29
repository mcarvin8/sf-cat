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
  - [JUnit XML (Jenkins, GitHub Actions, GitLab, Azure DevOps, ...)](#junit-xml-jenkins-github-actions-gitlab-azure-devops-)
  - [GitHub Actions workflow commands (inline PR annotations, no GHAS)](#github-actions-workflow-commands-inline-pr-annotations-no-ghas)
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
- JUnit XML (Jenkins, GitHub Actions test reporters, GitLab, Azure DevOps, CircleCI, Bitbucket Pipelines, ...)
- [GitHub Actions workflow commands](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#setting-an-error-message) (inline PR annotations on GitHub — no Code Scanning / GHAS license required)

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

### JUnit XML (Jenkins, GitHub Actions, GitLab, Azure DevOps, ...)

Use this when your CI doesn't accept SARIF (no GHAS, GitLab Free, ...) or you simply want every violation to surface in the standard CI test report panel.

**1. Convert to JUnit XML:**

```bash
sf cat transform -i "output.json" -f junit
```

Each Code Analyzer engine becomes its own `<testsuite>`; each violation becomes a failing `<testcase>`. The default output path is `junit.xml`.

**Jenkins:**

```groovy
junit 'junit.xml'
```

**GitHub Actions** (with [`dorny/test-reporter`](https://github.com/dorny/test-reporter)):

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

Use this when you want **inline PR annotations on GitHub** but don't have GitHub Advanced Security enabled (which `upload-sarif` requires on private repos). The plugin prints `::error file=...,line=...::message` lines to stdout; the GitHub Actions runner captures them automatically and renders annotations on the PR Files Changed view.

**Workflow:**

```yaml
jobs:
  code-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g @salesforce/cli && sf plugins install sf-cat
      - run: sf code-analyzer run --workspace ./force-app/main/default/ --rule-selector Recommended -f analyzer.json
      - run: sf cat transform -i analyzer.json -f github
```

That's the entire setup — no `upload-sarif`, no Code Scanning configuration, works on every GitHub plan including free private repos and self-hosted runners.

Severity → annotation level: `Critical` / `High` → `error`, `Moderate` → `warning`, `Low` / `Info` → `notice`. The Code Analyzer rule id is used as the annotation title; the violation message is the body.

> Note: GitHub caps annotations at 10 errors / 10 warnings / 10 notices **per workflow step**. For larger result sets, also produce a SARIF or JUnit artifact in the same job — workflow commands are best for "show me the worst findings inline on this PR" while the artifact is your full record.

## Command Reference

### `sf cat transform`

| Flag                 | Short | Description                                                                                                                       |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--input-file`       | `-i`  | Path to the JSON file from Salesforce Code Analyzer (required)                                                                    |
| `--format`           | `-f`  | Output format: `sonar` (default), `sarif`, `codeclimate`, `junit`, or `github`                                                    |
| `--output-file`      | `-o`  | Path for the converted output. Defaults to a per-format filename; `github` writes to stdout when `-o` is omitted                  |
| `--fail-on`          |       | Exit non-zero when any violation has this severity or higher: `critical`, `high`, `moderate`, `low`, `info`, or `never` (default) |
| `--strip-prefix`     |       | Strip a leading prefix (e.g. `/home/runner/work/repo/repo/`) from every violation file path before formatting                     |
| `--project-relative` |       | Make every violation file path relative to the Salesforce DX project root (the directory containing `sfdx-project.json`)          |

**Examples:**

```bash
sf cat transform -i "salesforce-code-analyzer.json" -o "sonar.json"
sf cat transform -i "salesforce-code-analyzer.json" -f sarif
sf cat transform -i "salesforce-code-analyzer.json" -f sarif -o "results.sarif"
sf cat transform -i "salesforce-code-analyzer.json" -f codeclimate
sf cat transform -i "salesforce-code-analyzer.json" -f junit
sf cat transform -i "salesforce-code-analyzer.json" -f github
sf cat transform -i "salesforce-code-analyzer.json" --fail-on high
sf cat transform -i "salesforce-code-analyzer.json" --project-relative
```

## Failing the Build on High-Severity Findings

`--fail-on <severity>` makes `sf cat transform` itself act as the CI gate. The output file is written first (so artifact uploads in later steps still see it), then the process exits with code `1` if any violation meets or exceeds the threshold:

```bash
# Convert to SARIF and fail the job if any High or Critical violations exist
sf cat transform -i analyzer.json -f sarif -o results.sarif --fail-on high
```

Severity ranking (highest first): `critical` > `high` > `moderate` > `low` > `info`. The default is `never` (no failure).

## Path Normalization

Code Analyzer sometimes emits absolute file paths from CI runners (e.g. `/home/runner/work/myrepo/myrepo/force-app/main/default/classes/X.cls`). Most external tools — GitHub Code Scanning anchors, CodeClimate fingerprints, JUnit `classname` attributes — expect repo-relative paths and will silently fail to attach annotations or generate inconsistent fingerprints across runs when given absolute paths.

Two flags fix this for **every output format simultaneously**:

```bash
# Strip a literal prefix
sf cat transform -i analyzer.json -f sarif --strip-prefix "/home/runner/work/myrepo/myrepo/"

# Or auto-detect the SFDX project root
sf cat transform -i analyzer.json -f sarif --project-relative
```

`--project-relative` walks upward from the current directory looking for an `sfdx-project.json` file and strips that directory from every path. The two flags are mutually exclusive; pick whichever matches your CI environment.

## Column Data Handling

Salesforce Code Analyzer sometimes reports `startColumn` and `endColumn` values that exceed the actual line length. External tools will reject these and fail the scan.

**sf-cat** strips column values from all issues before output. Line-level highlighting is preserved; all column data is removed so out-of-bounds column data don't cause downstream scans to fail.

## Issues

Found a bug or have an idea? Open an [issue](https://github.com/mcarvin8/sf-cat/issues).

## License

[MIT](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
