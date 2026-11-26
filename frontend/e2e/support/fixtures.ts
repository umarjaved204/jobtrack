// `test` for every e2e spec: Playwright's, plus `issues`, which records what went wrong in
// the page. Any uncaught exception fails the test; console errors are kept for the specs
// that assert on them (some are expected, e.g. the anonymous /auth/refresh 401, ADR 0002).
import { test as base, expect } from '@playwright/test';

export interface BrowserIssues {
  /** Uncaught exceptions on the page. */
  pageErrors: Error[];
  /** `console.error` text, which in Chromium includes failed and blocked loads. */
  consoleErrors: string[];
}

export const test = base.extend<{ issues: BrowserIssues }>({
  issues: [
    async ({ page }, use) => {
      const issues: BrowserIssues = { pageErrors: [], consoleErrors: [] };
      page.on('pageerror', (error) => issues.pageErrors.push(error));
      page.on('console', (message) => {
        if (message.type() === 'error') issues.consoleErrors.push(message.text());
      });
      await use(issues);
      expect(issues.pageErrors, 'uncaught errors on the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
