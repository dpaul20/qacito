import { test, expect } from '@playwright/test';
import { register } from './index.js';

// ---------------------------------------------------------------------------
// Minimal fake McpServer
// ---------------------------------------------------------------------------

interface CapturedPrompt {
  name: string;
  description: string;
  params: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeFakeServer(): { captured: CapturedPrompt | null; server: { prompt: (...args: unknown[]) => void } } {
  let captured: CapturedPrompt | null = null;
  const server = {
    prompt(
      name: string,
      description: string,
      params: Record<string, unknown>,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) {
      captured = { name, description, params, handler };
    },
  };
  return { captured: null, server: server as unknown as { prompt: (...args: unknown[]) => void }, get capturedRef() { return captured; } } as {
    captured: CapturedPrompt | null;
    server: { prompt: (...args: unknown[]) => void };
  };
}

test.describe('qa:black-box-suite prompt', () => {
  test('registers with correct prompt name', () => {
    let capturedName: string | null = null;
    const fakeServer = {
      prompt(name: string, _desc: string, _params: unknown, _handler: unknown) {
        capturedName = name;
      },
    };

    register(fakeServer as never);

    expect(capturedName).toBe('qa:black-box-suite');
  });

  test('handler message text contains check_environment and discover_routes', async () => {
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
    const fakeServer = {
      prompt(_name: string, _desc: string, _params: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
        capturedHandler = handler;
      },
    };

    register(fakeServer as never);

    expect(capturedHandler).not.toBeNull();

    const result = await capturedHandler!({ baseUrl: 'https://example.com', testFramework: 'playwright' }) as {
      messages: Array<{ content: { text: string } }>;
    };

    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('check_environment');
    expect(text).toContain('discover_routes');
  });
});
