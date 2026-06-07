// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/*
 * Playwright configuration for the hub board end-to-end tests.
 *
 * The hub server is NOT started here via `webServer`: each test worker starts
 * its own server against a private copy of the fixture project (see
 * tests/hub-fixture.js), so a test that mutates the project's state on disk
 * cannot disturb another worker. baseURL is therefore set per-test from the
 * worker fixture rather than globally.
 *
 * The browser is pinned to Chromium. Set PWTEST_HEADED=1 to watch a run.
 */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    headless: !process.env.PWTEST_HEADED,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
