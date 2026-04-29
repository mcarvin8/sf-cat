# summary

Transform Salesforce Code Analyzer results into a code quality format such as SonarQube generic issue data or SARIF.

# description

Transform Salesforce Code Analyzer results into a code quality format consumable by external tools. Supported formats: SonarQube generic issue data and SARIF v2.1.0 (GitHub Code Scanning, Azure DevOps, GitLab, etc.).

# examples

- `sf cat transform -i "sf-code-analyzer.json" -o "sonar.json"`
- `sf cat transform -i "sf-code-analyzer.json" -f sarif`
- `sf cat transform -i "sf-code-analyzer.json" -f sarif -o "results.sarif"`

# flags.input-file.summary

Path to the JSON file created by the Salesforce Code Analyzer plugin.

# flags.output-file.summary

Path to the output created by this plugin. Defaults to `output.json` for `sonar` and `output.sarif` for `sarif`.

# flags.format.summary

Output format to produce. One of: `sonar` (SonarQube generic issue data) or `sarif` (SARIF v2.1.0).
