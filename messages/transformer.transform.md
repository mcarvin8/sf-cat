# summary

Transform Salesforce Code Analyzer results into a code quality format such as SonarQube, SARIF, CodeClimate / GitLab Code Quality, JUnit XML, or GitHub Actions workflow commands.

# description

Transform Salesforce Code Analyzer results into a code quality format consumable by external tools. Supported formats: SonarQube generic issue data, SARIF v2.1.0 (GitHub Code Scanning, Azure DevOps, GitLab, etc.), CodeClimate JSON (GitLab Code Quality, CodeClimate engines), JUnit XML (Jenkins, GitHub Actions test reporters, GitLab, Azure DevOps, CircleCI, Bitbucket, etc.), and GitHub Actions workflow commands (inline PR annotations on GitHub without GHAS).

# examples

- `sf cat transform -i "sf-code-analyzer.json" -o "sonar.json"`
- `sf cat transform -i "sf-code-analyzer.json" -f sarif`
- `sf cat transform -i "sf-code-analyzer.json" -f codeclimate`
- `sf cat transform -i "sf-code-analyzer.json" -f junit`
- `sf cat transform -i "sf-code-analyzer.json" -f github`
- `sf cat transform -i "sf-code-analyzer.json" -f sarif -o "results.sarif"`

# flags.input-file.summary

Path to the JSON file created by the Salesforce Code Analyzer plugin.

# flags.output-file.summary

Path to the output created by this plugin. Defaults to `output.json` for `sonar`, `output.sarif` for `sarif`, `gl-code-quality-report.json` for `codeclimate`, `junit.xml` for `junit`, and stdout for `github`.

# flags.format.summary

Output format to produce. One of: `sonar` (SonarQube generic issue data), `sarif` (SARIF v2.1.0), `codeclimate` (CodeClimate / GitLab Code Quality), `junit` (JUnit XML), or `github` (GitHub Actions workflow commands).
