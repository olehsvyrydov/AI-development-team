import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Drives the launcher end to end against the real hub:
 *   1. Open Projects Home → empty state (fresh temp registry).
 *   2. Type the temp folder path, Connect → the hub analyses it (with the X-AIDT write guard
 *      sent by the app) and a project card appears.
 *   3. Click the card → the Project Shell shows the project's title + description.
 */
function tempProjectPath(): string {
  try {
    return readFileSync(join(__dirname, '.temp-project-path'), 'utf8').trim();
  } catch {
    return '';
  }
}
const TEMP_PROJECT = tempProjectPath();

test('connect a folder, then enter the project', async ({ page }) => {
  test.skip(!TEMP_PROJECT, 'temp project path not provided by the Playwright config');

  await page.goto('/');

  // First-run empty state — present only when this spec runs against a fresh (empty) registry.
  // Other specs in the suite share the same isolated registry and may have connected projects
  // first, so assert the empty state only when it is actually shown (keeps the test order-independent).
  const emptyState = page.getByTestId('empty-state');
  if (await emptyState.isVisible().catch(() => false)) {
    await expect(emptyState).toBeVisible();
    await expect(page.getByText('No projects yet')).toBeVisible();
  }

  // Connect the temp folder.
  await page.getByTestId('connect-path').fill(TEMP_PROJECT);
  await page.getByTestId('connect-submit').click();

  // The new card appears once analysis resolves. The hub derives the title from the folder
  // basename and the description from the README's first paragraph, so we identify the card by
  // its stable description text (the temp folder name is random, and other specs may add cards).
  const card = page.getByTestId('project-card').filter({ hasText: 'throwaway fixture' });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('throwaway fixture');

  // Enter the project → shell shows the title (folder basename) + description.
  const expectedTitle = TEMP_PROJECT.split(/[\\/]/).pop() ?? '';
  await card.click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f]{12}$/);
  await expect(page.getByRole('heading', { name: expectedTitle })).toBeVisible();
  await expect(page.getByText('throwaway fixture', { exact: false })).toBeVisible();
  await expect(page.getByTestId('panel-workflow')).toBeVisible();
});
