# QA Test Plan — Hub Observability Board UI

**Author:** Rob (QA / test-case designer)
**Feature under test:** The Hub board UI — live gate/stage/ticket board fed by `GET /api/state` and SSE `GET /api/events`.
**Test type:** Black-box, behavior-only. No implementation detail, no code.
**Tooling for execution:** Any modern browser plus a keyboard and a screen reader (NVDA/VoiceOver/Orca). A second actor (or a script) must be able to record gate decisions, advance stages, assign agents, and append comments while a tester watches the board live.

## Scope and method

These cases verify observable behavior only: what a user sees and can do on the board, in the ticket popup, in live toasts, and via the keyboard/screen reader. Each acceptance area below lists positive, negative, and edge cases. Priorities: **P0** = must pass to ship (core observability, accessibility, consistency invariants); **P1** = important but not release-blocking.

**Conventions used in the steps**
- "Open a ticket" = activate a ticket card (click, or keyboard Enter/Space).
- "Record a comment / gate decision / assignment / stage move" = perform that change in the underlying project while the board is open, without reloading the page.
- "The popup" = the ticket detail dialog that opens from a card.
- "The gate strip" = the row of gate chips on a card and the gate list in the popup.
- "Live region" / "toast" = the transient notification surface.

---

## 1. Ticket popup: title, description, comment stream

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| TP-01 | Popup shows title and full description | A ticket has a non-empty multi-line description | Open the ticket | Popup shows the ticket id, the full title, and the complete description including line breaks (not truncated as on the card) | P0 |
| TP-02 | Comment stream is ordered and labelled | A ticket has 3+ comments authored at different times | Open the ticket; read the comment list | Every comment is shown; each comment displays its kind, the authoring agent, and a timestamp; the order is consistent and reflects authoring sequence (newest-first reading order is acceptable as long as it is consistent and unambiguous) | P0 |
| TP-03 | Timestamp is human-readable and precise on demand | A ticket with at least one comment | Open the ticket; inspect a comment's time; hover/focus the time element | A relative time is shown (e.g. "5m ago"); the exact timestamp is available on hover/focus or as a tooltip/title | P1 |
| TP-04 | Gate-kind comments are distinguishable | A ticket has both a plain comment and a gate-decision comment | Open the ticket | The gate-related comment is labelled with its kind so a reader can tell a gate decision from a free-text note | P1 |
| TP-05 | Popup opens for every ticket regardless of stage | Tickets exist in several stages including "done" | Open one ticket per stage | Each opens its own popup with that ticket's data; no cross-contamination of title/description/comments between tickets | P0 |
| TP-06 | Reopening a different ticket replaces content | Two tickets with distinct comments | Open ticket A, close, open ticket B | Popup B shows only B's title, description, and comments; none of A's content remains | P0 |
| TP-07 | Malicious/odd content is shown safely | A ticket whose title/description/comment contains angle brackets or quotes | Open the ticket | The literal characters are displayed as text; no markup is interpreted and nothing executes (XSS-safe rendering) | P0 |

---

## 2. Gate decisions: deciding agent and rationale

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| GA-01 | Approved gate names decider + rationale | A ticket with an approved (passed) gate that carries a rationale | Open the ticket; read the gate list | The gate row reads as passed, names the deciding agent, and shows the rationale text | P0 |
| GA-02 | Rejected gate names decider + rationale | A ticket with a rejected gate carrying a rejection reason | Open the ticket; read the gate list | The gate row reads as rejected, names the deciding agent, and shows the rejection rationale | P0 |
| GA-03 | Undecided gate shows owner, not a decider | A ticket with a pending gate that nobody has acted on | Open the ticket | The pending gate names its expected owner and does NOT claim a decider or a fabricated rationale | P0 |
| GA-04 | Not-triggered gates do not masquerade as pending | A ticket on a track where some gates are not applicable | Open the ticket; compare gate list to gate strip | Gates not triggered for this ticket are not shown as actionable/pending; only relevant gates appear with meaningful state | P1 |
| GA-05 | Rationale source falls back to the decision note | A gate decided with a reason but no separate ledger note (or vice-versa) | Open the ticket | A rationale is shown if one exists in either the gate record or the matching gate-decision comment; if none exists, no empty "rationale:" stub is shown | P1 |
| GA-06 | Hard vs soft gate is distinguishable | A ticket with both a hard and a soft gate | Open the ticket and view the card strip | Hard and soft gates are visually distinguishable by more than color alone (e.g. border style / glyph), and a safety gate is additionally marked | P1 |

---

