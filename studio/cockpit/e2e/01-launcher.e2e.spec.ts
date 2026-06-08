import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The redesigned Projects Home launcher, driven against the real hub (isolated temp HOME +
 * fixture folders supplied by playwright.config.ts).
 *
 * Ordering note: this is the alphabetically-first spec and `workers: 1`, so it runs against a
 * still-empty registry. The first-run empty-state assertions therefore live here and run before
 * anything connects a project; later specs populate the shared isolated registry.
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

/** Open the folder picker from the connect panel and wait for the dialog to be ready. */
async function openPicker(page: Page) {
  await page.getByTestId('open-picker').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Connect a fixture under $HOME (by its folder basename) through the real picker and wait for its
 * card. Idempotent: re-connecting an already-registered folder returns the same card, so tests can
 * own their own data without ordering assumptions.
 */
async function connectViaPicker(page: Page, name: string) {
  await openPicker(page);
  const row = page.getByTestId('fs-row').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: `Open ${name}` }).click();
  await expect(page.getByTestId('selected-path')).toContainText(name);
  await page.getByTestId('picker-connect').click();
  const card = page.getByTestId('project-card').filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

test.beforeEach(() => {
  test.skip(!FX, 'fixture manifest not provided by the Playwright config');
});

test('first-run empty state pitches the product and offers the folder CTA', async ({ page }) => {
  await page.goto('/');

  // Against the fresh registry the launcher shows the first-run pitch, not a grid.
  const empty = page.getByTestId('empty-state');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('heading', { name: 'DART' })).toBeVisible();

  // The three how-it-works steps, the trust chips, and the primary CTA all render.
  await expect(page.getByTestId('empty-step')).toHaveCount(3);
  expect(await page.getByTestId('trust-chip').count()).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Choose a folder…' })).toBeVisible();
  await expect(page.getByTestId('read-docs')).toBeVisible();

  // The removed typed-path connect flow must be gone for good.
  await expect(page.getByTestId('connect-path')).toHaveCount(0);
  await expect(page.getByTestId('connect-submit')).toHaveCount(0);
  await expect(page.getByText('No projects yet')).toHaveCount(0);
});

test('folder picker: opens focus-trapped, navigates, enables Connect, ESC restores focus', async ({ page }) => {
  await page.goto('/');

  const opener = page.getByTestId('open-picker').first();
  const dialog = await openPicker(page);

  // The dialog is a proper modal and traps focus on itself when it opens.
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toBeFocused();

  // Quick-access roots and a directory listing render; the picker opens on $HOME, so the rows
  // include our fixture sub-folders (assert on a stable fixture name, not personal folders).
  const parentName = FX!.pickerParentBasename;
  const parentRow = page.getByTestId('fs-row').filter({ hasText: parentName });
  await expect(parentRow).toBeVisible({ timeout: 10_000 });

  // Listing the current directory selects it by default, so Connect is enabled from the start.
  const connect = page.getByTestId('picker-connect');
  await expect(connect).toBeEnabled();

  // Drill into the fixture folder via its chevron; the breadcrumb/selection follow, Connect stays
  // enabled, and the child folder is now listed and selectable.
  await parentRow.getByRole('button', { name: `Open ${parentName}` }).click();
  await expect(page.getByTestId('fs-row').filter({ hasText: 'child-folder' })).toBeVisible({ timeout: 10_000 });
  await expect(connect).toBeEnabled();
  await expect(page.getByTestId('selected-path')).toContainText(parentName);

  // ESC closes the dialog and returns focus to the button that opened it (focus is never lost).
  // Focus the dialog first: drilling in re-rendered the list, so the previously-focused drill
  // button is gone; a real keyboard user's focus stays within the modal (the focus trap), which we
  // re-establish here before the keystroke.
  await dialog.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('connect via the picker adds a card; clicking it navigates to the project shell', async ({ page }) => {
  await page.goto('/');

  // Connect the untrusted fixture through the real picker (drill into it, then Connect).
  const name = FX!.untrustedBasename;
  await openPicker(page);
  const row = page.getByTestId('fs-row').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: `Open ${name}` }).click();
  await expect(page.getByTestId('selected-path')).toContainText(name);
  await page.getByTestId('picker-connect').click();

  // The launcher flips from the pitch to the populated grid: brand strip + project count + a card
  // carrying the project's name, description, and a status line.
  await expect(page.getByText('DART · Studio')).toBeVisible();
  const card = page.getByTestId('project-card').filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole('heading', { name })).toBeVisible();
  await expect(card.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('needs-you-strip')).toContainText('project');

  // Clicking the card navigates to /projects/:id.
  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByTestId('panel-workflow')).toBeVisible();
});

test('an untrusted README renders as inert text — no element, no script side-effect', async ({ page }) => {
  const sideEffect = async (): Promise<{ img: unknown; script: unknown; injected: number }> =>
    page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter(
        (el) => el.getAttribute('src') === 'x' || el.hasAttribute('onerror'),
      );
      const scripts = [...document.querySelectorAll('script:not([src])')].filter((el) =>
        (el.textContent ?? '').includes('__xssScript'),
      );
      return {
        img: (window as unknown as Record<string, unknown>).__xssImg,
        script: (window as unknown as Record<string, unknown>).__xssScript,
        injected: imgs.length + scripts.length,
      };
    });

  // Connect the untrusted fixture (idempotent) so this test owns its data regardless of order.
  await page.goto('/');
  const card = await connectViaPicker(page, FX!.untrustedBasename);

  // The payload markers survive as inert plain text on the card (e.g. the literal "window" token
  // and the END marker), and NO element parsed from the payload exists and NO script side-effect
  // ran — the README is rendered as escaped text, never as live DOM.
  await expect(card).toContainText('PAYLOAD');
  await expect(card).toContainText('inert marker text');
  let fx = await sideEffect();
  expect(fx.img).toBeUndefined();
  expect(fx.script).toBeUndefined();
  expect(fx.injected).toBe(0);

  // Same guarantee inside the shell after entering the project.
  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('shell-description')).toContainText('inert marker text');
  fx = await sideEffect();
  expect(fx.img).toBeUndefined();
  expect(fx.script).toBeUndefined();
  expect(fx.injected).toBe(0);
});
