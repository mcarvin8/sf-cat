# sf-cat

[![NPM](https://img.shields.io/npm/v/sf-cat.svg?label=sf-cat)](https://www.npmjs.com/package/sf-cat)
[![Downloads/week](https://img.shields.io/npm/dw/sf-cat.svg)](https://npmjs.org/package/sf-cat)
[![GitHub Marketplace](https://img.shields.io/badge/marketplace-sf--cat-blue?logo=github)](https://github.com/marketplace/actions/sf-cat)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://raw.githubusercontent.com/mcarvin8/sf-cat/main/LICENSE.md)
[![Maintainability](https://qlty.sh/gh/mcarvin8/projects/sf-cat/maintainability.svg)](https://qlty.sh/gh/mcarvin8/projects/sf-cat)
[![codecov](https://codecov.io/gh/mcarvin8/sf-cat/graph/badge.svg?token=ENF0XXJGEM)](https://codecov.io/gh/mcarvin8/sf-cat)
[![Mutation testing badge](https://img.shields.io/endpoint?style=flat&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fmcarvin8%2Fsf-cat%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/mcarvin8/sf-cat/main)

Converts **Salesforce Code Analyzer** output into formats consumable by external code quality platforms — SonarQube, GitHub Code Scanning, Azure DevOps, GitLab, Jenkins, and other SARIF-, CodeClimate-, or JUnit-compatible tools.

Use `sf-cat` as either a **native GitHub Action** or a **Salesforce CLI plugin**.

- [How It Works](#how-it-works)
- [GitHub Action](#github-action)
- [Salesforce CLI Plugin](#salesforce-cli-plugin)
- [Output Formats](#output-formats)
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

## How It Works

**Salesforce Code Analyzer** scans Apex, Visualforce, Flows, Lightning components, and other Salesforce source using engines such as PMD, ESLint, RetireJS, and Salesforce Graph Engine. Its JSON output isn't directly compatible with many external code quality platforms.

**sf-cat** provides a single conversion step between Code Analyzer and your platform of choice:

```text
Salesforce Code Analyzer → JSON → sf-cat → SonarQube / SARIF / CodeClimate / JUnit / GitHub
```

Supported output formats:

| Format | Use with |
| --- | --- |
| `sonar` | SonarQube / SonarCloud generic issue data |
| `sarif` | GitHub Code Scanning, Azure DevOps, GitLab, Qodana, and other SARIF consumers |
| `codeclimate` | GitLab Code Quality, CodeClimate engines |
| `junit` | Jenkins, GitHub Actions, GitLab, Azure DevOps, CircleCI, Bitbucket Pipelines |
| `github` | GitHub Actions inline annotations without GitHub Advanced Security |

## GitHub Action

`sf-cat` is available as a native GitHub Action. **Running `sf-cat` this way does not require the Salesforce CLI or an `sf-cat` plugin installation.** The Action includes everything needed to transform an existing Salesforce Code Analyzer JSON report.

This differs from the [Salesforce Code Analyzer GitHub Action](https://github.com/marketplace/actions/run-salesforce-code-analyzer), which requires the Salesforce CLI and the `code-analyzer` CLI plugin to be installed on the runner before Code Analyzer runs.

A typical workflow is:

1. Install the Salesforce CLI and Salesforce Code Analyzer.
2. Run Salesforce Code Analyzer to produce a JSON report.
3. Pass that report to the `sf-cat` Action — no additional Salesforce CLI or `sf-cat` plugin installation is required for the transform step.

```yaml
- name: Install Salesforce CLI
  run: npm install -g @salesforce/cli@latest

- name: Install Salesforce Code Analyzer
  run: sf plugins install code-analyzer@latest

- name: Run Salesforce Code Analyzer
  uses: forcedotcom/run-code-analyzer@v2
  with:
    run-arguments: --workspace ./force-app/main/default/ --rule-selector Recommended --output-file analyzer.json

- name: Transform Code Analyzer output
  id: transform
  uses: mcarvin8/sf-cat@v2
  with:
    input-file: analyzer.json
    format: sarif
    output-file: results.sarif
```

### Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `input-file` | Path to the JSON file created by Salesforce Code Analyzer. | Yes | |
| `output-file` | Path to the output file this Action creates. Defaults per `format` (see [Command Reference](#command-reference)). | No | |
| `format` | Output format to produce: `sonar`, `sarif`, `codeclimate`, `junit`, or `github`. | No | `sonar` |
| `fail-on` | Fail the Action when any violation has the given severity or higher. | No | `never` |
| `strip-prefix` | Strip a leading prefix from every violation file path. Mutually exclusive with `project-relative`. | No | |
| `project-relative` | Make every violation file path relative to the Salesforce DX project root. Mutually exclusive with `strip-prefix`. | No | `false` |
| `max-annotations` | Maximum number of `format: github` annotations to emit. | No | `50` |

### Outputs

| Output | Description |
| --- | --- |
| `output-path` | Path to the transformed report. Empty when `format: github` writes to stdout instead of a file. |
| `violations` | Total number of violations in the input report. |
| `failures` | Number of violations at or above the `fail-on` severity threshold. |
| `warnings` | Newline-separated list of warnings emitted while transforming, if any. |

### Fail the build on high-severity findings

Use `fail-on` to make the Action fail when findings meet or exceed a severity threshold. The transformed output is still written before the failing exit, so later steps can upload the report with `if: always()`.

```yaml
- name: Transform to SARIF and fail on high severity
  id: transform
  uses: mcarvin8/sf-cat@v2
  with:
    input-file: analyzer.json
    format: sarif
    output-file: results.sarif
    fail-on: high

- name: Upload SARIF
  if: always()
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

## Salesforce CLI Plugin

Use the Salesforce CLI plugin when running `sf-cat` locally or from CI/CD platforms where the native GitHub Action isn't applicable.

### Requirements

- Salesforce CLI (`sf`)
- **Salesforce Code Analyzer v5** (`sf code-analyzer`)
- Node.js **22.19 or later**

### Install

```bash
sf plugins install sf-cat@latest
```

### Quick Start

**Step 1 — Run Salesforce Code Analyzer and save its JSON output:**

```bash
sf code-analyzer run --workspace "./force-app/main/default/" --rule-selector Recommended --output-file "analyzer.json"
```

> `sf code-analyzer run` uses `--output-file` for its output path. `sf-cat` uses `-f` for the output format — these are different flags on different commands.

**Step 2 — Transform the report with sf-cat:**

```bash
sf cat transform -i "analyzer.json" -f <format> -o "results.<ext>"
```

For example:

```bash
sf cat transform -i "analyzer.json" -f sarif -o "results.sarif"
```

See the platform-specific examples below for each supported output format.

## Output Formats

### SonarQube

Convert Code Analyzer output into SonarQube generic issue data:

```bash
sf cat transform -i "analyzer.json" -o "sonar.json"
```

`sonar` is the default format, so `-f sonar` is optional.

Add the report to `sonar-project.properties`:

```properties
sonar.externalIssuesReportPaths=sonar.json
```

Or provide it directly to SonarScanner:

```bash
sonar-scanner -Dsonar.externalIssuesReportPaths=sonar.json
```

### SARIF (GitHub Code Scanning, Azure DevOps, GitLab, ...)

Convert Code Analyzer output into SARIF v2.1.0:

```bash
sf cat transform -i "analyzer.json" -f sarif -o "results.sarif"
```

Each Code Analyzer engine (PMD, ESLint, RetireJS, SFGE, ...) is emitted as a separate SARIF `run`, allowing consumers to display them as distinct analysis tools.

**Upload to GitHub Code Scanning:**

```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

The same SARIF file can be consumed by Azure DevOps SARIF integrations, GitLab SAST artifacts, Qodana, and other SARIF v2.1.0-compatible tools.

### CodeClimate / GitLab Code Quality

Convert Code Analyzer output into CodeClimate JSON:

```bash
sf cat transform -i "analyzer.json" -f codeclimate
```

The default output path is `gl-code-quality-report.json`, the conventional filename for GitLab Code Quality reports.

Each issue receives a stable `fingerprint` so GitLab can deduplicate findings across pipeline runs.

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

Use JUnit when your CI platform doesn't support SARIF, when GitHub Advanced Security isn't available, or when you want Code Analyzer violations to appear in the standard CI test results interface.

```bash
sf cat transform -i "analyzer.json" -f junit
```

Each Code Analyzer engine becomes a `<testsuite>` and each violation becomes a failing `<testcase>`.

The default output path is `junit.xml`.

**Jenkins:**

```groovy
junit 'junit.xml'
```

**GitHub Actions** using [`dorny/test-reporter`](https://github.com/dorny/test-reporter):

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

Use the `github` format when you want inline GitHub Actions annotations without uploading a SARIF report to GitHub Code Scanning.

`sf-cat` writes GitHub workflow commands such as:

```text
::error file=force-app/main/default/classes/MyClass.cls,line=10::Violation message
```

The GitHub Actions runner converts these commands into workflow annotations automatically.

When using GitHub Actions, the native [`sf-cat` Action](#github-action) is the recommended approach because it doesn't require installing the `sf-cat` Salesforce CLI plugin:

```yaml
- name: Transform Code Analyzer output
  uses: mcarvin8/sf-cat@v2
  with:
    input-file: analyzer.json
    format: github
```

If you're using the Salesforce CLI plugin instead:

```yaml
jobs:
  code-analysis:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Salesforce CLI
        run: npm install -g @salesforce/cli@latest

      - name: Install Salesforce Code Analyzer
        run: sf plugins install code-analyzer@latest

      - name: Install sf-cat
        run: sf plugins install sf-cat@latest

      - name: Run Salesforce Code Analyzer
        run: sf code-analyzer run --workspace ./force-app/main/default/ --rule-selector Recommended --output-file analyzer.json

      - name: Create GitHub annotations
        run: sf cat transform -i analyzer.json -f github
```

No `upload-sarif` step or GitHub Code Scanning configuration is required.

Severity is mapped to GitHub annotation levels as follows:

| Salesforce Code Analyzer severity | GitHub annotation |
| --- | --- |
| `Critical` | `error` |
| `High` | `error` |
| `Moderate` | `warning` |
| `Low` | `notice` |
| `Info` | `notice` |

> **Note:** GitHub limits the number of annotations that can be displayed for a workflow step and may silently drop annotations beyond its limits. `sf-cat` applies a default `--max-annotations` value of `50` and emits a warning when the number of violations exceeds the configured limit. Use `--max-annotations` to adjust the value. For complete results, consider producing a SARIF, CodeClimate, or JUnit artifact in the same job.

## Failing the Build on High-Severity Findings

`--fail-on <severity>` lets `sf cat transform` act as a CI quality gate.

The transformed output file is written first, then the process exits with code `1` if any violation meets or exceeds the configured threshold. This allows later CI steps to upload the report even when the quality gate fails.

```bash
sf cat transform \
  -i analyzer.json \
  -f sarif \
  -o results.sarif \
  --fail-on high
```

This example fails when at least one `High` or `Critical` violation exists while still writing `results.sarif`.

Severity ranking from highest to lowest:

```text
critical → high → moderate → low → info
```

The default value is `never`, which disables failure based on violation severity.

## Path Normalization

Salesforce Code Analyzer can produce absolute file paths on CI runners, for example:

```text
/home/runner/work/myrepo/myrepo/force-app/main/default/classes/MyClass.cls
```

External tools commonly expect repository-relative paths. Absolute paths can prevent GitHub Code Scanning from anchoring findings to source files, produce inconsistent CodeClimate fingerprints across runners, or result in undesirable JUnit identifiers.

`sf-cat` provides two mutually exclusive path normalization options.

**Strip a known prefix:**

```bash
sf cat transform \
  -i analyzer.json \
  -f sarif \
  --strip-prefix "/home/runner/work/myrepo/myrepo/"
```

**Automatically make paths relative to the Salesforce DX project root:**

```bash
sf cat transform \
  -i analyzer.json \
  -f sarif \
  --project-relative
```

`--project-relative` walks upward from the current directory until it finds `sfdx-project.json` and uses that directory as the project root.

`--strip-prefix` and `--project-relative` are mutually exclusive. Use whichever option best matches your CI environment.

## Column Data Handling

Salesforce Code Analyzer can report `startColumn` and `endColumn` values that exceed the actual length of the referenced source line. Some external tools reject these values and can fail to process the entire report.

`sf-cat` removes column values before generating output.

Line-level locations are preserved, while potentially invalid column data is omitted so downstream platforms can reliably consume the transformed report.

## Command Reference

<!-- commands -->
* [`sf cat transform`](#sf-cat-transform)

## `sf cat transform`

Transform Salesforce Code Analyzer results into a code quality format such as SonarQube, SARIF, CodeClimate / GitLab Code Quality, JUnit XML, or GitHub Actions workflow commands.

```text
USAGE
  $ sf cat transform -i <value> [--json] [--flags-dir <value>] [-o <value>] [-f
    sonar|sarif|codeclimate|junit|github] [--fail-on critical|high|moderate|low|info|never] [--strip-prefix <value> |
    --project-relative] [--max-annotations <value>]

FLAGS
  -f, --format=<option>          [default: sonar] Output format to produce. One of: `sonar` (SonarQube generic issue
                                 data), `sarif` (SARIF v2.1.0), `codeclimate` (CodeClimate / GitLab Code Quality),
                                 `junit` (JUnit XML), or `github` (GitHub Actions workflow commands).
                                 <options: sonar|sarif|codeclimate|junit|github>
  -i, --input-file=<value>       (required) Path to the JSON file created by the Salesforce Code Analyzer plugin.
  -o, --output-file=<value>      Path to the output created by this plugin. Defaults to `output.json` for `sonar`,
                                 `output.sarif` for `sarif`, `gl-code-quality-report.json` for `codeclimate`,
                                 `junit.xml` for `junit`, and stdout for `github`.
      --fail-on=<option>         [default: never] Exit with code 1 when any violation has the given severity or higher.
                                 One of `critical`, `high`, `moderate`, `low`, `info`, or `never` (default). The output
                                 file is still written before the failing exit, so CI artifact uploads in later steps
                                 still see it.
                                 <options: critical|high|moderate|low|info|never>
      --max-annotations=<value>  [default: 50] Maximum number of GitHub Actions workflow command annotations to emit
                                 (only applies to `--format github`). GitHub silently drops annotations beyond its
                                 per-step cap; this flag lets you control how many are emitted and surfaces a warning
                                 when the total exceeds the limit. Defaults to 50.
      --project-relative         Make every violation file path relative to the Salesforce DX project root (resolved by
                                 walking upward from the current directory until an `sfdx-project.json` is found).
                                 Mutually exclusive with `--strip-prefix`.
      --strip-prefix=<value>     Strip a leading prefix from every violation file path before formatting (for example,
                                 `/home/runner/work/repo/repo/`). Useful when CI runners produce absolute paths that
                                 break GitHub Code Scanning anchors or CodeClimate fingerprints. Mutually exclusive with
                                 `--project-relative`.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Transform Salesforce Code Analyzer results into a code quality format such as SonarQube, SARIF, CodeClimate / GitLab
  Code Quality, JUnit XML, or GitHub Actions workflow commands.

  Transform Salesforce Code Analyzer results into a code quality format consumable by external tools. Supported formats:
  SonarQube generic issue data, SARIF v2.1.0 (GitHub Code Scanning, Azure DevOps, GitLab, etc.), CodeClimate JSON
  (GitLab Code Quality, CodeClimate engines), JUnit XML (Jenkins, GitHub Actions test reporters, GitLab, Azure DevOps,
  CircleCI, Bitbucket, etc.), and GitHub Actions workflow commands (inline PR annotations on GitHub without GHAS).

EXAMPLES
  `sf cat transform -i "sf-code-analyzer.json" -o "sonar.json"`

  `sf cat transform -i "sf-code-analyzer.json" -f sarif`

  `sf cat transform -i "sf-code-analyzer.json" -f codeclimate`

  `sf cat transform -i "sf-code-analyzer.json" -f junit`

  `sf cat transform -i "sf-code-analyzer.json" -f github`

  `sf cat transform -i "sf-code-analyzer.json" -f sarif -o "results.sarif"`

  `sf cat transform -i "sf-code-analyzer.json" --fail-on high`

  `sf cat transform -i "sf-code-analyzer.json" --project-relative`
```

_See code: [src/commands/cat/transform.ts](https://github.com/mcarvin8/sf-cat/blob/v2.1.1/src/commands/cat/transform.ts)_
<!-- commandsstop -->

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/mcarvin8/sf-cat/issues).

## License

[MIT](LICENSE.md)
