# E2E — Playwright Reliability Patterns

## Playwright Reliability Patterns (MANDATORY)

### `waitFor()` vs `isVisible()` — Critical Distinction

`locator.isVisible()` is a **one-shot** check — it returns immediately with the current state. For elements that render asynchronously after `domcontentloaded` (e.g., consent banners, modals, toast notifications that mount after framework hydration), `isVisible()` returns `false` even when the element will appear shortly.

**Always use `waitFor()` for async-rendered elements:**
```javascript
// WRONG — one-shot, misses elements that render after page load
const isVisible = await banner.isVisible();
if (isVisible) { await banner.click(); }

// RIGHT — auto-retrying, waits up to timeout
try {
    await banner.waitFor({ state: 'visible', timeout: 10_000 });
    await banner.click();
} catch {
    // Element genuinely not present — handle gracefully
}
```

### Navigation: `domcontentloaded` over `networkidle`

Pages with ad iframes (returning 429), AI chat widgets (persistent WebSocket), or analytics (long-polling) **never reach `networkidle`**. Always use `domcontentloaded` for navigation:
```javascript
await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
```
For content that requires framework hydration (e.g., Vue/Inertia page title), use `page.waitForFunction()` after navigation. For multiple possible elements (primary + fallback selectors), use `Promise.race()`:

```javascript
// Wait for any of several hydration signals
await Promise.race([
    page.locator('[data-testid="target-element"]').waitFor({ state: 'visible', timeout: 10_000 }),
    page.locator('a, button').filter({ hasText: /expected text/i }).first().waitFor({ state: 'visible', timeout: 10_000 }),
    page.locator('a[href*="expected-path"]').first().waitFor({ state: 'attached', timeout: 10_000 }),
]).catch(() => {});

// Then check which locator matched
const found = (await primaryLocator.count() > 0) || (await fallbackLocator.count() > 0);
```

### Selector Priority for SPA/Vue Components

When writing selectors for Vue/React/Angular components, follow this priority:

1. **`data-testid`** (most reliable) — survives re-renders, styling changes, and refactors
2. **ARIA roles/labels** — semantic and stable (`role="combobox"`, `aria-label="..."`)
3. **`href` or `id` attributes** — stable if they're part of the routing contract
4. **Text content** (least reliable) — changes with i18n, copy updates, and dynamic content

**Rule:** `data-testid` is not just for locale-varying elements. It is the **primary** selector strategy for ALL interactive elements. Use text/href matchers only as fallbacks.

### Test Ordering for Rate-Limited Endpoints

Tests that repeatedly submit to rate-limited endpoints (e.g., contact forms with throttle limits) **MUST run LAST in the suite**. If they run early and trigger 429 responses with retry loops, the server becomes slow for all subsequent tests, causing cascade timeouts.

**Rules:**
1. Place form submission tests in a **separate `describe` block at the end** of the spec file
2. Keep retry deadlines **short** (2 minutes max, not 8)
3. Use **direct button clicks** for validation-only tests — don't call the full submission helper
4. Validation, SEO, rendering, and navigation tests go FIRST — they're fast and don't stress the server

### Shared Test Helpers Pattern

Extract duplicated helpers into `tests/e2e/playwright/helpers/`:
- **`constants.js`** — cookie names, regex patterns, tolerance values
- **`navigation.js`** — `navigateTo()`, `clearAppCookies()`, `getCookie()`, `clickAcceptAll()`, `dismissConsentBanner()`, `collectConsoleErrors()`

Benefits: single point of fix when bugs are found, consistent behavior across spec files, cleaner imports.

### Console Error Filters Must Be Specific

When filtering benign console errors in `collectConsoleErrors()`, be specific about which errors to suppress. A broad filter like `text.includes('endpoint-name')` hides ALL errors from that endpoint — including legitimate ones. Pair endpoint name with expected status codes:
```javascript
// WRONG — hides all errors from the endpoint
if (text.includes('advertisements/impression')) return;

// RIGHT — only suppress known benign status codes
if (text.includes('advertisements/impression') && /status of (403|404|429)/.test(text)) return;
```

### Locale-Varying UI Elements

Consent banners and other UI elements have **different text per locale** (e.g., EN: "Manage Preferences" / UK: "Налаштувати"). Always use `data-testid` selectors for locale-varying elements, never text-based selectors.

### Pre-Discover HTML Structure Before Writing Tests

When testing admin panels or complex UIs (Filament, Livewire, React dashboards), **inspect the actual HTML structure first** using Browser MCP before writing selectors. Writing tests with assumed selectors leads to iterative fix rounds. One discovery pass up front saves multiple deploy-test-fix cycles.

**Steps:**
1. Navigate to the target page with Browser MCP
2. Use `playwright_get_visible_html` to inspect the form/table/widget HTML
3. Identify actual element types (native `<select>` vs combobox, `<input>` vs custom widget)
4. Write selectors based on discovered structure

### Filament Admin Panel Selector Patterns

Filament renders different HTML depending on field configuration. Know the actual DOM before writing selectors:

