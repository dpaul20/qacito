import { test, expect } from '@playwright/test';
import http from 'node:http';
import { checkAccessibilityHandler } from './handler.js';
import { AuthEnvVarMissingError } from '../../shared/auth-context.js';

function startServer(handler: http.RequestListener, port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

const SIMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><title>Test Page</title></head>
<body><main><h1>Hello</h1></main></body>
</html>`;

test.describe('checkAccessibilityHandler — bearer auth', () => {
  let server: http.Server;
  const PORT = 47400;

  test.beforeEach(async () => {
    server = await startServer((req, res) => {
      const auth = req.headers['authorization'];
      if (auth === 'Bearer a11y-test-token') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SIMPLE_HTML);
      } else {
        res.writeHead(401);
        res.end('Unauthorized');
      }
    }, PORT);
  });

  test.afterEach(async () => {
    await stopServer(server);
  });

  test('succeeds when valid bearer token provided', async () => {
    process.env['A11Y_TEST_TOKEN'] = 'a11y-test-token';
    try {
      const result = await checkAccessibilityHandler('/', {
        url: `http://127.0.0.1:${PORT}/`,
        waitFor: 'load',
        tags: ['wcag2a'],
        timeoutMs: 30_000,
        headless: true,
        auth: { bearerEnvVar: 'A11Y_TEST_TOKEN' },
      });
      expect(result.summary.passes).toBeGreaterThan(0);
    } finally {
      delete process.env['A11Y_TEST_TOKEN'];
    }
  });

  test('throws AuthEnvVarMissingError when env var is unset', async () => {
    delete process.env['A11Y_MISSING_TOKEN'];
    await expect(
      checkAccessibilityHandler('/', {
        url: `http://127.0.0.1:${PORT}/`,
        waitFor: 'load',
        tags: ['wcag2a'],
        timeoutMs: 30_000,
        headless: true,
        auth: { bearerEnvVar: 'A11Y_MISSING_TOKEN' },
      }),
    ).rejects.toThrow(AuthEnvVarMissingError);
  });
});
