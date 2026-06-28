import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { qacitoHomeSchema } from './schema.js';
import { qacitoHomeHandler } from './handler.js';

const RESOURCE_URI = 'ui://qacito-home/home.html';

// Compiled to dist/tools/qacito-home/index.js  →  ../.. → project root/dist
// home.html lives in dist/, so we go up only two levels: ../..
const DIST_DIR = path.join(import.meta.dirname, '../..');

export function register(server: McpServer): void {
  registerAppTool(
    server,
    'qacito_home',
    {
      title: 'QAcito Home',
      description:
        'Open QAcito home screen — shows all available actions as clickable cards inside Claude Desktop.',
      inputSchema: qacitoHomeSchema.shape,
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async () => {
      const meta = await qacitoHomeHandler();
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(meta) },
        ],
      };
    },
  );

  registerAppResource(
    server,
    'QAcito Home UI',
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const htmlPath = path.join(DIST_DIR, 'home.html');
      const html = await fs.readFile(htmlPath, 'utf-8');
      return {
        contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}