#### Select Fields
- **Non-searchable Select** (`->searchable()` NOT set): Renders as native `<select id="data.field_name">`. Use `page.locator('select[id="data.field_name"]')` and `selectOption()`.
- **Searchable Select** (`->searchable()` enabled): Renders as Choices.js combobox `div.choices[role="combobox"]`. Click `.choices__inner`, type in `input.choices__input--cloned`.

```javascript
// Native <select> (non-searchable)
const select = page.locator('select[id="data.pricing_model"]');
await select.selectOption('cpm');

// Choices.js combobox (searchable)
const combobox = page.locator('div.choices[role="combobox"]').first();
await combobox.locator('.choices__inner').click();
const searchInput = page.locator('input.choices__input--cloned').first();
await searchInput.fill('search term');
await page.locator('.choices__list--dropdown .choices__item--selectable').first().click();
```

#### Forms
Filament pages often contain **multiple forms** (logout form, main edit form, action forms). Never use `page.locator('form')` — scope to the main form via `[wire\\:submit="save"]` or `#form`.

#### Page URLs
Filament pages use kebab-case slugs derived from the class name: `SponsorReportingDashboard` → `/admin/sponsor-reporting-dashboard`. Include these URL patterns in test discovery.

**Resources vs Pages URL difference**: Filament Resources in subdirectories get the directory name as URL prefix (`Content/AiKnowledgeEntryResource` → `/admin/content/ai-knowledge-entries`). However, Filament Pages with explicit `protected static string $slug = 'my-slug'` do NOT get subdirectory prefix — the URL is `/admin/my-slug` regardless of namespace. Always verify actual URLs on staging before hardcoding in tests.

#### Default SelectFilter Hides Records
Filament `SelectFilter::make('status')->default(Active)` pre-filters the table on page load. Tests searching for non-Active records (Draft, Archived) will fail because they're filtered out. Clear defaults via URL param:
```javascript
await page.goto(`${baseUrl}/admin/shop/products?tableFilters[status][value]=`);
```

#### ReplicateAction Confirmation Dialog
Filament's `ReplicateAction` shows a built-in confirmation dialog even without `->requiresConfirmation()`. The modal uses Alpine.js `x-show` transitions that may not be visible to Playwright's `toBeVisible()`. Use `page.evaluate()` to click the confirm button directly:
```javascript
// Alpine.js x-show transition may not complete before Playwright visibility check
await page.evaluate(() => {
    const btn = document.querySelector('.fi-modal button[type="submit"]');
    if (btn) btn.click();
});
```

#### Collapsed Section Expand Pattern (CRITICAL — Recurring Issue)

Filament sections with `->collapsed()` / `->collapsible()->collapsed(true)` use Alpine.js `x-on:click="isCollapsed = ! isCollapsed"` on the `<header>` element. Content inside collapsed sections has `invisible absolute h-0 overflow-hidden` classes — elements exist in DOM but Playwright's `toBeVisible()` returns false. **You MUST expand the section BEFORE interacting with ANY elements inside it.**

This applies to ALL collapsed contexts: content editors, settings pages, form fieldsets. Always call `expandCollapsedSection()` before locating toggles, inputs, or buttons inside collapsed sections.

**Click `header.fi-section-header` filtered by `hasText`** — not child buttons (buttons don't contain heading text):

```javascript
async function expandSection(page, sectionNamePattern) {
    const header = page.locator('header.fi-section-header')
        .filter({ hasText: sectionNamePattern }).first();
    if (await header.count() > 0) {
        await header.scrollIntoViewIfNeeded();
        await header.click();
        await page.waitForTimeout(1500); // Alpine.js toggle
        return;
    }
    // Fallback: scope to section element
    const section = page.locator('section.fi-section')
        .filter({ hasText: sectionNamePattern }).first();
    if (await section.count() > 0) {
        await section.locator('header').first().click();
        await page.waitForTimeout(1500);
    }
}
```

**Anti-pattern**: Do NOT look for buttons inside the header filtered by section name text. Buttons (chevron, header actions like "Translate All") don't contain the section heading — only the `h3` does. This silently matches nothing and the section stays collapsed.

### Scope Assertions to Avoid Related Content

Product detail pages, article pages, and similar layouts often have "Related Items" sections with their own action buttons. Page-level assertions for button counts or visibility can match these unrelated elements.

**Solution**: Scope assertions to the specific section using a `data-testid` anchor and `.locator('..')` for parent traversal:
```javascript
// WRONG — matches buttons in Related Products section too
const addToCartButtons = page.locator('button:has-text("Add to Cart")');

// RIGHT — scoped to the main product section
const stockStatus = page.locator('[data-testid="stockStatus"]');
const productSection = stockStatus.locator('..');
await expect(productSection.locator('button:has-text("Add to Cart")')).toBeVisible();
```

### CSV/Export Column Names

Export features (CSV, Excel) may use **technical English column names** (`campaign_name`, `impressions`, `ctr`) regardless of active locale. Test assertions should match technical names, not localized UI labels.

---

