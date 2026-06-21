import { test, expect } from '@playwright/test';
import { getTemplate, extractVariables, type TemplateMethod } from './templates.js';
import { getApiTemplateHandler } from './handler.js';

// ---------------------------------------------------------------------------
// getTemplate
// ---------------------------------------------------------------------------

test.describe('getTemplate', () => {
  const methods: TemplateMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'error'];

  for (const method of methods) {
    test(`returns a non-empty string for method "${method}"`, () => {
      const template = getTemplate(method);
      expect(typeof template).toBe('string');
      expect(template.length).toBeGreaterThan(0);
    });

    test(`template for "${method}" imports from @playwright/test`, () => {
      const template = getTemplate(method);
      expect(template).toContain("from '@playwright/test'");
    });

    test(`template for "${method}" uses the request fixture (no page/browser)`, () => {
      const template = getTemplate(method);
      expect(template).toContain('request');
      expect(template).not.toContain('page.');
      expect(template).not.toContain('browser.');
    });

    test(`template for "${method}" contains {{ENDPOINT}} placeholder`, () => {
      const template = getTemplate(method);
      expect(template).toContain('{{ENDPOINT}}');
    });

    test(`template for "${method}" contains {{EXPECTED_STATUS}} placeholder`, () => {
      const template = getTemplate(method);
      expect(template).toContain('{{EXPECTED_STATUS}}');
    });
  }

  test('GET template contains response.ok() assertion', () => {
    expect(getTemplate('GET')).toContain('response.ok()');
  });

  test('error template asserts response.ok() is falsy', () => {
    expect(getTemplate('error')).toContain('toBeFalsy()');
  });
});

// ---------------------------------------------------------------------------
// extractVariables
// ---------------------------------------------------------------------------

test.describe('extractVariables', () => {
  test('extracts all {{PLACEHOLDER}} variables from a template string', () => {
    const template = 'Hello {{NAME}}, your {{ROLE}} is set.';
    const vars = extractVariables(template);
    expect(vars).toContain('{{NAME}}');
    expect(vars).toContain('{{ROLE}}');
  });

  test('returns each variable only once (deduplicated)', () => {
    const template = '{{FOO}} and {{FOO}} again, plus {{BAR}}';
    const vars = extractVariables(template);
    const fooCount = vars.filter((v) => v === '{{FOO}}').length;
    expect(fooCount).toBe(1);
    expect(vars).toContain('{{BAR}}');
  });

  test('returns an empty array when no placeholders are present', () => {
    const vars = extractVariables('No placeholders here.');
    expect(vars).toEqual([]);
  });

  test('ignores lowercase placeholder patterns', () => {
    // Only {{UPPER_SNAKE_CASE}} patterns are captured
    const vars = extractVariables('{{valid}} {{VALID}} {{also_invalid}}');
    expect(vars).toContain('{{VALID}}');
    expect(vars).not.toContain('{{valid}}');
  });
});

// ---------------------------------------------------------------------------
// getApiTemplateHandler
// ---------------------------------------------------------------------------

test.describe('getApiTemplateHandler', () => {
  test('substitutes {{ENDPOINT}} with the provided endpoint', async () => {
    const output = await getApiTemplateHandler({
      method: 'GET',
      endpoint: '/api/users',
      expectedStatus: 200,
    });
    expect(output.template).toContain('/api/users');
    expect(output.template).not.toContain('{{ENDPOINT}}');
  });

  test('substitutes {{EXPECTED_STATUS}} with the provided status code', async () => {
    const output = await getApiTemplateHandler({
      method: 'POST',
      endpoint: '/api/items',
      expectedStatus: 201,
    });
    expect(output.template).toContain('201');
    expect(output.template).not.toContain('{{EXPECTED_STATUS}}');
  });

  test('returns the method as the "type" field', async () => {
    const output = await getApiTemplateHandler({
      method: 'DELETE',
      endpoint: '/api/items/1',
      expectedStatus: 204,
    });
    expect(output.type).toBe('DELETE');
  });

  test('variables list does NOT include already-substituted ENDPOINT or EXPECTED_STATUS', async () => {
    const output = await getApiTemplateHandler({
      method: 'GET',
      endpoint: '/api/health',
      expectedStatus: 200,
    });
    expect(output.variables).not.toContain('{{ENDPOINT}}');
    expect(output.variables).not.toContain('{{EXPECTED_STATUS}}');
  });

  test('variables list contains remaining unresolved placeholders (e.g. BASE_URL)', async () => {
    const output = await getApiTemplateHandler({
      method: 'GET',
      endpoint: '/api/health',
      expectedStatus: 200,
    });
    // GET template always contains {{BASE_URL}} and {{AUTH_TOKEN}}
    expect(output.variables).toContain('{{BASE_URL}}');
    expect(output.variables).toContain('{{AUTH_TOKEN}}');
  });

  test('works for all supported HTTP methods', async () => {
    const methods: TemplateMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'error'];
    for (const method of methods) {
      const output = await getApiTemplateHandler({
        method,
        endpoint: '/api/test',
        expectedStatus: 200,
      });
      expect(output.template.length).toBeGreaterThan(0);
      expect(output.type).toBe(method);
    }
  });
});

// ---------------------------------------------------------------------------
// Screenshot template — VR-6 / VR-7
// ---------------------------------------------------------------------------

test.describe('screenshot template (VR-6/VR-7)', () => {
  const template = getTemplate('screenshot');

  // VR-6: basic structure
  test('imports from @playwright/test', () => {
    expect(template).toContain("from '@playwright/test'");
  });

  test('uses page fixture, not request fixture', () => {
    expect(template).toContain('page');
    expect(template).not.toContain('{ request }');
  });

  test('contains toHaveScreenshot assertion', () => {
    expect(template).toContain('toHaveScreenshot');
  });

  test('contains {{SNAPSHOT_NAME}} placeholder', () => {
    expect(template).toContain('{{SNAPSHOT_NAME}}');
  });

  test('contains {{BASE_URL}} placeholder', () => {
    expect(template).toContain('{{BASE_URL}}');
  });

  // VR-6: no CSS selectors
  test('does not contain CSS selector patterns (.class, #id, querySelector)', () => {
    // Detect Playwright CSS-selector locator calls: locator('.'), $('.')
    expect(template).not.toMatch(/locator\(['"]\./);;
    expect(template).not.toMatch(/\$\(['"][\.|#]/);
    expect(template).not.toContain('querySelector');
  });

  // VR-7: locators use role/text/testId only
  test('uses getByRole, getByText, or getByTestId for element interactions', () => {
    // The template uses page.goto and page.waitForLoadState — no element selectors
    // Any locator call present must be a semantic locator
    const hasCssLocator = /page\.\$|page\.locator\(['"]\.|\$\(/.test(template);
    expect(hasCssLocator).toBe(false);
  });
});
