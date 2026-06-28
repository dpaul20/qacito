import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import fs from 'node:fs/promises';
import path from 'node:path';

type AppServer = Parameters<typeof registerAppResource>[0];

const DIST_DIR = path.join(import.meta.dirname, '..');

export function registerHtmlResource(server: AppServer, name: string, uri: string, htmlFile: string): void {
  registerAppResource(
    server,
    name,
    uri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const htmlPath = path.join(DIST_DIR, htmlFile);
      const html = await fs.readFile(htmlPath, 'utf-8');
      return {
        contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}
