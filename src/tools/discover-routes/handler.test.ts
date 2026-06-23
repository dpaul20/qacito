import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverRoutesHandler, InvalidUrlError } from './handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qacito-discover-routes-'));
}

function startServer(
  handler: http.RequestListener,
  port: number,
): Promise<http.Server> {
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

// ---------------------------------------------------------------------------
// Scenario 1: sitemap path
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — sitemap path', () => {
  let server: http.Server;
  const PORT = 47201;
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = makeTempDir();
    server = await startServer((req, res) => {
      if (req.url === '/sitemap.xml') {
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `  <url><loc>http://127.0.0.1:${PORT}/</loc></url>`,
          `  <url><loc>http://127.0.0.1:${PORT}/about</loc></url>`,
          '</urlset>',
        ].join('\n');
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(xml);
      } else {
        res.writeHead(404);
        res.end();
      }
    }, PORT);
  });

  test.afterEach(async () => {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns sitemap source with both loc entries', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      maxDepth: 2,
      maxUrls: 100,
      timeoutMs: 30_000,
    });

    expect(result.source).toBe('sitemap');
    expect(result.urls).toContain(`http://127.0.0.1:${PORT}/`);
    expect(result.urls).toContain(`http://127.0.0.1:${PORT}/about`);
    expect(result.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: crawl path (no sitemap)
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — crawl path', () => {
  let server: http.Server;
  const PORT = 47202;
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = makeTempDir();
    server = await startServer((req, res) => {
      if (req.url === '/sitemap.xml') {
        res.writeHead(404);
        res.end();
      } else if (req.url === '/' || req.url === '') {
        const html = `<!DOCTYPE html><html><body><a href="/about">About</a></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else if (req.url === '/about') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body>About</body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    }, PORT);
  });

  test.afterEach(async () => {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns crawl source and discovers /about link', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      maxDepth: 1,
      maxUrls: 100,
      timeoutMs: 30_000,
    });

    expect(result.source).toBe('crawl');
    const paths = result.urls.map((u) => new URL(u).pathname);
    expect(paths).toContain('/about');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: external URL filtered
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — external URL filtered', () => {
  let server: http.Server;
  const PORT = 47203;
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = makeTempDir();
    server = await startServer((req, res) => {
      if (req.url === '/sitemap.xml') {
        res.writeHead(404);
        res.end();
      } else if (req.url === '/' || req.url === '') {
        const html = [
          '<!DOCTYPE html><html><body>',
          '<a href="/internal">Internal</a>',
          '<a href="https://other.com/page">External</a>',
          '</body></html>',
        ].join('');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body></body></html>');
      }
    }, PORT);
  });

  test.afterEach(async () => {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('does not include external URLs in results', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      maxDepth: 1,
      maxUrls: 100,
      timeoutMs: 30_000,
    });

    expect(result.source).toBe('crawl');
    const hasExternal = result.urls.some((u) => u.includes('other.com'));
    expect(hasExternal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: filesystem fallback for SPAs (no <a> links in initial HTML)
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — filesystem fallback (SPA)', () => {
  let server: http.Server;
  const PORT = 47205;
  let tmpDir: string;

  test.beforeEach(async () => {
    tmpDir = makeTempDir();
    server = await startServer((req, res) => {
      if (req.url === '/sitemap.xml') {
        res.writeHead(404);
        res.end();
      } else {
        // SPA shell — no <a> links
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
      }
    }, PORT);

    // Next.js App Router structure under tmpDir
    fs.mkdirSync(path.join(tmpDir, 'app', 'dashboard'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'app', 'settings'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'app', 'page.tsx'), '// home');
    fs.writeFileSync(path.join(tmpDir, 'app', 'dashboard', 'page.tsx'), '// dashboard');
    fs.writeFileSync(path.join(tmpDir, 'app', 'settings', 'page.tsx'), '// settings');
  });

  test.afterEach(async () => {
    await stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('DR-FS1: discovers App Router pages when crawl returns only root', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      projectRoot: tmpDir,
      maxDepth: 2,
      maxUrls: 100,
      timeoutMs: 30_000,
    });

    expect(['crawl+filesystem', 'filesystem']).toContain(result.source);
    const paths = result.urls.map((u) => new URL(u).pathname);
    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/settings');
    expect(result.warnings.some((w) => w.includes('filesystem'))).toBe(true);
  });

  test('DR-FS2: no filesystem fallback when projectRoot is omitted', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      maxDepth: 2,
      maxUrls: 100,
      timeoutMs: 30_000,
    });

    expect(result.source).toBe('crawl');
    expect(result.urls.length).toBeLessThanOrEqual(1);
  });

  test('DR-FS3: discovers Pages Router pages when no App Router directory exists', async () => {
    const pagesRoot = makeTempDir();
    fs.mkdirSync(path.join(pagesRoot, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(pagesRoot, 'pages', 'index.tsx'), '// home');
    fs.writeFileSync(path.join(pagesRoot, 'pages', 'about.tsx'), '// about');
    fs.writeFileSync(path.join(pagesRoot, 'pages', '_app.tsx'), '// _app');

    try {
      const result = await discoverRoutesHandler({
        baseUrl: `http://127.0.0.1:${PORT}`,
        projectRoot: pagesRoot,
        maxDepth: 2,
        maxUrls: 100,
        timeoutMs: 30_000,
      });

      expect(['crawl+filesystem', 'filesystem']).toContain(result.source);
      const paths = result.urls.map((u) => new URL(u).pathname);
      expect(paths).toContain('/about');
      // _app.tsx is an internal Next.js file and must be excluded
      expect(paths).not.toContain('/_app');
    } finally {
      fs.rmSync(pagesRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: invalid URL throws InvalidUrlError
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — invalid URL', () => {
  test('throws InvalidUrlError for a non-URL string', async () => {
    await expect(
      discoverRoutesHandler({
        baseUrl: 'not-a-url',
        maxDepth: 2,
        maxUrls: 100,
        timeoutMs: 30_000,
      }),
    ).rejects.toThrow(InvalidUrlError);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: bearer auth — server requires Authorization header
// ---------------------------------------------------------------------------

test.describe('discoverRoutesHandler — bearer auth integration', () => {
  let server: http.Server;
  const PORT = 47204;

  test.beforeEach(async () => {
    server = await startServer((req, res) => {
      if (req.url === '/sitemap.xml') {
        res.writeHead(404);
        res.end();
        return;
      }
      const auth = req.headers['authorization'];
      if (auth === 'Bearer discover-test-token') {
        if (req.url === '/' || req.url === '') {
          const html = `<!DOCTYPE html><html><body><a href="/page1">Page1</a></body></html>`;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<!DOCTYPE html><html><body>Page</body></html>');
        }
      } else {
        res.writeHead(401);
        res.end('Unauthorized');
      }
    }, PORT);
  });

  test.afterEach(async () => {
    await stopServer(server);
  });

  test('discovers routes when valid bearer token provided', async () => {
    process.env['DISCOVER_TEST_TOKEN'] = 'discover-test-token';
    try {
      const result = await discoverRoutesHandler({
        baseUrl: `http://127.0.0.1:${PORT}`,
        maxDepth: 1,
        maxUrls: 100,
        timeoutMs: 30_000,
        auth: { bearerEnvVar: 'DISCOVER_TEST_TOKEN' },
      });
      expect(result.urls.length).toBeGreaterThan(0);
    } finally {
      delete process.env['DISCOVER_TEST_TOKEN'];
    }
  });

  test('emits login warning when auth omitted', async () => {
    const result = await discoverRoutesHandler({
      baseUrl: `http://127.0.0.1:${PORT}`,
      maxDepth: 1,
      maxUrls: 100,
      timeoutMs: 30_000,
    });
    expect(result.warnings.some((w) => w.includes('login'))).toBe(true);
  });
});