## 3. Live update of an open popup

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| LP-01 | New comment appears without refresh | A ticket popup is open | Record a new comment on that ticket | The new comment appears in the open popup within a couple of seconds, no manual refresh, no reload | P0 |
| LP-02 | Gate decision updates the open popup | A ticket popup is open showing a pending gate | Record an approval/rejection for that gate | The popup gate row updates to passed/rejected with decider and rationale, live | P0 |
| LP-03 | Live update does not lose scroll/focus disruptively | A long popup is open and scrolled; focus is inside the dialog | Record a comment on the same ticket | Content updates; focus stays within the dialog (does not jump to the page behind) and the user is not ejected from the popup | P1 |
| LP-04 | Popup for a vanished ticket closes gracefully | A ticket popup is open | Remove/relabel that ticket so it no longer exists in state | The popup closes cleanly (or shows a clear empty state); it does not freeze on stale data or error visibly | P1 |
| LP-05 | Updates to OTHER tickets do not mutate the open popup | Ticket A popup open | Record changes on ticket B | Popup A is unaffected; only A's own changes alter A's popup | P1 |

---

## 4. Status label: single, consistent, glyph + text (never color alone)

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| ST-01 | Exactly one status label per ticket | Any populated board | Scan every card | Each card shows exactly one status label (Done / In progress / Waiting / Blocked) — never zero, never two conflicting | P0 |
| ST-02 | Status uses glyph + text, not color alone | Board with tickets in varied statuses | Inspect each status label | Each status is conveyed by a text word AND a glyph/icon; the meaning survives with color removed (grayscale check passes) | P0 |
| ST-03 | Same status looks the same everywhere | Two tickets share a status | Compare their labels across columns | The same status renders with the same glyph, text, and color treatment board-wide; and the card label matches the popup label for the same ticket | P0 |
| ST-04 | Status is legible under grayscale / color-blind simulation | Populated board | View under grayscale and a deuteranopia/protanopia simulation | All four statuses remain distinguishable from each other without relying on hue | P1 |
| ST-05 | Unknown/edge status degrades safely | A ticket whose status is missing or unexpected | View the card | The card shows a sane default label (e.g. Waiting) rather than a blank, a crash, or a raw token | P1 |

---

## 5. Assignee vs expected owner

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| AS-01 | Assigned ticket names the working agent | A ticket has an explicit assignee | View the card and popup | Both show the assigned agent presented as the one actively working it (e.g. a solid/active treatment) | P0 |
| AS-02 | Unassigned ticket shows the stage's expected owner | A ticket has no assignee in a stage that has a defined owner | View the card | The card shows the stage's expected owner, visually distinguished from an active assignee (e.g. muted/dashed) and clearly labelled as expected, not assigned | P0 |
| AS-03 | Expected owner is visually distinct from a real assignee | One assigned and one unassigned ticket side by side | Compare the two agent indicators | The two are unmistakably different at a glance; the expected-owner styling is not confusable with an active assignee, and the difference is not by color alone | P0 |
| AS-04 | No owner at all shows a clear fallback | An unassigned ticket in a stage with no defined owner (e.g. a terminal stage) | View the card | The card shows a clear "unassigned" indicator rather than a blank or a stray punctuation | P1 |
| AS-05 | Assignment change updates the indicator live | A ticket card is visible (and its popup may be open) | Assign, then reassign, then unassign the ticket | The agent indicator updates each time without reload, switching between active-assignee and expected-owner presentations correctly | P1 |

---

## 6. Blocked ticket: label and gate strip must agree

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| BL-01 | Rejected hard gate reads "Blocked" and names the gate/owner | A ticket whose hard gate is rejected | View the card | Status reads "Blocked"; the card explicitly names the responsible gate and its owner | P0 |
| BL-02 | Label and gate strip never contradict | The same blocked ticket | Compare the "Blocked" label against the gate strip / gate list | A blocked label is always backed by a visibly rejected hard gate; there is never a "Blocked" label with no rejected gate shown, nor a rejected hard gate shown while the label says otherwise | P0 |
| BL-03 | A rejected SOFT gate does NOT block | A ticket whose only rejected gate is soft (non-blocking) | View the card | Status is NOT "Blocked" on account of the soft rejection; the soft gate still shows as rejected but the ticket carries its normal working status | P0 |
| BL-04 | A pending hard gate does NOT read as blocked | A ticket with an undecided hard gate, no rejections | View the card | Status is "Waiting"/in-progress as appropriate, not "Blocked"; no owner is accused of blocking when they have merely not yet acted | P0 |
| BL-05 | Card "Blocked by" and popup agree on the gate/owner | A blocked ticket | Open its popup | The gate/owner named on the card matches the rejected gate and decider shown in the popup | P1 |
| BL-06 | Clearing the rejection clears "Blocked" live | A blocked ticket card is visible | Re-decide the offending hard gate to passed/pending | The status leaves "Blocked" and the gate strip updates consistently, live, without reload | P1 |

