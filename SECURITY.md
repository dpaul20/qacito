# Security Policy

## Supported Versions

Security fixes are provided on the latest `main` branch state.

## Reporting a Vulnerability

Please do not open public issues for security reports.

Send a private report with:
1. Vulnerability description and impact.
2. Steps to reproduce.
3. Affected version/commit.
4. Suggested remediation if available.

Use GitHub Security Advisories (preferred) or contact the maintainers directly.

We will acknowledge receipt and provide a follow-up timeline after triage.

## Known deferred vulnerabilities

| Package | GHSA                | Severity | Reason deferred                    | Fix target       |
|---------|---------------------|----------|------------------------------------|------------------|
| esbuild | GHSA-67mh-4wv8-2f99 | moderate | Dev server only, not in prod build | vite@8 migration |
