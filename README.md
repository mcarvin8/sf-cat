# `sf-cat`

[![NPM](https://img.shields.io/npm/v/sf-cat.svg?label=sf-cat)](https://www.npmjs.com/package/sf-cat)
[![Downloads/week](https://img.shields.io/npm/dw/sf-cat.svg)](https://npmjs.org/package/sf-cat)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/sf-cat/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)
[![Code Coverage](https://qlty.sh/gh/mcarvin8/projects/sf-cat/coverage.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>

- [Install](#install)
- [Why Use This Plugin?](#why-use-this-plugin)
- [How to Use](#how-to-use)
- [Command](#command)
  - [`sf cat transform`](#sf-cat-transform)
- [Issues](#issues)
- [License](#license)
</details>

**`sf-cat` is a Salesforce CLI plugin that converts output from Salesforce Code Analyzer into SonarQube-compatible format.**  
This enables developers to enforce Salesforce-specific code quality rules within centralized SonarQube pipelines and dashboards.

## Install

```bash
sf plugins install sf-cat@x.y.z
```

## Why Use This Plugin?

Salesforce Code Analyzer is a powerful tool for static analysis of Apex, Visualforce, and LWC code. It integrates engines like PMD and ESLint, helping Salesforce developers write secure, performant, and maintainable code.

But SonarQube is often used as a central platform to consolidate code quality results across repositories and languages — including CI pipelines, pull request gating, and dashboards.

Unfortunately, **Salesforce Code Analyzer output is not directly compatible with SonarQube**.

That’s where `sf-cat` comes in:  
✅ Converts Salesforce Code Analyzer JSON to [SonarQube's Generic Issue Data format](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/importing-external-issues/generic-issue/)  
✅ Enables seamless inclusion in `sonar-scanner` reports  
✅ Allows teams to view Salesforce-specific quality violations in the same place as other code

## How to Use

### Step 1: Run Salesforce Code Analyzer

```
sf code-analyzer run --workspace "./force-app/main/default/" --rule-selector Recommended -f "output.json"
```

### Step 2: Convert to SonarQube format

```
sf cat transform -j "output.json" -r "results.json"
```

### Step 3: Run SonarQube scan with converted issues

In your `sonar-project.properties`:

```
sonar.externalIssuesReportPaths=results.json
```

Or pass it via CLI:

```
sonar-scanner -Dsonar.externalIssuesReportPaths=results.json
```

## Command

## `sf cat transform`

```
USAGE
  $ sf cat transform -i <value> [-o <value>] [--json]

FLAGS
  -i, --input-file=<value>             Path to the JSON file created by the Salesforce Code Analyzer plugin.
  -o, --output-file=<value>            Path to the output created by this plugin.
                                       [default: "output.json"]

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES

    $ sf cat transform -i "salesforce-code-analyzer.json" -o "sonar.json"

```

## Issues

If you encounter any issues or would like to suggest features, please create an [issue](https://github.com/mcarvin8/sf-cat/issues).

## License

This project is licensed under the MIT license. Please see the [LICENSE](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md) file for details.
