import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from './register-tools.js';

// ---------------------------------------------------------------------------
// Setup — one server + client pair shared across all smoke tests
// ---------------------------------------------------------------------------

let client: Client;
let tmpDir: string;

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qacito-smoke-'));

  // Minimal package.json so detect_stack has something to parse.
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'smoke-project', version: '0.0.0' }),
  );

  const server = new McpServer({ name: 'qacito-smoke', version: '0.0.0' });
  registerTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'smoke-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

test.afterAll(async () => {
  await client.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper — parse the first text content block as JSON
// ---------------------------------------------------------------------------

interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
  return client.callTool({ name, arguments: args }) as unknown as Promise<ToolResponse>;
}

function parseText(result: ToolResponse): unknown {
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('Expected text content');
  return JSON.parse(first.text);
}

// ---------------------------------------------------------------------------
// Smoke tests — one per tool
// ---------------------------------------------------------------------------

test.describe('MCP smoke — all tools registered and routed', () => {
  test('read_files — returns content for an existing file', async () => {
    const filePath = path.join(tmpDir, 'smoke.txt');
    await fs.writeFile(filePath, 'smoke content');

    const result = await callTool('read_files', { paths: [filePath], projectRoot: tmpDir });

    expect(result.isError).toBeFalsy();
    const data = parseText(result) as { files: Array<{ content?: string }> };
    expect(data.files[0]?.content).toBe('smoke content');
  });

  test('write_file — creates file and returns bytesWritten', async () => {
    const result = await callTool('write_file', {
      path: 'written.txt',
      content: 'hello from smoke',
      projectRoot: tmpDir,
    });

    expect(result.isError).toBeFalsy();
    const data = parseText(result) as { bytesWritten: number };
    expect(data.bytesWritten).toBeGreaterThan(0);

    const written = await fs.readFile(path.join(tmpDir, 'written.txt'), 'utf-8');
    expect(written).toBe('hello from smoke');
  });

  test('detect_stack — returns framework for a project with package.json', async () => {
    const result = await callTool('detect_stack', { projectPath: tmpDir });

    expect(result.isError).toBeFalsy();
    const data = parseText(result) as { framework: string };
    expect(typeof data.framework).toBe('string');
  });

  test('run_tests — returns SpecNotFound for a non-existent spec file', async () => {
    const result = await callTool('run_tests', {
      scriptPath: path.join(tmpDir, 'nonexistent.spec.ts'),
      projectRoot: tmpDir,
    });

    expect(result.isError).toBe(true);
    const data = parseText(result) as { error: string };
    expect(data.error).toBe('SpecNotFound');
  });

  test('get_api_template — returns a non-empty Playwright template', async () => {
    const result = await callTool('get_api_template', { method: 'GET', endpoint: '/health' });

    expect(result.isError).toBeFalsy();
    const data = parseText(result) as { template: string };
    expect(data.template.length).toBeGreaterThan(0);
  });

  test('get_changed_files — returns NoGitRepo error for a non-git directory', async () => {
    const result = await callTool('get_changed_files', { projectPath: tmpDir });

    expect(result.isError).toBe(true);
    const data = parseText(result) as { error: string };
    expect(data.error).toBe('NoGitRepo');
  });

  test('get_test_history — returns entries array', async () => {
    const result = await callTool('get_test_history', { limit: 1 });

    expect(result.isError).toBeFalsy();
    const data = parseText(result) as { entries: unknown[] };
    expect(Array.isArray(data.entries)).toBe(true);
  });

  test('update_visual_baselines — returns isError for a non-existent spec', async () => {
    const result = await callTool('update_visual_baselines', {
      scriptPath: path.join(tmpDir, 'nonexistent.spec.ts'),
      projectRoot: tmpDir,
    });

    expect(result.isError).toBe(true);
  });
});
