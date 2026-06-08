import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Headless e2e: stand up the real hub registry API and the cockpit dev server (which proxies
 * /api to the hub), then drive the redesigned launcher → folder-picker → card → project-shell
 * flow in a browser.
 *
 * Isolation: the hub's registry lives under ~/.aidevteam/registry.json, and the folder-picker's
 * read-only directory browser is confined to realpath($HOME). We point the hub at a throwaway
 * HOME so the developer's real registry and home directory are never touched. Every fixture
 * folder is created INSIDE that throwaway HOME, so the picker can navigate to it and the registry
 * can connect it.
 *
 * Determinism: this config module is imported by Playwright more than once (config load + run),
 * and the webServer subprocess reads HOME from the env set here, so the throwaway HOME and the
 * fixture names MUST be STABLE across evaluations — otherwise the manifest the specs read would
 * point at different random folders than the ones the hub serves. We therefore use FIXED paths
 * and slugs (not mkdtemp) under a single well-known throwaway root, recreated clean on each load.
 */
const TEMP_HOME = join(tmpdir(), 'aidt-cockpit-e2e-home');

/** Fixed fixture slugs (stable across config evaluations). */
const SLUGS = { demo: 'demo-project', pickerParent: 'picker-parent', untrusted: 'untrusted-readme' } as const;

// A single prose paragraph long enough to wrap across several lines in the shell header — the
// shell renders it untruncated (no line-clamp) while the card clamps the same text to two lines.
// Kept under the analyzer's short-description cap (280 chars) so it is stored and shown verbatim.
const DEMO_DESC =
  'The DART demo workspace is a self-contained fixture that exercises the per-project shell from ' +
  'end to end, carrying a description long enough to wrap across several lines so the header proves ' +
  'it renders the full passage without truncation.';

const DEMO_LEDGER = JSON.stringify({
  'DEMO-1': { title: 'Draft the launcher pitch', track: 'feature', stage: 'vision', assignee: 'max' },
  'DEMO-2': { title: 'Wire the registry API', track: 'feature', stage: 'backend', assignee: 'james' },
  'DEMO-3': { title: 'Pick the folder picker shape', track: 'feature', stage: 'design', assignee: 'aura' },
  'DEMO-4': { title: 'Ship the first slice', track: 'feature', stage: 'done' },
  'DEMO-5': { title: 'Capture the retro', track: 'feature', stage: 'review' },
});

/**
 * A fixture folder under the throwaway HOME, with files. IDEMPOTENT and NON-destructive: it
 * (re)writes the files but never removes the tree. This matters because Playwright may import this
 * config module more than once during a run; a destructive setup here would wipe the registry
 * (and the projects the specs connected) mid-suite. The one-time registry reset lives in
 * `e2e/global-setup.ts`, which Playwright runs exactly once before the suite.
 */
function makeFixture(slug: string, files: Record<string, string>): string {
  const dir = join(TEMP_HOME, slug);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contents);
  }
  return dir;
}

mkdirSync(join(TEMP_HOME, '.aidevteam'), { recursive: true });

/**
 * The DEMO project — a folder carrying real ADT artefacts so connecting it yields a fully
 * populated Project Shell: a long README first paragraph (untruncated shell header), CLAUDE.md
 * (the hub's "has artefacts" fast path → it projects workflow/tasks/base state), a ticket ledger
 * (deterministic task counts), and docs/*.md (the Base panel's document count + method line). The
 * workflow rail's stages/owners/gates come from the framework's bundled default workflow.
 */
const DEMO = makeFixture(SLUGS.demo, {
  'README.md': `# dart-demo\n\n${DEMO_DESC}\n`,
  'CLAUDE.md': '# Demo project context\n\nArtefact marker so the hub projects shell state.\n',
  '.workflow-state.json': DEMO_LEDGER,
  'docs/architecture.md': '# Architecture\n\nHow the demo is wired.\n',
  'docs/security.md': '# Security\n\nThe read-only browser is confined to $HOME.\n',
  'docs/runbook.md': '# Runbook\n\nHow to operate the demo.\n',
});

// Folder-picker navigation fixture with a nested child to drill into.
const PICKER_PARENT = makeFixture(SLUGS.pickerParent, {
  'README.md': '# picker-parent\n\nA folder the picker can open and connect.\n',
  'child-folder/keep.txt': 'a nested folder so the picker has something to drill into\n',
});

// README first paragraph carries an XSS payload (rendered inert, escaped — never live DOM/script).
const UNTRUSTED = makeFixture(SLUGS.untrusted, {
  'README.md':
    '# untrusted-fixture\n\nBEGIN_PAYLOAD <img src=x onerror="window.__xssImg=1"> ' +
    '<script>window.__xssScript=1</script> END_PAYLOAD inert marker text.\n',
});

const FIXTURES = {
  tempHome: TEMP_HOME,
  demo: DEMO,
  demoBasename: SLUGS.demo,
  demoDescription: DEMO_DESC,
  pickerParent: PICKER_PARENT,
  pickerParentBasename: SLUGS.pickerParent,
  untrusted: UNTRUSTED,
  untrustedBasename: SLUGS.untrusted,
};

const HUB_PORT = 4477;
const APP_PORT = 4599;
const REPO_ROOT = join(__dirname, '..', '..');

// Persist the fixture paths to a JSON manifest the specs read (a stable, well-known location).
// Written on every config load; the slugs are fixed, so every evaluation writes the same paths.
writeFileSync(join(__dirname, 'e2e', '.fixtures.json'), JSON.stringify(FIXTURES, null, 2));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // Runs once before the suite: empties the throwaway registry so the first-run empty-state spec
  // sees zero projects. Reads the home path from the manifest written above.
  globalSetup: require.resolve('./e2e/global-setup'),
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node hub/server.js "${TEMP_HOME}" --port ${HUB_PORT}`,
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
  metadata: { tempHome: TEMP_HOME },
});
