import type { TicketComment, TicketView, WorkflowGateRef, WorkflowView } from '../core/models';

/**
 * Whether a ticket needs a human decision — surfaced as a card chip, not a column. A ticket needs
 * you when a HARD gate is currently rejected (a blocking decision the operator must resolve). Soft
 * gates warn but never block, so a rejected soft gate does not raise the chip.
 */
export function ticketNeedsYou(ticket: TicketView): boolean {
  for (const gate of ticket.gates ?? []) {
    if (gate.refusal === 'hard' && (gate.state ?? '').toLowerCase() === 'rejected') return true;
  }
  return false;
}

/**
 * The stage a ticket would advance to: the entry after its current stage on its track. Returns
 * `null` at the last stage, when the current stage is not on the track, or when no track resolves.
 * When the ticket carries no track name and exactly one track exists, that track is used.
 */
export function nextStage(
  ticket: TicketView,
  tracks: Readonly<Record<string, readonly string[]>> | undefined,
): string | null {
  if (!tracks) return null;
  const names = Object.keys(tracks);
  const trackName = ticket.track ?? (names.length === 1 ? names[0] : null);
  const stages = trackName ? tracks[trackName] : undefined;
  if (!stages) return null;
  const idx = stages.indexOf(ticket.stage ?? '');
  if (idx < 0 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
}

/** A stage column: the stage name, its owner, the governing gate (if any), and its tickets. */
export interface StageColumn {
  readonly stage: string;
  readonly owner: string | null;
  readonly gate: WorkflowGateRef | null;
  readonly tickets: readonly TicketView[];
}

/** An off-track group: tickets recorded against a stage that is no longer in the active track. */
export interface OffTrackGroup {
  readonly stage: string;
  readonly tickets: readonly TicketView[];
}

/** A status rendered as a card chip (glyph + label), so status is never a board column. */
export interface StatusChip {
  readonly glyph: string;
  readonly label: string;
}

/** The stage a ticket belongs to for placement; a ticket with no stage groups under a blank key. */
function ticketStage(ticket: TicketView): string {
  return ticket.stage ?? '';
}

/**
 * Build the board's columns from the active track's stages, in order. Each column carries the
 * stage's owner and governing gate (for the header) and the tickets whose `stage` matches it. A
 * stage with no tickets still yields a column (empty array) so the board iterates the workflow, not
 * the tickets — an empty stage renders a placeholder rather than vanishing. Returns `[]` when there
 * is no workflow view, so the board can fall back to its empty state.
 */
export function stageColumns(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly StageColumn[] {
  const stages = workflowView?.stages;
  if (!stages || stages.length === 0) return [];
  return stages.map((s) => ({
    stage: s.stage,
    owner: s.owner,
    gate: s.gate,
    tickets: tickets.filter((t) => ticketStage(t) === s.stage),
  }));
}

/**
 * Tickets whose recorded `stage` is not one of the active track's stages — surfaced, never dropped.
 * Grouped by their recorded stage (preserving first-seen order) so the operator sees where each
 * orphan was left (e.g. after that stage was deleted from the workflow). Returns `[]` when every
 * ticket sits on a real stage (the off-track lane is then absent, not a zero-count lane).
 */
export function offTrackGroups(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly OffTrackGroup[] {
  const inTrack = new Set((workflowView?.stages ?? []).map((s) => s.stage));
  const order: string[] = [];
  const byStage = new Map<string, TicketView[]>();
  for (const t of tickets) {
    const stage = ticketStage(t);
    if (inTrack.has(stage)) continue;
    if (!byStage.has(stage)) {
      byStage.set(stage, []);
      order.push(stage);
    }
    byStage.get(stage)!.push(t);
  }
  return order.map((stage) => ({ stage, tickets: byStage.get(stage)! }));
}

/**
 * The stage to advance to given the active track's stage order: the entry after `current`. For an
 * off-track `current` (not in the order), returns the first stage so an orphan can be re-homed onto
 * the track. Returns `null` at the last stage or when the order is empty (nothing to advance to).
 */
export function nextStageInOrder(current: string, stageOrder: readonly string[]): string | null {
  if (stageOrder.length === 0) return null;
  const idx = stageOrder.indexOf(current);
  if (idx < 0) return stageOrder[0];
  if (idx >= stageOrder.length - 1) return null;
  return stageOrder[idx + 1];
}

const STATUS_CHIPS: Readonly<Record<string, StatusChip>> = {
  in_progress: { glyph: 'progress', label: 'in progress' },
  waiting: { glyph: 'dot', label: 'waiting' },
  blocked: { glyph: 'blocked', label: 'blocked' },
  done: { glyph: 'check', label: 'done' },
};

const STATUS_CHIP_FALLBACK: StatusChip = { glyph: 'dot', label: 'waiting' };

/**
 * The card chip for a ticket status: a glyph paired with a text label (status is never carried by
 * glyph or colour alone). An unknown or missing status falls back to a neutral waiting chip so a
 * card always shows an honest status rather than a blank.
 */
export function statusChip(status: string | undefined): StatusChip {
  return (status && STATUS_CHIPS[status]) || STATUS_CHIP_FALLBACK;
}

/**
 * A ticket's comments newest-first (the established reading order), without mutating the input.
 * Comments without a timestamp sort to the end (treated as oldest). Returns `[]` for no comments.
 */
export function commentsNewestFirst(comments: readonly TicketComment[] | undefined): readonly TicketComment[] {
  return [...(comments ?? [])].sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
}
