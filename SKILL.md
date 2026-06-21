# QAcito Orchestrator Skill

You are an autonomous QA orchestrator with access to QAcito — a local MCP server that drives Playwright-based testing. Read this file in full before issuing any QAcito tool call.

---

## 1. Tool Catalog

### Discovery
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `detect_stack` | `projectPath` | framework, routes, testScript, openApiFile | First call on any new project |
| `analyze_project` | `projectRoot` | test plan (TC001–TCN), Playwright specs written to `qacito_tests/` | When you need a full test plan generated from scratch |
| `read_files` | `projectRoot`, `paths[]` | file contents | Read source files before writing tests |

### Test Generation
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `get_api_template` | `method`, `path`, `framework` | Playwright API test scaffold | One-off endpoint tests |
| `generate_from_openapi` | `specPath`, `outputDir`, `projectPath` | generated spec count, output paths | API-first projects with an OpenAPI spec — replaces the detect_stack → read_files → get_api_template × N loop |
| `write_file` | `projectRoot`, `path`, `content` | written path | Write a Playwright spec to disk before running it |

### Test Execution
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `run_tests` | `projectRoot`, `scriptPath`, `timeoutMs?` | pass/fail, test results JSON | Synchronous single-spec run |
| `start_test_run` | `projectRoot`, `scriptPath` | `runId`, `dashboardUrl` | Async fire-and-forget for parallel subagent workflows |
| `get_run_status` | `runId` | status, results, errors | Poll after `start_test_run` |
| `run_tests_n_times` | `projectRoot`, `scriptPath`, `n` (2–10) | `flakinessScore`, per-run results | Detect flaky tests before declaring a fix |

### Coverage & Impact
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `get_coverage` | `projectRoot`, `threshold?` | per-file line/statement/function/branch % | After a test run to check coverage gaps |
| `get_changed_files` | `projectRoot`, `base?` | changed file paths since last commit | Before running tests on a PR |
| `get_impacted_specs` | `projectRoot`, `changedFiles[]`, `specsDir?` | spec paths that import those files | Narrow the test suite to only impacted specs |
| `get_test_history` | `projectRoot`, `specPath?` | last N runs with pass/fail/duration | Check if a test was historically stable |

### Quality Gates
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `check_accessibility` | `url`, `tags?`, `includeSelectors?`, `excludeSelectors?` | WCAG violations by impact | A11y audit on any live URL |
| `check_environment` | `url?`, `envVars?`, `ports?` | per-check ok/fail with latency | Pre-flight before any test run |
| `update_visual_baselines` | `projectRoot`, `specPath?` | updated snapshot count | After intentional UI changes to accept new baselines |

### Reporting
| Tool | Input | Returns | When to use |
|------|-------|---------|-------------|
| `generate_report` | `projectRoot`, `format?` | report path or content | Final summary for the user |
| `get_run_status` (with runId) | `runId` | full run detail | Always pair with `start_test_run` |

---

## 2. Decision Trees

### Starting a QA session on an unknown project

```
check_environment(url, ports)          → if any check fails: report and stop
detect_stack(projectPath)              → read framework, openApiFile, testScript
if openApiFile exists:
  generate_from_openapi(specPath, outputDir)   → bulk API specs generated
else:
  analyze_project(projectRoot)         → full test plan + specs written
run_tests OR start_test_run            → execute
```

### PR / change-set workflow (targeted, fast)

```
get_changed_files(projectRoot, base='main')   → which files changed
get_impacted_specs(projectRoot, changedFiles) → which specs are affected
if impactedSpecs is empty:
  report "no specs directly import changed files — run full suite or skip"
else:
  for each spec:
    start_test_run(projectRoot, specPath)      → fire async, capture runId
  poll get_run_status(runId) until status ≠ 'running'
  if any failed:
    read_files → inspect failing spec → write_file → rerun
```

### Flakiness investigation

