/**
 * QAcito MCP Server — entry point.
 *
 * IMPORTANT: the console.log redirect MUST execute before any import that
 * could write to stdout. In stdio mode, stdout is the JSON-RPC wire — any
 * stray byte there breaks the protocol.
 *
 * ADR — run-store concurrency under HTTP mode:
 * Node.js is single-threaded. All run-store mutations are synchronous between
 * read and write (no `await` inside a read-modify-write cycle), so the event
 * loop provides sufficient isolation even with N concurrent POST /mcp clients.
 * Future maintainers: DO NOT add `await` inside run-store read-modify-write
 * paths without also adding explicit serialization (e.g. per-id async queue).
 */

// Redirect accidental console.log calls to stderr BEFORE imports.
// eslint-disable-next-line no-console
console.log = (...args: unknown[]): void => {
  process.stderr.write(
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') +
      '\n',
  );
};
// eslint-disable-next-line no-console
console.error = (...args: unknown[]): void => {
  process.stderr.write(args.join(' ') + '\n');
};

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRequire } from 'node:module';
import { registerTools }     from './register-tools.js';
import { registerResources }  from './register-resources.js';
import { registerPrompts }    from './register-prompts.js';
import { startDashboardServer } from '../dashboard-server/index.js';
import { startStdioTransport } from './transports/stdio.js';
import { startHttpTransport }  from './transports/http.js';

const SERVER_NAME    = 'qacito';
const SERVER_VERSION = '0.1.0';

/**
 * Parse QACITO_HTTP_PORT.
 * Returns null  → env var absent or empty → use stdio.
 * Returns number → valid port            → use HTTP.
 * Throws         → env var set but invalid → fatal.
 *
 * Default recommended port: 4712
 */
function parseHttpPort(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(
      `Invalid QACITO_HTTP_PORT: "${raw}" — must be an integer between 1 and 65535`,
    );
  }
  return n;
}

async function main(): Promise<void> {
  // Dashboard ALWAYS boots first — tools depend on the run-store and the WS
  // broadcaster it initialises. getTransportUrl() must resolve before tools run.
  await startDashboardServer();

  // Non-blocking Playwright check — resolve the local package instead of shelling out.
  queueMicrotask(() => {
   const require = createRequire(import.meta.url);
   try {
     require.resolve('@playwright/test');
   } catch {
     process.stderr.write(
       `[${SERVER_NAME}] WARNING: Playwright not found. run_tests and check_accessibility will fail until installed.\n` +
       `[${SERVER_NAME}] Install: npm install --save-dev @playwright/test && npx playwright install\n`,
     );
   }
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  const httpPort = parseHttpPort(process.env.QACITO_HTTP_PORT);
  if (httpPort !== null) {
    await startHttpTransport(server, httpPort);
  } else {
    await startStdioTransport(server);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[${SERVER_NAME}] Fatal startup error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
