// @ts-check
/*
 * End-to-end coverage of the hub board UI, driven through a real browser against
 * a locally-started hub server reading a fixed fixture project. The fixture
 * (../fixtures/project) defines three tickets with known stages, gates, an
 * assignee, an unassigned ticket, and comment timelines, so every assertion
 * below is deterministic.
 *
 * Fixture facts the assertions rely on:
 *   - track "full" column order: vision, architecture, security, design,
 *     approval_gate, implement, code_review, qa, verify, done
 *   - assigned ticket  : title "Assigned ticket in the implement stage",
 *                        stage implement, assignee "/be", 3 comments
 *   - blocked ticket   : title "Ticket blocked by a rejected hard gate",
 *                        stage architecture, ARCH_APPROVED rejected (hard) -> Blocked,
 *                        owner "/arch"
 *   - unassigned ticket: title "Unassigned ticket awaiting its expected owner",
 *                        stage security, no assignee, expected owner "/secops"
 */
const { test, expect } = require('./hub-fixture');

// titles are stable identifiers in the UI; avoid leaking internal ledger ids
const ASSIGNED_TITLE = 'Assigned ticket in the implement stage';
const BLOCKED_TITLE = 'Ticket blocked by a rejected hard gate';
const UNASSIGNED_TITLE = 'Unassigned ticket awaiting its expected owner';

// the card whose title matches `title`
function cardByTitle(page, title) {
  return page.locator('.card', { has: page.locator('.title', { hasText: title }) });
}

async function gotoBoard(page, hub) {
  await page.goto(hub.baseURL);
  // the board renders once the first SSE snapshot is applied
  await expect(page.locator('.card').first()).toBeVisible();
}

