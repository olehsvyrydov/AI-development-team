import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Broader, adversarial coverage for the redesigned launcher: every folder-picker close path
 * restores focus, the picker is keyboard-drivable, back-navigation preserves the populated grid,
 * and real mouse hit-testing lands on the controls (no invisible overlay steals the click).
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

async function openPicker(page: Page) {
  await page.getByTestId('open-picker').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Wait for the initial $HOME listing to render at least one folder row.
  await expect(page.getByTestId('fs-row').first()).toBeVisible({ timeout: 10_000 });
  return dialog;
}

/** Connect a fixture (by basename) through the real picker so the test owns its own grid data. */
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

test('every picker close path (Cancel, ✕, backdrop) closes and restores opener focus', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByTestId('open-picker').first();

  // Cancel button.
  await openPicker(page);
  await page.getByTestId('picker-cancel').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();

  // The ✕ close icon.
  await openPicker(page);
  await page.getByTestId('picker-close').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();

  // The backdrop (click outside the dialog).
  await openPicker(page);
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('keyboard-only: arrow keys move the selection, Enter drills in, Backspace goes up', async ({ page }) => {
  await page.goto('/');
  const dialog = await openPicker(page);

  const parentName = FX!.pickerParentBasename;
  const selected = page.getByTestId('selected-path');

  // The dialog keydown handler (arrow/Enter/Backspace) requires focus inside the modal; the focus
  // trap keeps it there. We re-focus the dialog before each keystroke so a real keyboard user's
  // flow is reproduced even though the row re-render moves DOM focus.
  const key = async (k: string) => {
    await dialog.focus();
    await page.keyboard.press(k);
  };

  const activeRow = page.locator('[data-testid="fs-row"][aria-selected="true"]');

  // ArrowDown moves the active selection onto a real folder row (none is aria-selected until the
  // first keyboard move, since the picker opens with the directory ITSELF selected, not a child).
  await expect(activeRow).toHaveCount(0);
  await key('ArrowDown');
  await expect(activeRow).toHaveCount(1);

  // Press ArrowDown until the parent fixture's row is the active selection. expect.poll re-presses
  // and re-reads with auto-retry, so it never races past the target nor stalls on a slow re-render.
  await expect
    .poll(
      async () => {
        const text = (await activeRow.innerText().catch(() => '')) || '';
        if (text.includes(parentName)) return true;
        await key('ArrowDown');
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(selected).toContainText(`/${parentName}`);

  // Enter drills into the parent: its sole child folder appears, proving keyboard navigation.
  await key('Enter');
  await expect(page.getByTestId('fs-row').filter({ hasText: 'child-folder' })).toBeVisible({ timeout: 10_000 });

  // Backspace goes back up to the parent listing; Connect remains enabled throughout.
  await key('Backspace');
  await expect(page.getByTestId('fs-row').filter({ hasText: parentName })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('picker-connect')).toBeEnabled();
});

test('entering a project then browser-back restores the populated grid', async ({ page }) => {
  // Own the data: connect the demo (idempotent) so a card is guaranteed present.
  await page.goto('/');
  const card = await connectViaPicker(page, FX!.demoBasename);
  const countBefore = await page.getByTestId('project-card').count();

  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('panel-workflow')).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('project-card').first()).toBeVisible({ timeout: 20_000 });
  expect(await page.getByTestId('project-card').count()).toBe(countBefore);
});

test('real mouse clicks land on the launcher controls — no element overlays them', async ({ page }) => {
  // Own the data: connect the demo (idempotent) so the grid has a real card to hit-test, then
  // reload so the connect panel returns to its idle "Add a project" state (the post-connect "ready"
  // state replaces the picker button) and sits in the grid beside the card.
  await page.goto('/');
  await connectViaPicker(page, FX!.demoBasename);
  await page.goto('/');
  await expect(page.getByTestId('project-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('open-picker').first()).toBeVisible();

  // For each primary control, the element on top at its centre must be the control itself (or a
  // descendant) — what a real mouse hit-tests. A forced click would bypass this and hide a
  // regression where a scrim or raised skip-link overlays the content.
  const onTop = async (testId: string): Promise<boolean> => {
    await page.getByTestId(testId).first().scrollIntoViewIfNeeded();
    return page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return top === el || el.contains(top) || (top != null && top.closest(`[data-testid="${id}"]`) === el);
    }, testId);
  };

  expect(await onTop('open-picker')).toBe(true);
  expect(await onTop('project-card')).toBe(true);

  // No positioned, pointer-interactive element spans (almost) the whole viewport over the content.
  const fullBleedInterceptors = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return [...document.querySelectorAll('*')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === 'none') return false;
        if (!['fixed', 'absolute', 'sticky'].includes(cs.position)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= vw * 0.9 && r.height >= vh * 0.9 && r.top <= 1 && r.left <= 1;
      })
      .map((el) => el.tagName.toLowerCase() + '.' + (el.getAttribute('class') ?? ''));
  });
  expect(fullBleedInterceptors).toEqual([]);

  // A real (non-forced) mouse click on a card navigates into the shell.
  const card = page.getByTestId('project-card').first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error('card has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('panel-workflow')).toBeVisible();
});
