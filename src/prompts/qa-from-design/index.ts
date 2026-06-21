import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthConfigSchema } from '../../shared/auth-context.js';

export function register(server: McpServer): void {
  server.prompt(
    'qa:from-design',
    'Generate test specs from a Figma design file using the Figma MCP. Optionally runs them against a live URL.',
    {
      figmaFileUrl: z.string().url().describe('Figma file URL (figma.com/design/... or figma.com/file/...)'),
      baseUrl: z.string().url().optional().describe('Optional live URL to run generated specs against'),
      testFramework: z.enum(['playwright', 'cypress']).default('playwright').describe('Test framework for generated specs'),
      outputDir: z.string().optional().describe('Directory to write spec files to (defaults to OS temp dir)'),
      authConfig: AuthConfigSchema.optional().describe('Optional auth configuration for gated environments'),
    },
    async ({ figmaFileUrl, baseUrl, testFramework, outputDir, authConfig }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Generate QA test specs from the Figma design: ${figmaFileUrl}
${authConfig ? `Pre-flight auth check: verify the storageState file exists at "${authConfig.storageStatePath ?? 'N/A'}" before running. Pass authConfig to start_test_run calls.` : ''}

IMPORTANT: This workflow requires the Figma MCP to be available and authenticated. If the Figma MCP is not connected or returns an authentication error, STOP immediately and respond with: "Figma MCP is not authenticated. Please connect your Figma account (via the Figma plugin in Claude) before using this prompt."

Steps:
1. Call the Figma MCP tool get_design_context with the file URL "${figmaFileUrl}". Extract: (a) the list of frames/screens by name, (b) interactive components (buttons, forms, inputs, links), (c) navigation flows if available in prototype connections.
2. For each screen/frame (up to 15):
   a. Derive a test name from the frame name (e.g. "Login Screen" → "Login Screen renders correctly and accepts input")
   b. Generate a ${testFramework ?? 'playwright'} spec that:
      ${baseUrl ? `- Navigates to the corresponding route at "${baseUrl}" (infer the route from the frame name, e.g. "Login" → /login, "Dashboard" → /dashboard)` : '- Uses a placeholder baseURL (replace with your environment URL before running)'}
      - Checks the page loads without errors
      - For each interactive component identified in the frame: checks it is visible and (for form inputs) accepts keyboard input
      - Includes a descriptive test name matching the frame
3. Write all spec files to: ${outputDir ?? 'the OS temp directory (e.g. /tmp/qacito-from-design/)'} using write_file. Use the filename pattern: <FrameName>.spec.ts
4. ${baseUrl ? `Run each spec: call start_test_run({ projectRoot: "${outputDir ?? '/tmp/qacito-from-design'}", scriptPath: <specPath> }) then poll get_run_status until done. Collect results.` : 'Skip execution (no baseUrl provided). Report the generated spec file paths so the user can run them manually.'}
5. Produce a final report listing: each frame → spec file generated, pass/fail if executed, components covered, and any frames skipped due to insufficient design context.`,
        },
      }],
    }),
  );
}
