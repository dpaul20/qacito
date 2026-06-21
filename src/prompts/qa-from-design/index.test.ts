import { test, expect } from '@playwright/test';
import { register } from './index.js';

test.describe('qa:from-design prompt', () => {
  test('registers with correct prompt name', () => {
    let capturedName: string | null = null;
    const fakeServer = {
      prompt(name: string, _desc: string, _params: unknown, _handler: unknown) {
        capturedName = name;
      },
    };

    register(fakeServer as never);

    expect(capturedName).toBe('qa:from-design');
  });

  test('handler message text contains Figma MCP hard-stop warning', async () => {
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | null = null;
    const fakeServer = {
      prompt(_name: string, _desc: string, _params: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) {
        capturedHandler = handler;
      },
    };

    register(fakeServer as never);

    expect(capturedHandler).not.toBeNull();

    const result = await capturedHandler!({ figmaFileUrl: 'https://figma.com/design/abc/test' }) as {
      messages: Array<{ content: { text: string } }>;
    };

    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('Figma MCP is not authenticated');
  });
});
