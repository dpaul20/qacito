import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.prompt(
    'qa:full-suite',
    'Run the complete test suite for a project: detect stack, locate specs, execute all tests, report coverage.',
    { projectRoot: z.string().describe('Absolute path to the project root directory') },
    async ({ projectRoot }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Run a full QA suite on the project at: ${projectRoot}

Steps:
0. Read the resource project://info and immediately tell the user the dashboardUrl so they can open it in the browser before tests start. If dashboardUrl is empty, skip this step. IMPORTANT: explain that the dashboard root may contain global history and the agent MUST validate the visible projectRoot before trusting any run or plan shown there.
1. Call detect_stack({ projectPath: "${projectRoot}" }) to identify the framework and locate the Playwright config file (e.g. playwright.config.ts).
2. Read the Playwright config using read_files to extract the configured testDir (e.g. "e2e/"). This is the project's existing test suite — the source of truth for current quality.
3. If testDir exists and contains spec files: run each existing spec using start_test_run({ projectRoot: "${projectRoot}", scriptPath: "<spec-path>" }) and poll get_run_status({ runId }) until done. These results represent the real baseline.
4. Audit the existing specs as a senior QA engineer: use read_files to read each spec in testDir and evaluate — assertion quality (are they meaningful or just checking page loads?), missing edge cases and error paths, flakiness risks (hardcoded waits, fragile selectors), and test isolation. List specific, actionable improvements per spec.
5. Call analyze_project({ projectRoot: "${projectRoot}" }) to generate specs only for routes not already covered by the existing suite (gap-fill only), and use the returned project-scoped dashboard URL when available.
6. For each spec in qacito_tests/, call start_test_run + poll get_run_status and keep the returned runId.
7. Call get_coverage({ projectRoot: "${projectRoot}" }) to identify gaps.
8. Call generate_report({ runId: <the completed runId from step 6>, outputDir: "${projectRoot}" }) to produce a final summary.

In the final report: (a) existing suite results with audit findings per spec, (b) gap-fill results, (c) coverage gaps, (d) prioritized list of improvements.`,
        },
      }],
    }),
  );
}
