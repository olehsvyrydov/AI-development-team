import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Broader end-to-end coverage for the Projects Home launcher, driven against the real hub
 * (isolated temp HOME + throwaway fixture folders supplied by playwright.config.ts). These cover
 * flows the basic connect→enter test does not: connect errors and recovery, multiple projects and
 * re-connect idempotency, an untrusted README rendered inert, keyboard/a11y reachability, and
 * back-navigation preserving the populated grid.
 */
interface Fixtures {
  alpha: string;
  beta: string;
  untrusted: string;
  notDir: string;
  missing: string;
}

function fixtures(): Fixtures | null {
  try {
    return JSON.parse(readFileSync(join(__dirname, '.fixtures.json'), 'utf8')) as Fixtures;
  } catch {
    return null;
  }
}
const FX = fixtures();
const basename = (p: string): string => p.split(/[\\/]/).pop() ?? '';

/** Connect a folder via the always-present connect panel and wait for the flow to settle. */
async function connect(page: Page, path: string): Promise<void> {
  await page.getByTestId('connect-path').fill(path);
  await page.getByTestId('connect-submit').click();
}

/** The grid card whose visible description contains `text`. */
function cardByText(page: Page, text: string): Locator {
  return page.getByTestId('project-card').filter({ hasText: text });
}

test.beforeEach(() => {
  test.skip(!FX, 'fixture manifest not provided by the Playwright config');
});

test('connect errors are surfaced, add no card, and the launcher stays usable', async ({ page }) => {
  await page.goto('/');

  // A path that does not exist → inline error, no card created.
  await connect(page, FX!.missing);
  const error = page.getByTestId('connect-error');
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(error).toContainText('path does not exist');
  await expect(cardByText(page, basename(FX!.missing))).toHaveCount(0);

  // Recover via "Try again", then submit a file-not-a-directory path → a different error.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('connect-path')).toBeVisible();
  await connect(page, FX!.notDir);
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(error).toContainText('path is not a directory');

  // The app is still usable: retry with a valid folder and a card appears.
  await page.getByRole('button', { name: 'Try again' }).click();
  await connect(page, FX!.alpha);
  const card = cardByText(page, 'alpha launcher tile');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('connect-error')).toHaveCount(0);
});

test('two distinct folders yield two cards; re-connecting one does not duplicate it', async ({ page }) => {
  await page.goto('/');

  await connect(page, FX!.alpha);
  await expect(cardByText(page, 'alpha launcher tile')).toBeVisible({ timeout: 20_000 });
  await connect(page, FX!.beta);
  const beta = cardByText(page, 'beta launcher tile');
  await expect(beta).toBeVisible({ timeout: 20_000 });

  // Each card shows its own distinct title (folder basename) and description.
  const alphaCard = cardByText(page, 'alpha launcher tile');
  await expect(alphaCard.getByRole('heading', { name: basename(FX!.alpha) })).toBeVisible();
  await expect(beta.getByRole('heading', { name: basename(FX!.beta) })).toBeVisible();
  expect(basename(FX!.alpha)).not.toBe(basename(FX!.beta));

  // Re-connecting alpha (same path → same hub id) must not add a second card.
  const totalBefore = await page.getByTestId('project-card').count();
  await connect(page, FX!.alpha);
  await expect(cardByText(page, 'alpha launcher tile')).toBeVisible({ timeout: 20_000 });
  await expect(cardByText(page, 'alpha launcher tile')).toHaveCount(1);
  await expect(cardByText(page, 'beta launcher tile')).toHaveCount(1);
  expect(await page.getByTestId('project-card').count()).toBe(totalBefore);
});

test('an untrusted README renders as inert text — no element, no script side-effect', async ({ page }) => {
  const sideEffect = async (): Promise<{ img: unknown; script: unknown; injected: number }> =>
    page.evaluate(() => {
      // Any element actually PARSED from the payload would surface as real DOM nodes: an <img>
      // with the payload's src/onerror, or an inline <script> carrying the payload assignment.
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

  await page.goto('/');
  await connect(page, FX!.untrusted);

  const card = cardByText(page, 'BEGIN_PAYLOAD');
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The payload appears verbatim as text, including its raw angle brackets/markers.
  await expect(card).toContainText('<img src=x');
  await expect(card).toContainText('<script>window.__xssScript=1</script>');
  let fx = await sideEffect();
  expect(fx.img).toBeUndefined();
  expect(fx.script).toBeUndefined();
  expect(fx.injected).toBe(0);

  // Same guarantee inside the shell after entering the project.
  await page.getByTestId('project-card').filter({ hasText: 'BEGIN_PAYLOAD' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByRole('heading', { name: basename(FX!.untrusted) })).toBeVisible();
  const shellDesc = page.locator('.shell-head__desc');
  await expect(shellDesc).toContainText('<script>window.__xssScript=1</script>');
  fx = await sideEffect();
  expect(fx.img).toBeUndefined();
  expect(fx.script).toBeUndefined();
  expect(fx.injected).toBe(0);
});

test('keyboard-only: connect via the keyboard, open a card with Enter, reach the shell', async ({ page }) => {
  await page.goto('/');

  // Tab to the connect input (focus it via keyboard), type a path, submit with Enter.
  const input = page.getByTestId('connect-path');
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.type(FX!.alpha);
  await page.keyboard.press('Enter');

  const card = cardByText(page, 'alpha launcher tile');
  await expect(card).toBeVisible({ timeout: 20_000 });

  // The card is a link (keyboard-focusable); focus it and open with Enter.
  const link = card.locator('a[data-testid="project-card"]').first();
  const cardEl = (await link.count()) ? link : card;
  await cardEl.focus();
  await expect(cardEl).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  // The shell heading is reachable and labels the entered project.
  const heading = page.getByRole('heading', { name: basename(FX!.alpha) });
  await expect(heading).toBeVisible();
  // The "Back to projects" control exposes its accessible name for assistive tech.
  await expect(page.getByRole('link', { name: 'Back to projects' })).toBeVisible();
  // The connect region keeps its ARIA labelling on Projects Home.
  await page.goBack();
  await expect(page.locator('section.connect[aria-labelledby="connect-h"]')).toBeVisible();
});

test('entering a project then browser-back restores the populated grid', async ({ page }) => {
  await page.goto('/');

  await connect(page, FX!.alpha);
  const card = cardByText(page, 'alpha launcher tile');
  await expect(card).toBeVisible({ timeout: 20_000 });

  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByTestId('panel-workflow')).toBeVisible();

  // Browser back returns to the populated grid (the alpha card is still present).
  await page.goBack();
  await expect(page).not.toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(cardByText(page, 'alpha launcher tile')).toBeVisible({ timeout: 20_000 });
});
