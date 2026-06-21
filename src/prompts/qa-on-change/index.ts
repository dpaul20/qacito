import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.prompt(
    'qa:on-change',
    'Run only the tests impacted by recent git changes — faster than a full suite for PR validation.',
    {
      projectRoot: z.string().describe('Absolute path to the project root directory'),
      base:        z.string().optional().default('main').describe('Git ref to compare against (default: main)'),
    },
    async ({ projectRoot, base }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Run targeted tests for recent changes in: ${projectRoot} (comparing against ${base ?? 'main'})

Steps:
1. Call get_changed_files({ projectRoot: "${projectRoot}", base: "${base ?? 'main'}" }) to get the list of modified files.
2. Use read_files to read the playwright.config.ts (or playwright.config.js) in "${projectRoot}" and extract the configured testDir. If no config is found, default to "e2e/". This is where the project's real specs live.
3. Call get_impacted_specs({ projectRoot: "${projectRoot}", changedFiles: <result-from-step-1>, specsDir: "<testDir-from-step-2>" }) to identify which existing Playwright specs are affected by those changes.
4. For each impacted spec, call run_tests({ projectRoot: "${projectRoot}", scriptPath: "<spec-path>" }).

If no specs are impacted, report that no targeted tests were found and offer to run the full suite instead.`,
        },
      }],
    }),
  );
}
