import { chromium } from 'playwright';
import type { DiscoverRoutesInput, DiscoverRoutesOutput } from './schema.js';
import { resolveAuthOptions, resolveBearerHeader, discoverStorageState, type AuthConfig } from '../../shared/auth-context.js';

export class InvalidUrlError extends Error {
  readonly code = 'InvalidUrl';
  constructor(raw: string) {
    super(`Invalid URL: "${raw}"`);
    this.name = 'InvalidUrlError';
  }
}

export async function discoverRoutesHandler(
  input: DiscoverRoutesInput,
): Promise<DiscoverRoutesOutput> {
  let baseUrlParsed: URL;
  try {
    baseUrlParsed = new URL(input.baseUrl);
  } catch {
    throw new InvalidUrlError(input.baseUrl);
  }

  const impl = async (): Promise<DiscoverRoutesOutput> => {
    const storedPath = !input.auth ? await discoverStorageState(input.baseUrl) : null;
    const effectiveAuth: AuthConfig | undefined = input.auth ?? (storedPath ? { storageStatePath: storedPath } : undefined);

    // --- Sitemap attempt ---
    const sitemapResult = await trySitemap(input.baseUrl, input.maxUrls, effectiveAuth);
    if (sitemapResult !== null) {
      return { urls: sitemapResult, source: 'sitemap', warnings: [] };
    }

    // --- Crawl fallback ---
    return crawl(baseUrlParsed, input.maxDepth, input.maxUrls, effectiveAuth);
  };

  return Promise.race([impl(), rejectAfter(input.timeoutMs)]);
}

async function trySitemap(baseUrl: string, maxUrls: number, auth?: AuthConfig): Promise<string[] | null> {
  const bearerHeader = auth ? resolveBearerHeader(auth) : null;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/sitemap.xml`, {
      signal: AbortSignal.timeout(10_000),
      ...(bearerHeader ? { headers: bearerHeader } : {}),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  const looksLikeXml =
    contentType.includes('xml') ||
    body.trimStart().startsWith('<?xml') ||
    body.trimStart().startsWith('<urlset');

  if (!looksLikeXml) return null;

  const pattern = /<loc>([^<]+)<\/loc>/g;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const loc = match[1];
    if (loc !== undefined) urls.add(loc.trim());
    if (urls.size >= maxUrls) break;
  }

  if (urls.size === 0) return null;

  return [...urls].slice(0, maxUrls);
}

const LOGIN_PATH_RE_CRAWL = /\/(login|signin|sign-in|auth|sso)(\/|$|\?)/i;

async function crawl(
  baseUrlParsed: URL,
  maxDepth: number,
  maxUrls: number,
  auth?: AuthConfig,
): Promise<DiscoverRoutesOutput> {
  const warnings: string[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: baseUrlParsed.href, depth: 0 },
  ];
  const hasStorageState = auth?.storageStatePath !== undefined;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(resolveAuthOptions(auth));
    const page    = await context.newPage();

    while (queue.length > 0 && visited.size < maxUrls) {
      const item = queue.shift();
      if (item === undefined) break;
      const { url, depth } = item;

      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const response = await page.goto(url, { timeout: 10_000 });

        // Detect auth redirect
        const finalUrl = page.url();
        if (finalUrl !== url && finalUrl !== baseUrlParsed.href && depth === 0) {
          warnings.push('Site redirects to login — crawl limited');
        }
        if (
          depth === 0 &&
          response !== null &&
          (response.status() === 401 || response.status() === 403)
        ) {
          warnings.push(`Site requires login (HTTP ${response.status().toString()}) — crawl limited`);
        }
        if (
          hasStorageState &&
          depth > 0 &&
          finalUrl !== url &&
          (() => { try { return LOGIN_PATH_RE_CRAWL.test(new URL(finalUrl).pathname); } catch { return false; } })()
        ) {
          warnings.push('auth-state-expired');
        }

        if (response === null || !response.ok()) continue;
      } catch {
        continue;
      }

      if (depth >= maxDepth) continue;

      let hrefs: string[] = [];
      try {
        hrefs = await page.$$eval('a[href]', (els) =>
          els.map((e) => (e as HTMLAnchorElement).href),
        );
      } catch {
        continue;
      }

      for (const href of hrefs) {
        if (visited.size >= maxUrls) break;

        let resolved: URL;
        try {
          resolved = new URL(href, baseUrlParsed.href);
        } catch {
          continue;
        }

        // Same-origin filter
        if (resolved.origin !== baseUrlParsed.origin) continue;

        // Drop fragment-only differences
        resolved.hash = '';
        const clean = resolved.href;

        if (!visited.has(clean) && !queue.some((q) => q.url === clean)) {
          queue.push({ url: clean, depth: depth + 1 });
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { urls: [...visited], source: 'crawl', warnings };
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`discoverRoutes timed out after ${ms}ms`)), ms),
  );
}