---

## 7. Live changes → non-disruptive toast (no focus theft)

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| TO-01 | Gate decision raises a toast | Board open, no popup | Record a gate pass/reject | A toast appears naming the ticket and the change; it identifies pass vs reject by more than color | P0 |
| TO-02 | Stage advance raises a toast | Board open | Advance a ticket to the next stage | A toast announces the advance for that ticket | P1 |
| TO-03 | Assignment change raises a toast | Board open | Assign/unassign a ticket | A toast announces the (un)assignment | P1 |
| TO-04 | New comment raises a toast | Board open, that ticket's popup closed | Record a comment | A toast announces N new comment(s) for the ticket | P1 |
| TO-05 | Toast does NOT steal focus | Keyboard focus is on a card or inside a popup | Trigger any live change | Focus stays where the user put it; the toast does not grab focus or move the caret | P0 |
| TO-06 | Toasts auto-dismiss and can be paused | A toast is visible | Wait; then hover a fresh toast | Toasts auto-dismiss after a short period; hovering pauses dismissal so it can be read | P1 |
| TO-07 | Toast volume is bounded | Board open | Trigger many changes rapidly | Only a small number of toasts are shown at once; older ones are shed rather than flooding/covering the screen | P1 |
| TO-08 | First load does not spam toasts | Fresh page load on a populated board | Load the page | No toast storm for pre-existing state; toasts only fire for changes after load | P0 |
| TO-09 | Clicking a toast opens the related ticket | A toast is visible | Click it | The corresponding ticket popup opens; the toast dismisses | P1 |

---

## 8. Accessibility

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| AX-01 | Tickets are keyboard-activatable | Board open, no mouse | Tab to a card; press Enter, then (separately) Space | The card is reachable in tab order, shows a visible focus indicator, and either key opens its popup | P0 |
| AX-02 | Modal is focus-trapped | A popup is open | Tab and Shift+Tab repeatedly | Focus cycles only among the popup's controls and never lands on the board behind it | P0 |
| AX-03 | ESC closes and focus returns | A popup is open, opened from a known card | Press ESC | The popup closes and focus returns to the exact card that opened it | P0 |
| AX-04 | Backdrop click closes the popup | A popup is open | Click outside the dialog panel | The popup closes | P1 |
| AX-05 | Toasts are announced via a polite live region | A screen reader is running, board open | Trigger a live change | The screen reader announces the toast politely (does not interrupt current speech) | P0 |
| AX-06 | Dialog is announced as a dialog with its title | Screen reader running | Open a popup | It is announced as a modal dialog labelled by the ticket title | P1 |
| AX-07 | Reduced-motion is respected | OS "reduce motion" enabled | Open popups, trigger toasts and card flashes | Animations/transitions are suppressed; updates still occur, just without motion | P0 |
| AX-08 | Status/agent/gate meaning is not color-only | Screen reader + grayscale | Inspect statuses, agent badges, gate chips | Every state has a text and/or glyph equivalent; nothing depends on color alone | P0 |
| AX-09 | Card has an accessible name conveying status | Screen reader running | Focus a card | The accessible name includes the ticket id, title, and its status so it is understandable without sighted scanning | P1 |

---

## 9. Degraded and edge conditions

| ID | Title | Preconditions | Steps | Expected result | Pri |
|----|-------|---------------|-------|-----------------|-----|
| DG-01 | Empty board (no tickets) | Project has no tickets | Load the board | A clear "no tickets" empty state is shown; no broken/empty columns, no error, no crash | P0 |
| DG-02 | Ticket with no comments | A ticket whose comment log is empty | Open its popup | A clear "no comments yet" empty state is shown in the comment area; the rest of the popup renders normally | P0 |
| DG-03 | Ticket with no description | A ticket with an empty description | Open its popup | A clear "no description" placeholder is shown, visually distinct from real description text | P0 |
| DG-04 | Connection drops | Board open and live | Stop the live feed (e.g. kill the server / network) | The live indicator changes to a disconnected/error state and the footer/status communicates the loss; the last-known board remains visible (not blanked) | P0 |
| DG-05 | Connection recovers | Board was disconnected | Restore the feed | The board reconnects automatically and refreshes to current state without a manual reload; the live indicator returns to connected | P0 |
| DG-06 | Underlying data error surfaces, does not crash | The state feed reports a ledger/parse error | Load the board | The error is surfaced in the header/meta area; the board still renders whatever valid tickets exist | P1 |
| DG-07 | Malformed live frame is ignored | Board open | A malformed update frame arrives | The board ignores the bad frame and keeps the last good state rather than blanking or erroring visibly | P1 |
| DG-08 | Many tickets / horizontal overflow | A board with many stages/tickets | Load and scroll | Columns scroll horizontally; nothing is clipped off-screen with no way to reach it; performance stays acceptable | P1 |
| DG-09 | Single ticket pluralization | Exactly one ticket | Load the board | Count text reads "1 ticket" (singular), not "1 tickets" | P1 |

