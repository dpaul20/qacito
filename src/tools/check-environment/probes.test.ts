import { test, expect } from '@playwright/test';
import http from 'node:http';
import { urlProbe } from './probes.js';

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

test.describe('urlProbe', () => {
  test('200 direct — ok: true, no errorCode', async () => {
    const PORT = 47300;
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>OK</body></html>');
    }, PORT);

    try {
      const result = await urlProbe(`http://127.0.0.1:${PORT}/`, 5_000);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.errorCode).toBeUndefined();
    } finally {
      await stopServer(server);
    }
  });

  test('302 to /login — ok: false, errorCode: AuthRequired', async () => {
    const PORT = 47301;
    const server = await startServer((req, res) => {
      if (req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Login</body></html>');
      } else {
        res.writeHead(302, { Location: `http://127.0.0.1:${PORT}/login` });
        res.end();
      }
    }, PORT);

    try {
      const result = await urlProbe(`http://127.0.0.1:${PORT}/`, 5_000);
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe('AuthRequired');
    } finally {
      await stopServer(server);
    }
  });

  test('401 direct — ok: false, errorCode: AuthRequired', async () => {
    const PORT = 47302;
    const server = await startServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
    }, PORT);

    try {
      const result = await urlProbe(`http://127.0.0.1:${PORT}/`, 5_000);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.errorCode).toBe('AuthRequired');
      expect(result.finalUrl).toBeUndefined();
    } finally {
      await stopServer(server);
    }
  });

  test('302 to /dashboard (non-auth redirect) — ok: true, no errorCode', async () => {
    const PORT = 47303;
    const server = await startServer((req, res) => {
      if (req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Dashboard</body></html>');
      } else {
        res.writeHead(302, { Location: `http://127.0.0.1:${PORT}/dashboard` });
        res.end();
      }
    }, PORT);

    try {
      const result = await urlProbe(`http://127.0.0.1:${PORT}/`, 5_000);
      expect(result.ok).toBe(true);
      expect(result.errorCode).toBeUndefined();
    } finally {
      await stopServer(server);
    }
  });
});