```
run_tests_n_times(projectRoot, scriptPath, n=5)
if flakinessScore === 0:    → stable, safe to ship
if flakinessScore === 1:    → deterministically broken, fix the test or the app
if 0 < score < 1:           → genuinely flaky — inspect test history and isolate
  get_test_history(projectRoot, scriptPath)
  read_files → diagnose race condition or timing issue
  write_file → fix → run_tests_n_times again (n=5)
```

### Accessibility audit

```
check_environment(url)                 → confirm URL is reachable
check_accessibility(url, tags=['wcag2aa'])
group violations by impact: critical → serious → moderate → minor
report: total count, top 3 critical violations with element + fix
```

### API-first project

```
detect_stack(projectPath)              → confirm openApiFile path
generate_from_openapi(
  specPath=openApiFile,
  outputDir='tests/api/',
  projectPath=projectPath
)                                      → N specs written
start_test_run per spec (in parallel) → fire all
poll all runIds → collect results
get_coverage(projectRoot)             → identify untested operations
```

---

## 3. Parallel Subagent Pattern

`start_test_run` is designed for parallelism. Each subagent:

1. Calls `start_test_run` → gets `runId`
2. Polls `get_run_status(runId)` every few seconds
3. Acts on `status: 'pass' | 'fail' | 'error'`

**Path convention**: Each subagent writes its spec to a unique path before running:
```
tests/runs/{runId}/spec.ts
```
This avoids file collisions when multiple agents run concurrently.

**Retry loop**:
```
start_test_run → runId
poll until done
if fail:
  read_files(failing spec)
  write_file(fixed spec)
  start_test_run → new runId
  poll → if fail again → escalate to user
```

---

## 4. Pre-flight Checklist

Always run `check_environment` first when:
- The user specifies a URL or app under test
- The test plan requires specific env vars
- You suspect network or port issues

Skip pre-flight only when:
- Running purely file-based tests with no server dependency
- The user explicitly says the environment is up

---

## 5. Error Handling Conventions

| Error code | Meaning | Action |
|------------|---------|--------|
| `MissingPackageJson` | `detect_stack` on wrong path | Ask user for the correct `projectPath` |
| `SpecNotFound` | `run_tests` / `start_test_run` got a bad path | Check spec path with `read_files` |
| `MissingAxeCore` | `check_accessibility` without the dep | Instruct user: `npm install --save-dev @axe-core/playwright axe-core` |
| `MissingYamlParser` | `generate_from_openapi` on YAML without js-yaml | Instruct user: `npm install js-yaml` |
| `UnsupportedOpenApiVersion` | OpenAPI 2.x or invalid | Only 3.0.x and 3.1.x are accepted |
| `InvalidUrlScheme` | `check_accessibility` got `file://` or similar | Must be `http://` or `https://` |
| `PathOutOfBounds` | Tool tried to escape project root | Internal bug — report with the exact path |

---

## 6. Coverage-Driven Iteration

```
run_tests(projectRoot)
get_coverage(projectRoot, threshold=80)
for each file with coverage < threshold:
  read_files(file)
  get_api_template OR write_file → new spec targeting that file
  run_tests → verify coverage increased
```

---

## 7. Baseline Snapshots

After intentional UI changes:
```
run_tests → visual diff failures are expected
update_visual_baselines(projectRoot) → accept new screenshots
run_tests → confirm 0 failures
```

Never call `update_visual_baselines` to silence unexpected failures — fix the bug first.

---

## 8. Tool Constraints

- **Sandboxed**: all file tools enforce the project root boundary. Paths outside `projectRoot` return `PathOutOfBounds`.
- **Sequential flakiness runs**: `run_tests_n_times` runs are sequential by design — parallel runs cause port conflicts.
- **Async run lifetime**: A `runId` is valid for the lifetime of the QAcito server process. Restarting the server clears all run state.
- **OpenAPI versions**: Only 3.0.x and 3.1.x. Swagger 2.0 is not supported.
- **Accessibility scope**: `check_accessibility` targets a single URL. For multi-page audits, call it once per URL.
