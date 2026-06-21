/**
 * Integration test: full MCP server via InMemoryTransport.
 *
 * Uses @modelcontextprotocol/sdk's InMemoryTransport to wire a real McpServer
 * instance to a real Client — no stdio, no child processes.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../../src/server/register-tools.js';
import { TOOL_COUNT } from '../../src/shared/registry-meta.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qacito-integration-'));
}

async function createConnectedPair(): Promise<{ client: Client }> {
  const server = new McpServer({ name: 'qacito-test', version: '0.0.1' });
  registerTools(server);

  const client = new Client({ name: 'test-client', version: '0.0.1' });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client };
}

// ---------------------------------------------------------------------------
// list_tools — tool registration
// ---------------------------------------------------------------------------

test.describe('MCP server integration', () => {
  test('list_tools returns all registered tools', async () => {
    const { client } = await createConnectedPair();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain('read_files');
      expect(names).toContain('write_file');
      expect(names).toContain('detect_stack');
      expect(names).toContain('run_tests');
      expect(names).toContain('get_api_template');
      expect(names).toContain('get_changed_files');
      expect(names).toContain('get_test_history');
      expect(names).toContain('update_visual_baselines');
      expect(names).toContain('analyze_project');
      expect(names).toContain('generate_report');
      expect(names).toHaveLength(TOOL_COUNT);
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------------------
  // read_files tool
  // -------------------------------------------------------------------------

  test('call_tool read_files: reads an existing file', async () => {
    const dir = await makeTempDir();
    try {
      const filePath = path.join(dir, 'hello.txt');
      await fs.writeFile(filePath, 'integration hello', 'utf-8');

      const { client } = await createConnectedPair();
      try {
        const result = await client.callTool({
          name: 'read_files',
          arguments: { paths: [filePath], projectRoot: dir },
        });

        expect(result.isError).toBeFalsy();
        const text = (result.content as Array<{ type: string; text: string }>)
          .find((c) => c.type === 'text')?.text;
        expect(text).toBeDefined();

        const parsed = JSON.parse(text!) as { files: Array<{ path: string; content?: string; error?: string }> };
        expect(parsed.files).toHaveLength(1);
        expect(parsed.files[0]?.content).toBe('integration hello');
      } finally {
        await client.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('call_tool read_files: returns FileNotFound without aborting', async () => {
    const dir = await makeTempDir();
    try {
      const { client } = await createConnectedPair();
      try {
        const missing = path.join(dir, 'not-here.txt');
        const result = await client.callTool({
          name: 'read_files',
          arguments: { paths: [missing], projectRoot: dir },
        });

        expect(result.isError).toBeFalsy();
        const text = (result.content as Array<{ type: string; text: string }>)
          .find((c) => c.type === 'text')?.text;

        const parsed = JSON.parse(text!) as { files: Array<{ path: string; error?: string }> };
        expect(parsed.files[0]?.error).toBe('FileNotFound');
      } finally {
        await client.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // write_file tool
  // -------------------------------------------------------------------------

  test('call_tool write_file: writes a file successfully', async () => {
    const dir = await makeTempDir();
    try {
      const { client } = await createConnectedPair();
      try {
        const result = await client.callTool({
          name: 'write_file',
          arguments: { path: 'written.txt', content: 'written by integration test', projectRoot: dir },
        });

        expect(result.isError).toBeFalsy();

        const written = await fs.readFile(path.join(dir, 'written.txt'), 'utf-8');
        expect(written).toBe('written by integration test');
      } finally {
        await client.close();
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // get_api_template tool
  // -------------------------------------------------------------------------

  test('call_tool get_api_template: returns a GET template', async () => {
    const { client } = await createConnectedPair();
    try {
      const result = await client.callTool({
        name: 'get_api_template',
        arguments: { method: 'GET', endpoint: '/api/health', expectedStatus: 200 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)
        .find((c) => c.type === 'text')?.text;

      const parsed = JSON.parse(text!) as { template: string; type: string; variables: string[] };
      expect(parsed.type).toBe('GET');
      expect(parsed.template).toContain('/api/health');
      expect(parsed.template).toContain('200');
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------------------
  // Unknown tool
  // -------------------------------------------------------------------------

  test('call_tool returns an error for an unknown tool name', async () => {
    const { client } = await createConnectedPair();
    try {
      const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