test.describe('hub board', () => {
  test('loads and renders tickets grouped into stage columns', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    // every fixture ticket is rendered as a card
    await expect(page.locator('.card')).toHaveCount(3);
    await expect(cardByTitle(page, ASSIGNED_TITLE)).toBeVisible();
    await expect(cardByTitle(page, BLOCKED_TITLE)).toBeVisible();
    await expect(cardByTitle(page, UNASSIGNED_TITLE)).toBeVisible();

    // stage columns follow the active track order and carry the stage name
    const columns = page.locator('.stagecol');
    await expect(columns.first().locator('h3')).toContainText('vision');

    // each ticket sits in the column for its stage
    const implColumn = page.locator('.stagecol', { has: page.locator('h3', { hasText: 'implement' }) });
    await expect(implColumn.locator('.card', { hasText: ASSIGNED_TITLE })).toBeVisible();

    const archColumn = page.locator('.stagecol', { has: page.locator('h3', { hasText: 'architecture' }) });
    await expect(archColumn.locator('.card', { hasText: BLOCKED_TITLE })).toBeVisible();

    const secColumn = page.locator('.stagecol', { has: page.locator('h3', { hasText: 'security' }) });
    await expect(secColumn.locator('.card', { hasText: UNASSIGNED_TITLE })).toBeVisible();
  });

  test('clicking a ticket opens the detail modal with description and comment timeline', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    await cardByTitle(page, ASSIGNED_TITLE).click();

    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#modal-title')).toHaveText(ASSIGNED_TITLE);

    // description from the ledger is shown (not the muted placeholder)
    const desc = modal.locator('.desc').first();
    await expect(desc).not.toHaveClass(/muted/);
    await expect(desc).toContainText('actively assigned to a developer');

    // comment timeline: one entry per fixture comment, each with kind + author + time
    const comments = modal.locator('.timeline .comment');
    await expect(comments).toHaveCount(3);

    // newest-first ordering: the developer's "Started implementation" comment leads
    const newest = comments.first();
    await expect(newest.locator('.agent')).toHaveText('/be');
    await expect(newest.locator('.kind')).toHaveText('comment');
    await expect(newest.locator('.cbody')).toContainText('Started implementation');
    // the raw timestamp is preserved on the relative-time element's title
    await expect(newest.locator('.when')).toHaveAttribute('title', '2026-01-01T09:05:00.000Z');

    // a gate-kind comment is present and labelled as such
    await expect(comments.filter({ has: page.locator('.kind', { hasText: 'gate' }) })).toHaveCount(1);
  });

  test('a hard-rejected ticket shows Blocked and names the responsible gate and owner', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    const card = cardByTitle(page, BLOCKED_TITLE);

    // the card's status label reads Blocked (the .mid status pill, not the
    // separate block-note line which also carries the status classes)...
    const status = card.locator('.mid .status.blocked');
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/Blocked/);

    // ...and the card names the blocking gate + its owner
    const blockNote = card.locator('.card-block');
    await expect(blockNote).toContainText('arch'); // shortened ARCH_APPROVED
    await expect(blockNote).toContainText('/arch'); // owner

    // the gate strip must agree: the ARCH gate chip is in the rejected state
    const rejectedChip = card.locator('.gatestrip .gchip.rejected');
    await expect(rejectedChip.first()).toBeVisible();
    await expect(rejectedChip.first()).toContainText('arch');

    // the modal restates the same blocked status, naming the full gate + owner
    await card.click();
    const modal = page.locator('#modal');
    const modalStatus = modal.locator('.status.blocked');
    await expect(modalStatus).toContainText('Blocked by');
    await expect(modalStatus).toContainText('ARCH_APPROVED');
    await expect(modalStatus).toContainText('/arch');

    // and the gate row for ARCH_APPROVED shows the rejected chip with its rationale
    const archRow = modal.locator('.grow', { has: page.locator('.gname', { hasText: 'ARCH_APPROVED' }) });
    await expect(archRow.locator('.gchip.rejected')).toBeVisible();
    await expect(archRow.locator('.note')).toContainText('documented boundary');
  });

  test('an unassigned ticket shows its expected owner, distinct from a real assignee', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    // unassigned ticket: muted "expected" owner badge, not a solid assignee
    const waitCard = cardByTitle(page, UNASSIGNED_TITLE);
    const expectedAgent = waitCard.locator('.agent.expected');
    await expect(expectedAgent).toBeVisible();
    await expect(expectedAgent).toContainText('/secops');
    await expect(expectedAgent).toContainText('expected');

    // assigned ticket: a solid agent badge with no "expected" qualifier
    const implCard = cardByTitle(page, ASSIGNED_TITLE);
    const assignedAgent = implCard.locator('.agent').first();
    await expect(assignedAgent).toContainText('/be');
    await expect(assignedAgent).not.toHaveClass(/expected/);
    // the assignee badge carries the working-now affordance the expected badge lacks
    await expect(assignedAgent).toHaveAttribute('title', 'working now');
  });

  test('keyboard and a11y: card is focusable, Enter/Space opens, ESC closes and restores focus', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    const modal = page.locator('#modal');

    // the dialog exposes the right ARIA contract
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    // a card is reachable by keyboard focus (it is a native <button>)
    const card = cardByTitle(page, ASSIGNED_TITLE);
    await card.focus();
    await expect(card).toBeFocused();

    // Enter opens the modal
    await page.keyboard.press('Enter');
    await expect(modal).toBeVisible();

    // ESC closes it and returns focus to the originating card
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(card).toBeFocused();

    // Space also opens the modal
    await page.keyboard.press('Space');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#modal-title')).toHaveText(ASSIGNED_TITLE);
  });

  test('live update: a state change on disk is reflected without a reload', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    // sanity: the assigned ticket starts in the implement column
    const implColumn = page.locator('.stagecol', { has: page.locator('h3', { hasText: 'implement' }) });
    await expect(implColumn.locator('.card', { hasText: ASSIGNED_TITLE })).toBeVisible();

    // mutate the fixture ledger on disk: advance the assigned ticket to code_review
    const ledger = hub.readState();
    ledger['BOARD-IMPL'].stage = 'code_review';
    hub.writeState(ledger);

    // the board re-renders via SSE: the card moves to the code_review column...
    const reviewColumn = page.locator('.stagecol', { has: page.locator('h3', { hasText: 'code_review' }) });
    await expect(reviewColumn.locator('.card', { hasText: ASSIGNED_TITLE })).toBeVisible();
    // ...and a toast announces the advance, without any page reload
    const toast = page.locator('.toasts .toast.advance', { hasText: 'code_review' });
    await expect(toast.first()).toBeVisible();
  });

  test('live update via the control plane: a posted comment appears in the open modal', async ({ page, hub }) => {
    await gotoBoard(page, hub);

    // open the unassigned ticket, which starts with no comments
    await cardByTitle(page, UNASSIGNED_TITLE).click();
    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.timeline .desc.muted')).toContainText('No comments yet');

    // POST a comment through the control plane (loopback + X-AIDT header)
    const res = await hub.post('ticket/comment', {
      id: 'BOARD-WAIT',
      author: '/secops',
      kind: 'comment',
      body: 'Security review scheduled.',
    });
    expect(res.status, res.text).toBe(200);
    expect(res.json && res.json.ok).toBe(true);

    // the open modal re-renders from the SSE push: the new comment shows live
    const comments = modal.locator('.timeline .comment');
    await expect(comments).toHaveCount(1);
    await expect(comments.first().locator('.cbody')).toContainText('Security review scheduled.');
    await expect(comments.first().locator('.agent')).toHaveText('/secops');
  });
});
