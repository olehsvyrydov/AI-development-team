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

2. **/luda creates ticket**:
   - Sets priority (P0-P3) - consults /max, /jorge, user, or suggests based on load
   - Assigns investigator (/finn, /james, or /adam based on bug type)
   - Schedules in sprint

3. **Investigation phase**:
   - Identify affected component (frontend/backend/mobile)
   - Attempt to reproduce the issue
   - Gather evidence (logs, screenshots, network requests)
   - Identify root cause
   - **If cannot reproduce**: /rob recommends close ticket OR request more info OR mark for monitoring

4. **Reproduction test created** by /rob:
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

7. **Verified** by /rev (code review) and /adam (automated tests), /luda closes ticket

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
     │
     ▼
┌─────────────────────────┐
│ Bug report created      │
│ (BUG-XXX)               │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ /luda creates ticket    │
│ • Sets priority (P0-P3) │
│ • Assigns investigator  │
│ • Schedules in sprint   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ INVESTIGATION PHASE     │
│ • Identifies component  │
│ • Reproduces issue      │
│ • Finds root cause      │
│ (if cannot reproduce:   │
│  close/more info/monitor│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ /rob writes failing     │
│ reproduction test       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Investigation Report    │
│ created and saved       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ FIX PHASE (TDD)         │
│ • Write unit tests (RED)│
│ • Implement fix (GREEN) │
│ • Refactor              │
│ • All tests pass        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ /rev reviews fix        │
│ /adam runs automated    │
│ tests (verifies fix)    │
│ /luda closes ticket     │
└─────────────────────────┘
```

## Optional Parameters

After the description, you can add:

```
/bug [description]. Priority: P1. Assign to: /james
```

Or request immediate investigation:

```
/bug [description]. Please investigate and fix.
```

## Related Commands

- `/issue` - Alias for `/bug`
- `/luda` - View/manage tickets
