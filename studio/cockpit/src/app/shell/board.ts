import type { TicketComment, TicketView, WorkflowGateRef, WorkflowView } from '../core/models';
import { gateStateView } from './gate-view';

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

/** The conventional intake-stage token: a stage literally named this is the Backlog holding pen. */
const BACKLOG_STAGE = 'backlog';

/**
 * Pre-start lifecycle tokens (lower-case): a ticket recorded at one of these has not yet been
 * routed onto a workflow stage, so it belongs in Backlog — not the off-track lane. A project's own
 * lifecycle (e.g. `ready`, `triage`) need not match the workflow's stage tokens, and an un-started
 * ticket reading as "off-track" looks like an error. `backlog` is included so the set is the single
 * source of truth for what counts as pre-start.
 */
export const PRE_START_STAGES: ReadonlySet<string> = new Set([
  BACKLOG_STAGE,
  'ready',
  'todo',
  'new',
  'triage',
  'unstarted',
  'icebox',
]);

/**
 * Whether a ticket belongs in the Backlog holding pen — work that has not yet been routed onto the
 * track. True when its stage is unset/empty/`unknown` (never routed), OR the conventional intake
 * token `backlog` (the holding pen IS the Backlog column, so it is always claimed here — a literal
 * `backlog` workflow stage is replaced by the Backlog bar), OR (case-insensitively) one of the
 * other {@link PRE_START_STAGES} pre-start lifecycle tokens THAT THE WORKFLOW DOES NOT DEFINE AS A
 * REAL STAGE.
 *
 * The predicate is workflow-aware for the non-`backlog` tokens: a token like `ready` or `triage`
 * that the active track legitimately names as a stage routes to that stage's column, not Backlog
 * (so the column renders and holds its tickets). Only un-staged tickets, the `backlog` token, or
 * pre-start tokens with no matching workflow stage fall to Backlog. The Backlog claims its tickets
 * FIRST; the stage columns and the off-track lane exclude them by set-difference, so a ticket lands
 * in exactly one region.
 */
export function isBacklog(ticket: TicketView, workflowView?: WorkflowView | null): boolean {
  const stage = ticketStage(ticket).trim().toLowerCase();
  if (stage === '' || stage === 'unknown' || stage === BACKLOG_STAGE) return true;
  if (!PRE_START_STAGES.has(stage)) return false;
  const definesStage = (workflowView?.stages ?? []).some((s) => s.stage.trim().toLowerCase() === stage);
  return !definesStage;
}

