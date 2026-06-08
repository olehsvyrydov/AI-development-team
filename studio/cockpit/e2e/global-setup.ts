import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One-time suite setup: empty the throwaway hub registry so the first-run empty-state spec sees
 * zero connected projects. Playwright runs this exactly once, before the webServer (hub) starts,
 * so the hub boots with a clean registry. The fixture folders themselves are created by the config
 * (idempotently, non-destructively); only the registry index is reset here.
 */
export default function globalSetup(): void {
  const manifest = JSON.parse(readFileSync(join(__dirname, '.fixtures.json'), 'utf8')) as { tempHome: string };
  const adtDir = join(manifest.tempHome, '.aidevteam');
  mkdirSync(adtDir, { recursive: true });
  writeFileSync(join(adtDir, 'registry.json'), JSON.stringify({ version: 1, projects: [] }, null, 2));
}
