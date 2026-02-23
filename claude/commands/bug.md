# Bug Command

Report a bug with a simple description. Claude will handle investigation, structured documentation, and fix coordination.

## Usage

```
/bug [description of the issue]
```

## Examples

```
/bug I see internal server error in /approval page when I move from dashboard to users menu item

/bug Login button doesn't work on mobile Safari

/bug Performance is slow when loading the users list with more than 100 entries
```

## What Happens

When you invoke `/bug [description]`:

1. **Bug report created** with temporary ID (BUG-XXX)

2. **/sm (/luda) creates ticket**:
   - Sets priority (P0-P3) - consults /po, /arch, user, or suggests based on load
   - Assigns investigator (/fe, /be, or /e2e based on bug type)
   - Schedules in sprint

3. **Investigation phase**:
   - Identify affected component (frontend/backend/mobile)
   - Attempt to reproduce the issue
   - Gather evidence (logs, screenshots, network requests)
   - Identify root cause
   - **If cannot reproduce**: /qa recommends close ticket OR request more info OR mark for monitoring

4. **Reproduction test created** by /qa (/rob):
   - Write a failing test that proves the bug exists
   - This test MUST fail now and pass after fix

5. **Investigation report** generated with:
   - Root cause analysis
   - Affected files/components
   - Proposed fix approach
   - Risk assessment

6. **Fix phase (TDD)**:
   - Read investigation report
   - Verify reproduction test still fails
   - Write unit tests (RED - tests fail)
   - Implement fix (GREEN - tests pass)
   - Refactor code
   - All tests pass

7. **Verified** by /rev (code review) and /e2e (/adam) (automated tests), /sm closes ticket

## Priority Levels

| Priority | Criteria | Response |
|----------|----------|----------|
| **P0** | System down, data loss, security | Immediate fix |
| **P1** | Major feature broken | Same day |
| **P2** | Feature impaired, workaround exists | Current sprint |
| **P3** | Minor, cosmetic | Backlog |

## Workflow

```
/bug [description]
     |
     v
+-------------------------+
| Bug report created      |
| (BUG-XXX)               |
+-----------+-------------+
            |
            v
+-------------------------+
| /sm creates ticket      |
| - Sets priority (P0-P3) |
| - Assigns investigator  |
| - Schedules in sprint   |
+-----------+-------------+
            |
            v
+-------------------------+
| INVESTIGATION PHASE     |
| - Identifies component  |
| - Reproduces issue      |
| - Finds root cause      |
| (if cannot reproduce:   |
|  close/more info/monitor|
+-----------+-------------+
            |
            v
+-------------------------+
| /qa writes failing      |
| reproduction test       |
+-----------+-------------+
            |
            v
+-------------------------+
| Investigation Report    |
| created and saved       |
+-----------+-------------+
            |
            v
+-------------------------+
| FIX PHASE (TDD)         |
| - Write unit tests (RED)|
| - Implement fix (GREEN) |
| - Refactor              |
| - All tests pass        |
+-----------+-------------+
            |
            v
+-------------------------+
| /rev reviews fix        |
| /e2e runs automated     |
| tests (verifies fix)    |
| /sm closes ticket       |
+-------------------------+
```

## Optional Parameters

After the description, you can add:

```
/bug [description]. Priority: P1. Assign to: /be
```

Or request immediate investigation:

```
/bug [description]. Please investigate and fix.
```

## Related Commands

- `/issue` - Alias for `/bug`
- `/sm` (`/luda`) - View/manage tickets
