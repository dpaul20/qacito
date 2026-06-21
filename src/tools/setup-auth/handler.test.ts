import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setupAuthHandler } from './handler.js';
import { MfaRequiredError } from './handler.js';
import { discoverStorageState, hashBaseUrl } from '../../shared/auth-context.js';
import { AuthEnvVarMissingError } from '../../shared/auth-context.js';

const LOGIN_HTML = `<!DOCTYPE html>
<html><body>
<form method="POST" action="/login">
  <input type="email" name="email" />
  <input type="password" name="password" />
  <button type="submit">Login</button>
</form>
</body></html>`;

const DASHBOARD_HTML = `<!DOCTYPE html><html><body><h1>Dashboard</h1></body></html>`;

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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

test.describe('setupAuthHandler', () => {
  let authDir: string;
  let prevAuthDir: string | undefined;

  test.beforeEach(() => {
    authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-setup-auth-'));
    prevAuthDir = process.env['QACITO_AUTH_DIR'];
    process.env['QACITO_AUTH_DIR'] = authDir;
  });

  test.afterEach(() => {
    if (prevAuthDir !== undefined) {
      process.env['QACITO_AUTH_DIR'] = prevAuthDir;
    } else {
      delete process.env['QACITO_AUTH_DIR'];
    }
    fs.rmSync(authDir, { recursive: true, force: true });
  });

  test('happy path — saves storageState with cookies key', async () => {
    const PORT = 47400;
    const server = await startServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(LOGIN_HTML);
      } else if (req.method === 'POST' && req.url === '/login') {
        await readBody(req);
        res.writeHead(302, { Location: `http://127.0.0.1:${PORT}/dashboard` });
        res.end();
      } else if (req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(DASHBOARD_HTML);
      } else {
        res.writeHead(404);
        res.end();
      }
    }, PORT);

    process.env['TEST_SA_USER'] = 'user@test.com';
    process.env['TEST_SA_PASS'] = 'secret';

    try {
      const baseUrl = `http://127.0.0.1:${PORT}`;
      const result = await setupAuthHandler({
        baseUrl,
        loginUrl: `${baseUrl}/login`,
        usernameEnvVar: 'TEST_SA_USER',
        passwordEnvVar: 'TEST_SA_PASS',
        usernameSelector: 'input[type=email]',
        passwordSelector: 'input[type=password]',
        submitSelector: 'button[type=submit]',
        navigationTimeoutMs: 15_000,
        postLoginWaitMs: 0,
      });

      expect(result.storageStatePath).toBeTruthy();
      expect(fs.existsSync(result.storageStatePath)).toBe(true);

      const raw = fs.readFileSync(result.storageStatePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      expect(parsed).toBeTruthy();
      expect(typeof parsed).toBe('object');
      const obj = parsed as Record<string, unknown>;
      expect('cookies' in obj || 'origins' in obj).toBe(true);

      expect(result.baseUrl).toBe(baseUrl);
      expect(result.baseUrlHash).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.finalUrl).toContain('/dashboard');
    } finally {
      delete process.env['TEST_SA_USER'];
      delete process.env['TEST_SA_PASS'];
      await stopServer(server);
    }
  });

  test('MFA simulation — server stays on login page → MfaRequiredError', async () => {
    const PORT = 47401;
    const server = await startServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(LOGIN_HTML);
      } else if (req.method === 'POST' && req.url === '/login') {
        await readBody(req);
        // Always re-render login — simulates wrong creds / MFA prompt
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(LOGIN_HTML);
      } else {
        res.writeHead(404);
        res.end();
      }
    }, PORT);

    process.env['TEST_SA_USER2'] = 'user@test.com';
    process.env['TEST_SA_PASS2'] = 'wrong';

    try {
      const baseUrl = `http://127.0.0.1:${PORT}`;
      await expect(
        setupAuthHandler({
          baseUrl,
          loginUrl: `${baseUrl}/login`,
          usernameEnvVar: 'TEST_SA_USER2',
          passwordEnvVar: 'TEST_SA_PASS2',
          usernameSelector: 'input[type=email]',
          passwordSelector: 'input[type=password]',
          submitSelector: 'button[type=submit]',
          navigationTimeoutMs: 10_000,
          postLoginWaitMs: 0,
        }),
      ).rejects.toThrow(MfaRequiredError);
    } finally {
      delete process.env['TEST_SA_USER2'];
      delete process.env['TEST_SA_PASS2'];
      await stopServer(server);
    }
  });

  test('missing env var — throws AuthEnvVarMissingError before browser launch', async () => {
    delete process.env['QACITO_SA_UNSET_USER'];
    delete process.env['QACITO_SA_UNSET_PASS'];

    await expect(
      setupAuthHandler({
        baseUrl: 'http://127.0.0.1:9999',
        loginUrl: 'http://127.0.0.1:9999/login',
        usernameEnvVar: 'QACITO_SA_UNSET_USER',
        passwordEnvVar: 'QACITO_SA_UNSET_PASS',
        usernameSelector: 'input[type=email]',
        passwordSelector: 'input[type=password]',
        submitSelector: 'button[type=submit]',
        navigationTimeoutMs: 15_000,
        postLoginWaitMs: 0,
      }),
    ).rejects.toThrow(AuthEnvVarMissingError);
  });

  test('auto-discovery after happy path — discoverStorageState returns the saved path; stale mtime returns null', async () => {
    const PORT = 47402;
    const server = await startServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(LOGIN_HTML);
      } else if (req.method === 'POST' && req.url === '/login') {
        await readBody(req);
        res.writeHead(302, { Location: `http://127.0.0.1:${PORT}/dashboard` });
        res.end();
      } else if (req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(DASHBOARD_HTML);
      } else {
        res.writeHead(404);
        res.end();
      }
    }, PORT);

    process.env['TEST_SA_USER3'] = 'user@test.com';
    process.env['TEST_SA_PASS3'] = 'secret';

    try {
      const baseUrl = `http://127.0.0.1:${PORT}`;
      const setupResult = await setupAuthHandler({
        baseUrl,
        loginUrl: `${baseUrl}/login`,
        usernameEnvVar: 'TEST_SA_USER3',
        passwordEnvVar: 'TEST_SA_PASS3',
        usernameSelector: 'input[type=email]',
        passwordSelector: 'input[type=password]',
        submitSelector: 'button[type=submit]',
        navigationTimeoutMs: 15_000,
        postLoginWaitMs: 0,
      });

      // Auto-discovery should find the file
      const discovered = await discoverStorageState(baseUrl);
      expect(discovered).not.toBeNull();
      expect(discovered).toBe(setupResult.storageStatePath);

      // Stale the file by 25 hours — discovery should return null
      const hash = hashBaseUrl(baseUrl);
      const filePath = path.join(authDir, `${hash}.json`);
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      fs.utimesSync(filePath, twentyFiveHoursAgo, twentyFiveHoursAgo);

      const staleDiscovered = await discoverStorageState(baseUrl);
      expect(staleDiscovered).toBeNull();
    } finally {
      delete process.env['TEST_SA_USER3'];
      delete process.env['TEST_SA_PASS3'];
      await stopServer(server);
    }
  });
});
