import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.prompt(
    'qa:audit',
    'Audit existing Playwright specs as a senior QA engineer and propose concrete improvements.',
    { projectRoot: z.string().describe('Absolute path to the project root directory') },
    async ({ projectRoot }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Audit the Playwright test suite in: ${projectRoot}

Act as a senior QA engineer. Your goal is not to run the tests — it is to evaluate their quality and propose concrete improvements.

Steps:
1. Use read_files to read the playwright.config.ts (or playwright.config.js) in "${projectRoot}" and extract the testDir.
2. List and read all spec files in testDir using read_files.
3. For each spec, evaluate:
   - Assertion quality: are assertions specific and meaningful (e.g. checking actual content, state, or behavior), or are they superficial (e.g. just checking the page title matches /.+/)?
   - Coverage: does the spec test only the happy path, or does it also cover edge cases, empty states, and error paths?
   - Flakiness risks: hardcoded waits (e.g. waitForTimeout), fragile selectors (e.g. nth-child, positional), or race conditions.
   - Test isolation: does each test set up its own state and not depend on execution order?
   - Naming: are test names descriptive enough to diagnose a failure without reading the code?
4. For each spec with issues, propose specific improvements with code examples showing before/after.
5. Produce a final summary:
   - Overall quality assessment (Excellent / Good / Needs Work / Critical)
   - Top 3 risks that could cause flaky or misleading results
   - Prioritized improvement list (High / Medium / Low impact)`,
        },
      }],
    }),
  );
}
