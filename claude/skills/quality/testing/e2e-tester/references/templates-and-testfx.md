# E2E — Report Templates & TestFX (JavaFX desktop)

## Templates

### Playwright Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  });
});
```

### Detox Test Template (React Native)

```javascript
describe('Login', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should login with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com');
    await element(by.id('password-input')).typeText('wrongpass');
    await element(by.id('login-button')).tap();

    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });
});
```

### Page Object Model

```typescript
// pages/login.page.ts
import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }

  async getErrorMessage() {
    return this.page.getByRole('alert').textContent();
  }
}
```

## E2E Test Report Template (Jira Comment)

```markdown
# E2E Test Report: [Feature Name]

**Automation Engineer**: /e2e
**Date**: YYYY-MM-DD
**Jira Story**: [TICKET-ID]
**Build/Commit**: [version]
**Environment**: [staging/dev]
**Test Plan**: [Confluence link]

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | X |
| Passed | Y |
| Failed | Z |
| Skipped | W |
| Pass Rate | Y/X % |

## Test Results

| Test Case (from /qa Plan) | Test File | Status | Duration | Notes |
|---------------------------|-----------|--------|----------|-------|
| TC-01: [scenario] | `file.spec.ts:line` | PASS/FAIL | Xms | [notes] |
| TC-02: [scenario] | `file.spec.ts:line` | PASS/FAIL | Xms | [notes] |

## Cross-Browser Results

| Browser | Passed | Failed | Notes |
|---------|--------|--------|-------|
| Chromium | X | Y | |
| Firefox | X | Y | |
| WebKit | X | Y | |

## Defects Found

[Link to Jira Bug tickets created]

### BUG-001: [Defect Title] ([TICKET-ID])
- **Severity**: Critical / High / Medium / Low
- **Priority**: Draft (pending /po review)
- **Jira**: [link to Bug ticket]

## Performance Observations
- [Any notable performance findings]

## Verdict
- [ ] **ALL PASSED** -- All automated tests pass. Awaiting /qa review of test coverage.
- [ ] **FAILURES FOUND** -- [X] tests failed. Bug tickets created.
- [ ] **BLOCKED** -- [reason]
```

## Checklist

### Before Writing Tests
- [ ] /qa Test Plan exists in Confluence
- [ ] Test cases defined by /qa
- [ ] Critical paths identified
- [ ] Test data strategy planned
- [ ] Environment configured
- [ ] Page objects created

### Test Quality
- [ ] Tests are independent
- [ ] No flaky tests
- [ ] Clear assertions
- [ ] Proper cleanup
- [ ] Fast execution
- [ ] Input filtering tests: each filter condition tested with "filtered item should NOT appear in output"
- [ ] Format coverage tracked: document which input formats have sample test data and which are missing

### After Tests Written
- [ ] Tests committed as script files (not ad-hoc browser sessions)
- [ ] Tests target staging and are re-runnable via CLI
- [ ] Test report posted as Jira comment
- [ ] Report saved to Git file (testing/e2e-{ticket}.md)
- [ ] Tests submitted for /qa review against approved test cases
- [ ] Gaps from /qa review addressed

## TestFX E2E Testing (JavaFX Desktop Apps)

When testing JavaFX desktop applications with TestFX:

### BaseE2ETest Pattern
Create a base class that:
1. Loads the main FXML layout
2. Clears ALL stylesheets (both Scene and root node)
3. Adds `test-minimal.css` with direct values (no CSS variable lookups)
4. Sets consistent window size (e.g., 1200x800)

```java
@Tag("e2e")
public abstract class BaseE2ETest extends ApplicationTest {
    @Override
    public void start(Stage stage) {
        Parent root = FXMLLoader.load(getClass().getResource("/fxml/main.fxml"));
        Scene scene = new Scene(root, 1200, 800);
        scene.getStylesheets().clear();
        root.getStylesheets().clear();
        scene.getStylesheets().add(getClass().getResource("/css/test-minimal.css").toExternalForm());
        stage.setScene(scene);
        stage.show();
    }
}
```

### test-minimal.css (Mandatory)
TestFX tests require CSS with **direct values only** -- no CSS variable lookups (`-fx-primary-color`, etc.). Without this, CSS lookup chains cause StackOverflow errors.

**Rule**: When adding new FXML views with custom CSS classes, add those classes to `test-minimal.css` before writing E2E tests.

### @Nested Test Organization
Organize E2E tests with `@Nested` classes per feature area:
```java
@Tag("e2e")
class DashboardE2ETest extends BaseE2ETest {
    @Nested class NavigationTests { ... }
    @Nested class EmptyStateTests { ... }
    @Nested class FilterTests { ... }
    @Nested class ExportTests { ... }
}
```

### surefire.excludedGroups as Maven Property
Define excluded groups as a Maven property for flexible E2E execution:
```xml
<properties>
    <surefire.excludedGroups>e2e</surefire.excludedGroups>
</properties>
<excludedGroups>${surefire.excludedGroups}</excludedGroups>
```
Run E2E tests locally: `mvn test -Dsurefire.excludedGroups=`

### Structure Tests vs Data-Driven Tests
- **Structure tests** verify UI nodes exist (empty state) -- necessary but insufficient
- **Data-driven tests** import real data and verify it appears correctly -- essential for catching workflow bugs
- Every E2E suite should include BOTH structure and data-driven tests

### QA Test Design Workflow
Follow the established workflow: /qa designs test cases from acceptance criteria first, then /e2e implements them. Don't skip the test design step.

