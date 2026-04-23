# sf-cat

[![NPM](https://img.shields.io/npm/v/sf-cat.svg?label=sf-cat)](https://www.npmjs.com/package/sf-cat)
[![Downloads/week](https://img.shields.io/npm/dw/sf-cat.svg)](https://npmjs.org/package/sf-cat)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/sf-cat/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)
[![codecov](https://codecov.io/gh/mcarvin8/sf-cat/graph/badge.svg?token=ENF0XXJGEM)](https://codecov.io/gh/mcarvin8/sf-cat)

A Salesforce CLI plugin that converts Salesforce Code Analyzer output into SonarQube's Generic Issue Data format — so you can surface Salesforce code quality results in SonarQube alongside the rest of your stack.

## Table of Contents

- [sf-cat](#sf-cat)
  - [Table of Contents](#table-of-contents)
  - [Install](#install)
  - [Why sf-cat?](#why-sf-cat)
  - [Quick Start](#quick-start)
  - [Command Reference](#command-reference)
    - [`sf cat transform`](#sf-cat-transform)
  - [Column Data Handling](#column-data-handling)
  - [Issues](#issues)
  - [License](#license)

## Install

```bash
sf plugins install sf-cat@x.y.z
```

## Why sf-cat?

**Salesforce Code Analyzer** scans Apex, Visualforce, Flows, and Lightning components using PMD, ESLint, RetireJS, and Salesforce Graph Engine — catching security issues, performance problems, and best-practice violations.

**SonarQube** is where many teams centralize code quality: CI pipelines, PR checks, and dashboards.

The problem: Code Analyzer output isn't compatible with SonarQube.

**sf-cat** bridges the gap:

- Converts Code Analyzer JSON to [SonarQube Generic Issue Data](https://docs.sonarsource.com/sonarqube-cloud/enriching/generic-issue-data/)
- Drops cleanly into `sonar-scanner` reports
- Gives you one place to see Salesforce findings with the rest of your codebase

## Quick Start

**1. Run Salesforce Code Analyzer** (JSON output):

```bash
sf code-analyzer run --workspace "./force-app/main/default/" --rule-selector Recommended -f "output.json"
```

**2. Convert to SonarQube format:**

```bash
sf cat transform -i "output.json" -o "results.json"
```

**3. Run SonarQube** with the converted issues.

In `sonar-project.properties`:

```properties
sonar.externalIssuesReportPaths=results.json
```

Or via CLI:

```bash
sonar-scanner -Dsonar.externalIssuesReportPaths=results.json
```

## Command Reference

### `sf cat transform`

| Flag            | Short | Description                                                       |
| --------------- | ----- | ----------------------------------------------------------------- |
| `--input-file`  | `-i`  | Path to the JSON file from Salesforce Code Analyzer (required)    |
| `--output-file` | `-o`  | Path for the SonarQube-compatible output (default: `output.json`) |

**Example:**

```bash
sf cat transform -i "salesforce-code-analyzer.json" -o "sonar.json"
```

## Column Data Handling

Salesforce Code Analyzer sometimes reports `startColumn` and `endColumn` values that exceed the actual line length. SonarQube rejects these and fails the scan.

**sf-cat** strips column values from all issues before output. Line-level highlighting is preserved; out-of-bounds column data is removed so scans succeed.

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/mcarvin8/sf-cat/issues).

## License

MIT — see [LICENSE](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md) for details.
