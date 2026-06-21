import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const HOST = '127.0.0.1';

/**
 * Start the Streamable HTTP transport in stateless mode.
 *
 * Stateless = every POST /mcp creates a fresh StreamableHTTPServerTransport,
 * connects it to the SHARED McpServer, handles the request, and tears down.
 * All persistent state (run-store, tool registry) lives in process-global
 * singletons, so all concurrent clients share the same state naturally.
 */
export async function startHttpTransport(
  server: McpServer,
  port: number,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true, transport: 'http', port });
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    // Omit sessionIdGenerator → stateless mode (no server-side session tracking).
    // exactOptionalPropertyTypes: explicit `undefined` is rejected; omit instead.
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
    });

    try {
      // Cast required: StreamableHTTPServerTransport.onclose is typed as
      // `(() => void) | undefined`, but Transport expects `() => void` under
      // exactOptionalPropertyTypes. Runtime behavior is correct — SDK type gap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await server.connect(transport as any);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      process.stderr.write(
        `[qacito] HTTP /mcp handler error: ${(err as Error).message}\n`,
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(port, HOST, () => {
      process.stderr.write(
        `[qacito] MCP transport: http (http://${HOST}:${port}/mcp)\n`,
      );
      resolve();
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(`QAcito HTTP transport: port ${port} is already in use`),
        );
      } else {
        reject(err);
      }
    });
  });
}
