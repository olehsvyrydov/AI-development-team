import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Headless e2e: stand up the real hub registry API and the cockpit dev server (which proxies
 * /api to the hub), then drive the connect → card → enter-project flow in a browser.
 *
 * Isolation: the hub's registry lives under ~/.aidevteam/registry.json. We point the hub at a
 * throwaway HOME so the developer's real registry is never touched. A throwaway project folder
 * (with a README the analyzer can summarise) is created for the connect step; its absolute path
 * is handed to the spec via an env var.
 */
const TEMP_HOME = mkdtempSync(join(tmpdir(), 'aidt-cockpit-home-'));
const TEMP_PROJECT = mkdtempSync(join(tmpdir(), 'aidt-cockpit-project-'));
mkdirSync(join(TEMP_HOME, '.aidevteam'), { recursive: true });
writeFileSync(
  join(TEMP_PROJECT, 'README.md'),
  '# temp-fixture-project\n\nA throwaway fixture used by the cockpit end-to-end test.\n',
);

/**
 * Extra throwaway project folders for the broader e2e coverage. Each is a distinct directory
 * (distinct hub project id) with a README whose first paragraph becomes the card/shell
 * description, so specs can identify a card by its own stable description text.
 *
 * `untrusted` carries an XSS payload in its README to prove the cockpit renders README text as
 * inert, escaped content (never as live DOM or a running script).
 */
function makeFixture(slug: string, readme: string): string {
  const dir = mkdtempSync(join(tmpdir(), `aidt-cockpit-${slug}-`));
  writeFileSync(join(dir, 'README.md'), readme);
  return dir;
}

const FIXTURES = {
  // Two distinct projects with unique, assertion-friendly descriptions (flow: multi-project + idempotency).
  alpha: makeFixture(
    'alpha',
    '# alpha-fixture\n\nFirst distinct fixture describing the alpha launcher tile uniquely.\n',
  ),
  beta: makeFixture(
    'beta',
    '# beta-fixture\n\nSecond distinct fixture describing the beta launcher tile uniquely.\n',
  ),
  // README first paragraph carries an XSS payload (flow: untrusted README rendered inert).
  untrusted: makeFixture(
    'untrusted',
    '# untrusted-fixture\n\nBEGIN_PAYLOAD <img src=x onerror="window.__xssImg=1"> ' +
      '<script>window.__xssScript=1</script> END_PAYLOAD inert marker text.\n',
  ),
  // A real file (not a directory) — connecting its path must surface a "not a directory" error.
  notDir: (() => {
    const dir = mkdtempSync(join(tmpdir(), 'aidt-cockpit-notdir-'));
    const file = join(dir, 'a-file-not-a-dir.txt');
    writeFileSync(file, 'this is a regular file, not a project directory\n');
    return file;
  })(),
  // A path that does not exist on disk.
  missing: join(tmpdir(), `aidt-cockpit-missing-${Date.now()}-does-not-exist`),
};

const HUB_PORT = 4477;
const APP_PORT = 4599;
const REPO_ROOT = join(__dirname, '..', '..');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node hub/server.js "${TEMP_PROJECT}" --port ${HUB_PORT}`,
      cwd: REPO_ROOT,
      env: { HOME: TEMP_HOME },
      port: HUB_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx ng serve --port ${APP_PORT} --host localhost`,
      cwd: __dirname,
      port: APP_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  metadata: { tempProjectPath: TEMP_PROJECT, tempHome: TEMP_HOME },
});

// The config runs in the main process; specs run in workers and don't inherit env mutated here.
// Persist the temp project path to a file the spec reads (a stable, well-known location).
writeFileSync(join(__dirname, 'e2e', '.temp-project-path'), TEMP_PROJECT);

// The broader specs read their fixture paths from a JSON manifest at the same well-known location.
writeFileSync(join(__dirname, 'e2e', '.fixtures.json'), JSON.stringify(FIXTURES, null, 2));
