import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export function register(server: McpServer): void {
  server.prompt(
    'qa:black-box-suite',
    'Run a complete QA suite against a live URL without source code access. Optionally uses Figma MCP for design-driven test generation.',
    {
      baseUrl: z.string().url().describe('Base URL of the live environment to test'),
      figmaFileUrl: z.string().url().optional().describe('Optional Figma file URL for design-driven TC generation'),
      testFramework: z.enum(['playwright', 'cypress']).default('playwright').describe('Test framework to use for spec execution'),
      authConfig: AuthConfigSchema.optional().describe('Optional auth configuration for gated environments'),
    },
    async ({ baseUrl, figmaFileUrl, testFramework, authConfig }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Run a full black-box QA suite against: ${baseUrl}
${authConfig ? `Pre-flight auth check: verify the storageState file exists at "${authConfig.storageStatePath ?? 'N/A'}" before crawling. Pass authConfig to discover_routes, check_accessibility, and start_test_run calls.` : ''}
${figmaFileUrl ? `Figma design file: ${figmaFileUrl}` : ''}
Test framework: ${testFramework ?? 'playwright'}

Steps:
1. Call check_environment({ url: "${baseUrl}" }) to verify the site is reachable. If it returns an error, stop and report it — do not proceed with an unreachable target.
2. Call discover_routes({ baseUrl: "${baseUrl}" }) to get the list of routes/pages. Note the "source" field (sitemap vs crawl) and any warnings.
3. ${figmaFileUrl ? `Retrieve design context: call the Figma MCP tool get_design_context with the Figma file URL "${figmaFileUrl}". If the Figma MCP is not available or returns an error, log a warning ("Figma MCP unavailable — skipping design context") and continue without it.` : 'No Figma file provided — skip design context step.'}
4. For each discovered route (up to 10), generate a ${testFramework ?? 'playwright'} spec that: navigates to the URL, waits for load, checks that the page title is non-empty, checks there are no JS console errors, and checks at least one visible landmark element (main, header, nav, or h1).
5. Write each spec using write_file to a temporary directory (use a path like /tmp/qacito-blackbox/ or the OS temp dir). Each spec file should be self-contained.
6. For each spec file: call start_test_run({ projectRoot: <tmpDir>, scriptPath: <specPath> }) then poll get_run_status({ runId }) until status is not "running". Collect results.
7. Call generate_report({ runId: <the completed runId from step 6>, outputDir: <tmpDir> }) to produce a final summary.

In the final report: list each route tested, its pass/fail status, any errors found, and coverage gaps (routes discovered but not tested due to the 10-route cap).`,
        },
      }],
    }),
  );
}