/** The Backlog tickets (holding pen), in first-seen order. */
export function backlogTickets(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly TicketView[] {
  return tickets.filter((t) => isBacklog(t, workflowView));
}

/** The terminal (last) stage of the active track — the "done" terminus. Null when no workflow view. */
export function terminalStage(workflowView: WorkflowView | null | undefined): string | null {
  const stages = workflowView?.stages;
  if (!stages || stages.length === 0) return null;
  return stages[stages.length - 1].stage;
}

/**
 * Conventional names (lower-case) for the terminal "done" stage. A stage whose name matches one of
 * these is the done folder, regardless of its position — a workflow may legitimately place a stage
 * (e.g. an audit/test pass) AFTER done, and that trailing stage must stay a normal column rather
 * than stealing the folder.
 */
const DONE_STAGE_NAMES: ReadonlySet<string> = new Set([
  'done',
  'complete',
  'completed',
  'closed',
  'shipped',
  'released',
]);

/**
 * The stage whose tickets collapse into the done folder: the first stage carrying a conventional
 * done-name (case-insensitive) — NOT blindly the last stage, so a stage added after done (e.g. a
 * trailing `Test` pass) does not empty the folder. Falls back to the last stage when no stage
 * carries a done-name. Returns null when there is no workflow view (no done folder).
 */
export function doneStage(workflowView: WorkflowView | null | undefined): string | null {
  const stages = workflowView?.stages;
  if (!stages || stages.length === 0) return null;
  const named = stages.find((s) => DONE_STAGE_NAMES.has(s.stage.trim().toLowerCase()));
  return named ? named.stage : stages[stages.length - 1].stage;
}

/** The board partitioned into its four disjoint regions in a single pass over the tickets. */
export interface BoardPartition {
  /** The Backlog holding pen — tickets not yet routed onto the track. */
  readonly backlog: readonly TicketView[];
  /** The rendered rail: stage columns EXCLUDING the dropped `backlog` stage and the done stage. */
  readonly columns: readonly StageColumn[];
  /** The stage collapsed into the done folder, or null when there is no workflow view. */
  readonly doneStage: string | null;
  /** The finished tickets at the done stage, collapsed behind the folder. */
  readonly doneTickets: readonly TicketView[];
  /** Tickets recorded at a stage no longer in the track, grouped by that stage. */
  readonly offTrack: readonly OffTrackGroup[];
}

/**
 * Partition every ticket into exactly one board region — Backlog, a rendered stage column, the done
 * folder, or the off-track lane — in a SINGLE pass, so the O(stages×tickets) placement runs once per
 * state push instead of once per derived view. The rendered `columns` exclude the literal `backlog`
 * stage (the Backlog bar replaces it) and the {@link doneStage} (the done folder replaces it); a
 * stage that merely follows done stays a normal column. Disjointness (R1) holds: Backlog claims its
 * tickets first, the done stage claims the finished set, each remaining ticket lands in its stage
 * column or — if its stage is not on the track — the off-track lane.
 */
export function partitionBoard(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): BoardPartition {
  const stages = workflowView?.stages ?? [];
  const done = doneStage(workflowView);
  const inTrack = new Set(stages.map((s) => s.stage));

  const backlog: TicketView[] = [];
  const byStage = new Map<string, TicketView[]>();
  const doneTickets: TicketView[] = [];
  const offOrder: string[] = [];
  const offByStage = new Map<string, TicketView[]>();

  for (const t of tickets) {
    if (isBacklog(t, workflowView)) {
      backlog.push(t);
      continue;
    }
    const stage = ticketStage(t);
    if (done !== null && stage === done) {
      doneTickets.push(t);
      continue;
    }
    if (inTrack.has(stage)) {
      let bucket = byStage.get(stage);
      if (!bucket) byStage.set(stage, (bucket = []));
      bucket.push(t);
      continue;
    }
    let bucket = offByStage.get(stage);
    if (!bucket) {
      offByStage.set(stage, (bucket = []));
      offOrder.push(stage);
    }
    bucket.push(t);
  }

  const columns: StageColumn[] = stages
    .filter((s) => s.stage.trim().toLowerCase() !== BACKLOG_STAGE && s.stage !== done)
    .map((s) => ({ stage: s.stage, owner: s.owner, gate: s.gate, tickets: byStage.get(s.stage) ?? [] }));

  const offTrack: OffTrackGroup[] = offOrder.map((stage) => ({ stage, tickets: offByStage.get(stage)! }));

  return { backlog, columns, doneStage: done, doneTickets, offTrack };
}

/**
 * How far the rail's active-segment accent reaches: the index — IN THE RENDERED RAIL'S stage order —
 * of the furthest stage that currently holds an in-progress ticket. The rendered rail drops the
 * literal `backlog` stage (the Backlog bar replaces it) and the done stage (the done folder replaces
 * it), so the accent aligns with the nodes the rail actually draws rather than the raw track order.
 * Returns -1 when no rendered stage holds an in-progress ticket, so the accent is then absent rather
 * than reaching nowhere. The accent only reinforces the per-card status (glyph + text); it never
 * carries status alone.
 */
export function activeSegmentIndex(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): number {
  const done = doneStage(workflowView);
  const rail = (workflowView?.stages ?? [])
    .map((s) => s.stage)
    .filter((stage) => stage.trim().toLowerCase() !== BACKLOG_STAGE && stage !== done);
  const railIndex = new Map<string, number>();
  rail.forEach((stage, i) => {
    if (!railIndex.has(stage)) railIndex.set(stage, i);
  });
  let furthest = -1;
  for (const t of tickets) {
    if (t.status !== 'in_progress') continue;
    const idx = railIndex.get(ticketStage(t)) ?? -1;
    if (idx > furthest) furthest = idx;
  }
  return furthest;
}

/**
 * Build the board's columns from the active track's stages, in order. Each column carries the
 * stage's owner and governing gate (for the header) and the tickets whose `stage` matches it. A
 * stage with no tickets still yields a column (empty array) so the board iterates the workflow, not
 * the tickets — an empty stage renders a placeholder rather than vanishing. Returns `[]` when there
 * is no workflow view, so the board can fall back to its empty state.
 *
 * The Backlog holding pen claims its tickets first: a ticket {@link isBacklog} surfaces in the left
 * Backlog bar, never in a stage column (set-difference, so it lands in exactly one region). A stage
 * literally named `backlog` yields no column at all — the Backlog bar replaces that first column
 * rather than rendering an empty ghost behind it.
 */
export function stageColumns(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly StageColumn[] {
  const stages = workflowView?.stages;
  if (!stages || stages.length === 0) return [];
  return stages
    .filter((s) => s.stage.trim().toLowerCase() !== BACKLOG_STAGE)
    .map((s) => ({
      stage: s.stage,
      owner: s.owner,
      gate: s.gate,
      tickets: tickets.filter((t) => !isBacklog(t, workflowView) && ticketStage(t) === s.stage),
    }));
}

/**
 * Tickets whose recorded `stage` is not one of the active track's stages — surfaced, never dropped.
 * Grouped by their recorded stage (preserving first-seen order) so the operator sees where each
 * orphan was left (e.g. after that stage was deleted from the workflow). Returns `[]` when every
 * ticket sits on a real stage (the off-track lane is then absent, not a zero-count lane).
 *
 * Backlog-claimed tickets ({@link isBacklog}: unstaged or `backlog`-staged) are excluded — they
 * belong to the left Backlog bar, not the off-track lane. A ticket is in exactly one region.
 */
export function offTrackGroups(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly OffTrackGroup[] {
  const inTrack = new Set((workflowView?.stages ?? []).map((s) => s.stage));
  const order: string[] = [];
  const byStage = new Map<string, TicketView[]>();
  for (const t of tickets) {
    if (isBacklog(t, workflowView)) continue;
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
 * A compact gate summary for a card — at most one chip, so a card stays scannable instead of
 * rendering a chip per gate (the full per-gate list lives in the task-detail modal).
 *
 * `gate`: the single gate GOVERNING the ticket's current stage, shown when it is unmet
 * (not `passed`) so a blocked card shows WHY. `rollup`: a "{passed}/{total}" tally shown when the
 * current-stage gate is already met (or no gate governs the stage) but the ticket still carries
 * gates. The summary is `null` when the ticket carries no gates (nothing to show). The shape /
 * tone / text mirror the per-gate chip so colour is never the only signal.
 */
export type CardGateSummary =
  | { readonly kind: 'gate'; readonly name: string; readonly shape: 'hard' | 'soft'; readonly glyph: string; readonly tone: string; readonly text: string }
  | { readonly kind: 'rollup'; readonly passed: number; readonly total: number };

/** The gate name governing a stage in the active track, or null when the stage has no gate. */
function governingGateName(stage: string | undefined, workflowView: WorkflowView | null | undefined): string | null {
  const match = (workflowView?.stages ?? []).find((s) => s.stage === stage);
  return match?.gate?.name ?? null;
}

export function cardGateSummary(ticket: TicketView, workflowView: WorkflowView | null | undefined): CardGateSummary | null {
  const gates = ticket.gates ?? [];
  if (gates.length === 0) return null;

  const governing = governingGateName(ticket.stage, workflowView);
  const current = governing ? gates.find((g) => g.name === governing) : undefined;
  if (current && (current.state ?? '').toLowerCase() !== 'passed') {
    const view = gateStateView(current.state);
    return {
      kind: 'gate',
      name: current.name,
      shape: current.refusal === 'soft' ? 'soft' : 'hard',
      glyph: view.glyph,
      tone: view.tone,
      text: view.text,
    };
  }

  const passed = gates.filter((g) => (g.state ?? '').toLowerCase() === 'passed').length;
  return { kind: 'rollup', passed, total: gates.length };
}

/**
 * A ticket's comments newest-first (the established reading order), without mutating the input.
 * Comments without a timestamp sort to the end (treated as oldest). Returns `[]` for no comments.
 */
export function commentsNewestFirst(comments: readonly TicketComment[] | undefined): readonly TicketComment[] {
  return [...(comments ?? [])].sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
}