---

## Exploratory testing charter

**Charter:** Explore the Hub board's live behavior under churn and interruption, focusing on the consistency invariants (status ↔ gate strip, assignee ↔ expected owner, card ↔ popup) and on accessibility, to discover contradictions, focus traps/leaks, toast floods, and stale-state bugs.

Session ideas (time-boxed ~60–90 min each):
1. **Rapid gate churn:** Repeatedly approve→reject→reset a hard gate on a ticket while its popup is open and while it is closed. Watch for: a "Blocked" label that lags or contradicts the strip; toasts that misreport pass/reject; stale rationale.
2. **Assignment dance:** Assign, reassign across agents, then unassign, repeatedly. Watch for: the expected-owner styling being confused with an active assignee; the agent indicator not reverting on unassign; missing/duplicate toasts.
3. **Interruption resilience:** Open a popup, scroll deep into comments, then drop and restore the connection mid-read. Watch for: focus ejection, lost scroll, popup showing stale or duplicated comments, the reconnect not refreshing.
4. **Keyboard-only + screen-reader pass:** Drive the entire board with no mouse and a screen reader on. Watch for: cards not reachable, focus escaping the modal, ESC not returning focus, toasts not announced or announced assertively, color-only meaning.
5. **Content abuse:** Tickets with very long titles/descriptions, special characters, mixed RTL, and emoji in comments and rationale. Watch for: layout breakage, truncation that hides essential meaning, and any markup interpretation.
6. **Reduced-motion + visual stress:** Toggle OS reduce-motion and a color-blind simulator while changes stream in. Watch for: animations still firing, statuses indistinguishable, flash effects ignoring the preference.

---

## Defects and risks observed during inspection

These were noted while exercising the running app and the live data feed. They are observations for triage by the team, not test results.

**D-1 (Risk, P1) — Demo/example data does not exercise the popup richly.**
The shipped example project renders tickets with empty descriptions, no comments, and no assignees. As a result, the description placeholder, the comment stream, the comment timestamps, and the active-assignee styling are not demonstrable out of the box. Risk: regressions in those paths could ship unnoticed because the default demo never lights them up. Recommend adding a demo ticket that carries a description, an assignee, and a few comments (including a gate-decision comment) so the observability features are visible without manual data setup.

**D-2 (Observation, low) — Empty-board path depends on an empty active track.**
The "no tickets" empty message renders only when there are no track columns to draw. With no tickets the active track resolves to empty and the message appears correctly. However, if a project ever reports tickets but an empty/unknown track, the layout instead appends ad-hoc columns. This is acceptable but worth a regression check (covered by DG-01 and DG-08) so the empty-state and overflow paths stay correct as track handling evolves.

**D-3 (Risk to verify, P1) — Toast live-region announcement vs. focus on the same change.**
Live changes both raise an aria-live toast and visually flash the changed card. Verify on a real screen reader (AX-05/AX-07) that the announcement is polite (not assertive) and that the simultaneous card flash honors reduced-motion, since both fire from the same update. This is a behavior to confirm rather than a confirmed defect.

**D-4 (Positive confirmation).** Live propagation was verified end to end: appending a comment and recording a hard-gate rejection on a ticket both arrived on the live feed within a single update, and the rejected hard gate correctly drove a "blocked" status in the data — supporting the BL-* consistency cases. The label↔gate consistency and the blocked-only-on-rejected-hard-gate rule should still be re-verified at the UI layer per BL-02/BL-03/BL-04.

---

## Coverage summary

| Area | Cases | P0 | P1 |
|------|-------|----|----|
| 1. Popup title/description/comments | 7 | 5 | 2 |
| 2. Gate decisions (decider + rationale) | 6 | 3 | 3 |
| 3. Live popup update | 5 | 2 | 3 |
| 4. Status label consistency | 5 | 3 | 2 |
| 5. Assignee vs expected owner | 5 | 3 | 2 |
| 6. Blocked consistency | 6 | 4 | 2 |
| 7. Non-disruptive toasts | 9 | 3 | 6 |
| 8. Accessibility | 9 | 5 | 4 |
| 9. Degraded/edge | 9 | 5 | 4 |
| **Total** | **61** | **33** | **28** |
