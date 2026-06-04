# E2E — Patterns & Learnings (assertions, selectors, data seeding)

## Widget DOM Count Assertions

When writing E2E tests for admin dashboard pages with widgets:

```javascript
// Verify expected widget count -- prevents silent duplication
test('dashboard shows correct number of stat widgets', async ({ page }) => {
  await page.goto('/admin/dashboard');
  const statGroups = page.locator('.fi-wi-stats-overview');
  await expect(statGroups).toHaveCount(expectedCount);
});
```

- [ ] Every admin page with widgets has an E2E test asserting the correct widget count
- [ ] Test verifies both header AND footer widget sections render
- [ ] Test flags if zero widgets render (missing) or more than expected (duplication)

## Translation Key Validation in E2E

Add assertions that catch untranslated admin panel text:

```javascript
// Scan for raw translation key patterns in visible text
test('no raw translation keys visible', async ({ page }) => {
  await page.goto('/admin/some-page');
  const text = await page.locator('body').textContent();
  // Match patterns like "admin.section.key_name"
  const rawKeys = text.match(/admin\.\w+\.\w+/g) || [];
  expect(rawKeys).toHaveLength(0);
});
```

## Performance Baseline Assertions

Beyond "response completes", measure and assert response times:

```javascript
test('API response within acceptable time', async ({ page }) => {
  const start = Date.now();
  // ... trigger action ...
  await page.waitForSelector('[data-testid="response"]');
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(30000); // 30s max
});
```

- [ ] Establish baseline response times for critical flows
- [ ] Alert when response time exceeds 2x baseline (potential regression)

## Staging Deployment Validation

Before running E2E tests against staging:

```javascript
test.beforeAll('verify correct branch deployed', async ({ request }) => {
  // Verify staging environment is ready and correct branch is deployed
  const health = await request.get('/health');
  expect(health.ok()).toBeTruthy();
});
```

- [ ] Pre-test validation confirms staging is healthy and correct branch is deployed
- [ ] Tests skip gracefully (not fail) when feature flags are disabled

## Synthetic Test Data Seeding Pattern

When E2E tests depend on specific database state (e.g., active ad campaigns, specific product categories):

1. **Create an artisan/CLI command** for seeding and cleanup (e.g., `php artisan test-ads seed/cleanup`)
2. **Make it idempotent**: skip if already seeded, no-op if nothing to clean
3. **Use unique identifiers** to isolate test data from production (e.g., a unique email or name prefix)
4. **Flush caches** after seed/cleanup so new data is picked up immediately
5. **Consider integrating** the seed command into Playwright's `beforeAll` hook for fully automated setup

## Counting Visible Elements — Must Check isVisible()

**Anti-pattern**: Using `page.locator(selector).count()` to count "visible" elements. This counts ALL matching DOM elements including hidden ones.

**Correct pattern**:
```javascript
const elements = page.locator(sel);
const total = await elements.count();
let visibleCount = 0;
for (let i = 0; i < total; i++) {
    if (await elements.nth(i).isVisible()) visibleCount++;
}
```

Applies to any helper function that counts visible elements for assertion purposes.

## Badge/Label Text May Vary by Data State

When testing components that display labels based on data type (e.g., ad type, user role), test expectations must accept ALL valid variants:

```javascript
// WRONG — assumes single badge text for all ad types
expect(badgeText).toBe('Реклама');

// CORRECT — accepts all valid badge text variants
expect(['Реклама', 'Спонсорований контент']).toContain(badgeText);
```

QA test cases should specify expected label text per data variant so /adam knows what to expect.

## Detail Page Link Selection

When `findFirstDetailSlug()` or similar helpers need to find a link to a detail page (e.g., article detail, product detail), filter out non-detail links:

- Exclude tag/category links (e.g., links with `/tag/` or `/category/` in the path)
- Prefer links with `data-testid` attributes over generic `a[href]` selectors
- Validate the link actually navigates to a detail page before using it in tests
