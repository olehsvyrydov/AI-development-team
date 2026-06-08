import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The per-project Project Shell, entered from a launcher card. The DEMO fixture carries real ADT
 * artefacts (CLAUDE.md + a ticket ledger + docs), so the hub projects a full Workflow / Tasks /
 * Base state; a long README first paragraph drives the untruncated header description.
 */
interface Fixtures {
  tempHome: string;
  demo: string;
  demoBasename: string;
  demoDescription: string;
  pickerParent: string;
  pickerParentBasename: string;
  untrusted: string;
  untrustedBasename: string;
}

function fixtures(): Fixtures | null {
  try {
    return JSON.parse(readFileSync(join(__dirname, '.fixtures.json'), 'utf8')) as Fixtures;
  } catch {
    return null;
  }
}
const FX = fixtures();

/** Connect a fixture under $HOME (by its folder basename) through the real folder picker, then enter its shell. */
async function connectAndEnter(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('open-picker').first().click();
  const row = page.getByTestId('fs-row').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: `Open ${name}` }).click();
  await expect(page.getByTestId('selected-path')).toContainText(name);
  await page.getByTestId('picker-connect').click();
  const card = page.getByTestId('project-card').filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
}

test.beforeEach(async () => {
  test.skip(!FX, 'fixture manifest not provided by the Playwright config');
});

test('shell header renders the full long description untruncated', async ({ page }) => {
  await connectAndEnter(page, FX!.demoBasename);

  await expect(page.getByRole('heading', { name: FX!.demoBasename })).toBeVisible();

  // The whole auto-collected passage is present in the header block.
  const desc = page.getByTestId('shell-description');
  await expect(desc).toContainText(FX!.demoDescription);

  // The shell does NOT line-clamp its description (unlike the launcher card, which clamps the same
  // text to two lines): no -webkit-line-clamp is applied, so the passage renders in full.
  const clamp = await desc.evaluate((el) => getComputedStyle(el).webkitLineClamp);
  expect(['none', '', 'auto']).toContain(clamp);

  // It actually wraps to more than one visual line here (a real untruncated multi-line block).
  const lines = await desc.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return Math.round(el.getBoundingClientRect().height / lh);
  });
  expect(lines).toBeGreaterThan(1);
});

test('Workflow rail shows ordered stages with owners and gate markers', async ({ page }) => {
  await connectAndEnter(page, FX!.demoBasename);

  const workflow = page.getByTestId('panel-workflow');
  await expect(workflow).toBeVisible();
  await expect(workflow.getByRole('heading', { name: 'Workflow' })).toBeVisible();

  // The active track resolves to a real sequence of stage chips (more than one stage).
  const chips = workflow.getByTestId('stage-chip');
  expect(await chips.count()).toBeGreaterThan(1);

  // At least one stage names an owning agent role (the chip carries an owner token).
  const owners = await chips.allInnerTexts();
  expect(owners.join(' ')).toMatch(/\/[a-z]+/);

  // At least one stage carries a governing gate marker (hard or soft).
  const gateMarkers = workflow.locator('[data-testid^="gate-"]');
  expect(await gateMarkers.count()).toBeGreaterThan(0);

  // The screen-reader-equivalent ordered list mirrors the rail in prose ("stage (/owner, gate)").
  await expect(workflow.getByTestId('workflow-alt')).toContainText('gate');
});

test('Tasks panel shows honest, non-zero counts derived from the ledger', async ({ page }) => {
  await connectAndEnter(page, FX!.demoBasename);

  const tasks = page.getByTestId('panel-tasks');
  await expect(tasks).toBeVisible();
  await expect(tasks.getByRole('heading', { name: 'Tasks' })).toBeVisible();

  // The five seeded tickets surface as a total and at least one populated status bucket.
  await expect(tasks.getByTestId('tasks-total')).toHaveText('5');
  await expect(tasks.getByTestId('count-done')).toContainText('done');
  // The empty-state invitation must NOT show when there are real tasks.
  await expect(tasks.getByTestId('tasks-empty')).toHaveCount(0);
});

test('Base panel shows the document count and the honest method line', async ({ page }) => {
  await connectAndEnter(page, FX!.demoBasename);

  const base = page.getByTestId('panel-base');
  await expect(base).toBeVisible();
  await expect(base.getByRole('heading', { name: 'Base' })).toBeVisible();

  // The three seeded docs surface as a count.
  await expect(base.getByTestId('base-count')).toHaveText('3 docs');
  await expect(base.getByTestId('base-indexed')).toContainText('3');

  // The method line is honest about recall: no embedder wired → a filename-only index.
  await expect(base.getByTestId('base-method')).toContainText('Filename index only');
});

test('the "soon" footer affordances are present but disabled — they do not navigate', async ({ page }) => {
  await connectAndEnter(page, FX!.demoBasename);
  const shellUrl = page.url();

  // Each panel's forward affordance is a real, present control marked coming-soon and disabled
  // (the native `disabled` attribute, so it is inert to clicks and keyboard).
  const disabled = [
    page.getByTestId('workflow-full-link'),
    page.getByTestId('tasks-open-board'),
    page.getByTestId('base-add'),
    page.getByTestId('base-manage'),
  ];
  for (const control of disabled) {
    await expect(control).toBeVisible();
    await expect(control).toBeDisabled();
    await expect(control).toHaveAttribute('aria-disabled', 'true');
  }

  // The header settings cog is a present affordance marked aria-disabled (a soon-control).
  const settings = page.getByTestId('shell-settings');
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute('aria-disabled', 'true');

  // A click on a disabled affordance does nothing — the route stays on the shell.
  await page.getByTestId('tasks-open-board').click({ force: true }).catch(() => {});
  await expect(page).toHaveURL(shellUrl);

  // The back link is a real navigation control and returns to the populated launcher.
  await expect(page.getByRole('link', { name: 'Back to projects' })).toBeVisible();
  await page.getByTestId('back-to-projects').click();
  await expect(page).not.toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('project-card').first()).toBeVisible();
});
