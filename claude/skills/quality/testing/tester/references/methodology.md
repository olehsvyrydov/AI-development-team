# QA — Methodology (test design · predictable behavior · manual testing · advanced patterns · cross-reference)

## Test Design Before Implementation (MANDATORY)

/qa **designs test cases first** from behavioral acceptance criteria, then hands off to /e2e for implementation. This workflow runs IN PARALLEL with development:

```
/po + /ba create Story with behavioral AC
          |
    +-----+-----+
    |             |
    v             v
  /be or /fe    /qa writes Test Plan + BDD specs (Confluence)
  implement     /e2e implements automated tests from specs
    |             |
    +-----+-----+
          |
          v
   /rev reviews code
   /qa reviews /e2e tests against specs
   /qa executes manual tests
```

This ensures:
- Test cases are driven by business requirements, not implementation details
- Coverage is planned before code is complete
- Test design documents serve as a contract between QA and automation
- /qa can review /e2e tests while waiting for dev to finish

## Predictable System Behavior — The Goal of Testing (MANDATORY)

The ultimate goal of /qa is to guarantee **absolutely predictable system behavior**. The system must behave exactly as specified — no surprises, no unintended side effects, no hidden failures. To achieve this, EVERY test case set MUST cover three categories:

### 1. Positive Cases (Happy Path)
Verify the feature works correctly when used as intended:
- Expected inputs produce expected outputs
- All acceptance criteria are satisfied
- Workflow completes end-to-end as described

### 2. Negative Cases (Error Path)
Verify the system handles misuse gracefully:
- Invalid inputs are rejected with clear error messages
- Missing required fields prevent submission
- Unauthorized users are denied access
- Expired or inactive entities cannot be used
- Concurrent modifications don't corrupt data

### 3. Edge Cases (Boundary Path)
Verify the system handles extreme or unusual conditions:
- Empty values, zero-length strings, maximum-length inputs
- First and last items in lists, pagination boundaries
- Switching locale mid-flow, refreshing the page mid-operation
- Very slow network, double-click submissions, browser back button
- Multiple tabs with the same session
- Data that existed before the feature was deployed (legacy data)

**Rule: A test plan without all three categories is INCOMPLETE. Do not hand off to /e2e until positive, negative, and edge cases are all defined.**

## Manual Testing Methodology (MANDATORY)

When /qa tests manually — whether during QA verification, exploratory testing, or staging validation — the following principles apply. These are universal and technology-agnostic.

### Follow ALL Test Cases
Manual testing MUST execute every test case scenario from the Test Plan — positive, negative, and edge. Do not skip test cases because they "seem obvious" or "probably work." Execute them all and document results for each.

### Think Like Different Users
Don't test as a developer who knows how the feature works. Test as different types of users who DON'T:

| User Type | Behavior Pattern | What They Reveal |
|-----------|-----------------|------------------|
| **First-time user** | Confused by jargon, clicks wrong buttons, doesn't read instructions | Poor UX, missing guidance, unclear labels |
| **Impatient user** | Double-clicks everything, navigates away mid-operation, submits forms too fast | Race conditions, incomplete state handling, duplicate submissions |
| **Malicious user** | Injects scripts in text fields, manipulates URLs, tries to access pages without login | XSS, broken authorization, URL parameter tampering |
| **Power user** | Uses keyboard shortcuts, opens multiple tabs, performs bulk operations | Concurrency issues, keyboard accessibility, session conflicts |
| **Mobile user** | Small screen, touch interactions, slow network | Responsive design failures, touch target sizes, loading states |
| **User with old data** | Has records created before the feature existed, has edge-case data in their profile | Migration issues, null handling, legacy compatibility |

### Actively Try to Break Things
Your job is NOT to confirm the feature works. Your job is to find every way it can fail:

- **Wrong order**: Perform steps out of the expected sequence
- **Missing data**: Submit forms with required fields empty
- **Invalid data**: Enter numbers where text is expected, paste HTML/scripts, use emoji, use extremely long strings
- **Interrupted flows**: Navigate away mid-operation, close the browser, hit back button
- **Rapid actions**: Double-click submit, rapid-fire the same action, spam the API
- **Cross-feature impact**: After using the new feature, verify that adjacent features still work correctly
- **State manipulation**: Change URL parameters, modify hidden form fields (via browser dev tools), replay old requests

### Document Everything
Every manual test session must produce:
- Result for EACH test case (PASS / FAIL / BLOCKED)
- For failures: exact steps to reproduce, expected vs actual, screenshot or screen recording
- Any unexpected behavior discovered outside the test cases (exploratory findings)
- Adjacent features that were spot-checked and their status

## Advanced QA Patterns

### Automated Content Verification
When testing features with complex data (role matrices, permission tables, configuration grids), use JavaScript evaluation to automate content checks rather than relying on visual inspection alone:
- Extract text content programmatically and verify counts, labels, and values
- Run N/N automated checks and report the count (e.g., "14/14 checks PASSED")
- This catches subtle data mismatches that visual review misses

### Matrix-Based Verification
For features involving role-to-capability, user-to-resource, or any NxM relationship:
- Build a matrix of expected access/behavior from AC
- Test each cell systematically (not just the diagonal)
- Report results as a matrix table in the QA report

### Protected / Immutable Entity Testing
When system entities are marked as protected (system roles, default configs, seed data):
- Verify protected fields are disabled/readonly in the UI
- Verify bulk operations (delete, update) properly skip protected entities
- Verify the UI communicates WHY an action is restricted (helper text, disabled state)

### Cross-Locale / i18n Verification
For bilingual or multilingual features:
- Test content renders correctly in every supported locale
- Verify translated content matches the source language in structure and completeness
- Use automated text extraction to compare content counts across locales

### Self-Action Guard Testing
When features prevent users from modifying their own records (self-role-change, self-delete, etc.):
- Verify the guard is active when editing own record
- Verify the guard is NOT active when editing other records
- Verify appropriate feedback is shown (helper text, disabled field)

### Navigation Pattern Testing
For features using non-standard navigation (buttons with JS handlers instead of `<a>` links, SPA routing, dynamic panels):
- Don't assume URL parameters work -- verify the actual navigation mechanism
- Use JavaScript evaluation to find and trigger navigation elements when standard selectors don't work
- Document the navigation pattern in the QA report for future reference

## Cross-Reference Verification (MANDATORY)

Before finalizing test cases, verify that field names, cookie names, API endpoints, and identifiers in test case descriptions **match the actual system**. Ticket descriptions may use placeholder or outdated names.

**Rules:**
1. When test cases reference specific cookie names, form field names, or API endpoints — verify them against the running staging environment or ask the developer
2. If /qa's test cases use a name that doesn't match the actual system, /e2e's tests will fail silently or test the wrong thing
3. Document any name mismatches found during review and update test cases immediately

**Example:** Ticket says cookie `apimedicum_consent` but actual cookie is `apimedicum_cookie_consent` — this mismatch causes /e2e's entire visitor ID test suite to fail because the cookie parser checks the wrong name.

---

