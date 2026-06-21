import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SetupAuthInput, SetupAuthOutput } from './schema.js';
import { hashBaseUrl, getAuthDir, AuthEnvVarMissingError } from '../../shared/auth-context.js';

const LOGIN_PATH_RE = /\/(login|signin|sign-in|auth|sso|mfa|otp|captcha|oauth|saml)(\/|$)/i;

export class MfaRequiredError extends Error {
  readonly code = 'MfaRequired';
  constructor(finalUrl: string) {
    super(
      `Login did not redirect away from the login page — MFA, CAPTCHA, or OAuth may be required. ` +
      `Detected URL: "${finalUrl}". Please generate storageState manually.`,
    );
    this.name = 'MfaRequiredError';
  }
}

export class LoginPageUnreachableError extends Error {
  readonly code = 'LoginPageUnreachable';
  constructor(url: string, status: number) {
    super(`Login page unreachable: "${url}" returned HTTP ${status}`);
    this.name = 'LoginPageUnreachableError';
  }
}

export async function setupAuthHandler(input: SetupAuthInput): Promise<SetupAuthOutput> {
  const username = process.env[input.usernameEnvVar];
  if (!username) throw new AuthEnvVarMissingError(input.usernameEnvVar);
  const password = process.env[input.passwordEnvVar];
  if (!password) throw new AuthEnvVarMissingError(input.passwordEnvVar);

  const hash = hashBaseUrl(input.baseUrl);
  const authDir = getAuthDir();
  await fs.mkdir(authDir, { recursive: true });
  const outFile = path.join(authDir, `${hash}.json`).replace(/\\/g, '/');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto(input.loginUrl, { timeout: input.navigationTimeoutMs });
    if (!response || !response.ok()) {
      throw new LoginPageUnreachableError(input.loginUrl, response?.status() ?? 0);
    }

    await page.locator(input.usernameSelector).first().fill(username);
    await page.locator(input.passwordSelector).first().fill(password);

    const nav = page.waitForNavigation({ timeout: input.navigationTimeoutMs }).catch(() => null);
    await page.locator(input.submitSelector).first().click();
    await nav;

    if (input.postLoginWaitMs > 0) {
      await page.waitForTimeout(input.postLoginWaitMs);
    }

    const finalUrl = page.url();
    const loginOriginPath = (() => {
      try { return new URL(input.loginUrl).pathname; } catch { return ''; }
    })();
    const finalPath = (() => {
      try { return new URL(finalUrl).pathname; } catch { return ''; }
    })();

    if (finalPath === loginOriginPath || LOGIN_PATH_RE.test(finalPath)) {
      throw new MfaRequiredError(finalUrl);
    }

    await context.storageState({ path: outFile });

    return {
      storageStatePath: outFile,
      baseUrl: input.baseUrl,
      baseUrlHash: hash,
      createdAt: new Date().toISOString(),
      finalUrl,
    };
  } finally {
    await browser.close();
  }
}
