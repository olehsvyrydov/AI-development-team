# E2E — Test Design (self-documenting tests · integration-boundary testing)

## Code Style: Self-Documenting Tests

Tests should be readable without inline comments:

```typescript
// BAD - obvious comments cluttering test
test('login', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');
  // Enter email
  await page.fill('#email', 'user@test.com');
  // Enter password
  await page.fill('#password', 'password');
  // Click login button
  await page.click('button[type="submit"]');
  // Verify redirect
  await expect(page).toHaveURL('/dashboard');
});

// GOOD - self-documenting, descriptive test name
test('should redirect to dashboard after successful login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'user@test.com');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
});
```

**Rules:**
- **Descriptive test names** -- name describes the scenario, no comments needed
- **No "what" comments** -- code shows what; let assertions speak for themselves
- **"Why" comments OK** -- explain non-obvious workarounds or timing issues
- **Page Objects for abstraction** -- hide implementation, reveal intent

---

## Integration Boundary Testing

### Error-Path E2E Tests (Mandatory)

For every E2E happy-path test, create a matching error-path test:

```typescript
// Happy path
test('should submit form successfully', async ({ page }) => {
  await page.fill('#email', 'user@example.com');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success-message')).toBeVisible();
});

// Error path - MANDATORY companion test
test('should show error on API failure', async ({ page }) => {
  await page.route('**/api/submit', route =>
    route.fulfill({ status: 500, body: 'Server error' })
  );
  await page.fill('#email', 'user@example.com');
  await page.click('button[type="submit"]');
  await expect(page.locator('.error-message')).toBeVisible();
  await expect(page.locator('.success-message')).not.toBeVisible();
});
```

**Pattern**: If UI shows success dialog, test that failure shows error dialog (not success).

### Contract Tests for External APIs

When integrating with external APIs, create contract tests to validate your stubs:

```typescript
describe('HMRC API Contract Tests', () => {
  test('WireMock stub matches actual sandbox response schema', async () => {
    // Load your WireMock stub
    const stub = JSON.parse(fs.readFileSync('wiremock/hmrc-obligations.json'));

    // Validate against known schema
    expect(stub.response.body).toMatchSchema(hmrcObligationsSchema);

    // Validate ID formats match external API spec
    expect(stub.response.body.obligations[0].periodId)
      .toMatch(/^[A-Z0-9]{15}$/);
  });
});
```

### Persistence Boundary Tests

**Never mock persistence in E2E tests** -- data loss bugs escape:

```typescript
// BAD - mocked persistence
beforeEach(() => {
  jest.mock('./database', () => ({ save: jest.fn() }));
});

// GOOD - real persistence
beforeEach(async () => {
  await testDb.clear();
});

test('submission history persists across app restart', async ({ app }) => {
  await app.submitData({ amount: 100 });
  await app.restart(); // Actually restart the app
  await expect(app.getHistory()).toContain({ amount: 100 });
});
```

---

