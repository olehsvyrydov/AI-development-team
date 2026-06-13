import type { TaskSummary, TicketComment, TicketView, WorkflowGateRef, WorkflowView } from '../core/models';
import { gateStateView } from './gate-view';

/**
 * Whether a ticket needs a human decision — surfaced as a card chip and as the first worklist band,
 * never a column. This MIRRORS the hub's canonical `needsHumanDecision` (the predicate that already
 * drives `taskSummary.byStatus.needsYou` and the projects-home roll-up), so the band, the per-card
 * chip, and the roll-up count cannot disagree. A ticket needs you when EITHER a HARD gate is
 * currently rejected (the work is parked awaiting a blocking decision) OR it is `waiting` on a known
 * expected owner with no live agent heartbeat (`active`). Soft gates warn but never block, so a
 * rejected soft gate alone does not raise it.
 */
export function ticketNeedsYou(ticket: TicketView): boolean {
  for (const gate of ticket.gates ?? []) {
    if (gate.refusal === 'hard' && (gate.state ?? '').toLowerCase() === 'rejected') return true;
  }
  return ticket.status === 'waiting' && !!ticket.expectedOwner && !ticket.active;
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
 * folder, or the off-track lane — in O(tickets + stages): a single pass over the tickets to place each
 * one, then one pass over the stages to materialize the columns, so the placement runs once per state
 * push instead of once per derived view. The rendered `columns` exclude the literal `backlog`
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

/** The plain-words reason a ticket needs a human, derived from the same fields the predicate reads. */
export interface NeedsYouReason {
  /** The glyph that leads the read: `loop` for a loop hand-back, else `need`/`warning`. */
  readonly glyph: string;
  /** The short, honest line shown under the title (no fabricated urgency). */
  readonly text: string;
}

/** How many times the workflow has looped this ticket back, if its labels record a loop count. */
function loopCount(ticket: TicketView): number | null {
  for (const label of ticket.labels ?? []) {
    const m = /^loop[:-](\d+)$/i.exec(label.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * The reason a needs-you ticket is waiting on a person, in plain words, derived from the SAME fields
 * the {@link ticketNeedsYou} predicate reads — never a denormalised projection field. Precedence:
 * a loop hand-back (the `loop` glyph) reads first when the labels record one; then a rejected hard
 * gate; then a gate awaiting its owner (`{owner} approval pending`); then the generic waiting line.
 * Returns `null` for a ticket that does not need you, so a caller renders the line only when honest.
 */
export function needsYouReason(ticket: TicketView): NeedsYouReason | null {
  if (!ticketNeedsYou(ticket)) return null;

  const loops = loopCount(ticket);
  if (loops !== null) return { glyph: 'loop', text: `looped ${loops}× — needs you` };

  for (const gate of ticket.gates ?? []) {
    if (gate.refusal === 'hard' && (gate.state ?? '').toLowerCase() === 'rejected') {
      return { glyph: 'warning', text: 'blocked: a gate needs your decision' };
    }
  }

  const owner = ticket.expectedOwner?.trim();
  if (owner) return { glyph: 'need', text: `${owner} approval pending` };

  return { glyph: 'need', text: 'waiting on you — an approval to give or a decision to make' };
}

/** One lifecycle band of the worklist centre: a stable kind, its tickets, and a glyph + heading. */
export interface WorklistBand {
  readonly kind: 'needs-you' | 'in-flight' | 'backlog' | 'recently-done' | 'off-track';
  readonly glyph: string;
  readonly heading: string;
  readonly tickets: readonly TicketView[];
}

/** How many recently-done cards the band teases before the "see all in Done" expand. */
export const RECENTLY_DONE_CAP = 6;

/**
 * The worklist centre partitioned into its lifecycle bands, in fixed reading order:
 * Needs-you → In-flight → Backlog → Recently-done → Off-track. A single ordered claim guarantees each
 * ticket lands in EXACTLY one band (R1 disjointness): Needs-you (the canonical {@link ticketNeedsYou}
 * predicate) is claimed first, then In-flight, then the partition's Backlog, then Recently-done (the
 * partition's done set), then Off-track — each step skips anything an earlier band already claimed.
 *
 * In-flight is GENUINELY mid-pipeline active work: `status === 'in_progress'` AND the ticket sits in a
 * real workflow stage — i.e. NOT in the Backlog holding pen, NOT in the done folder, NOT off-track.
 * A queued Backlog ticket whose derived status happens to be `in_progress` is therefore NOT "in
 * flight"; it lands in Backlog. For a project whose tickets are all backlog/done, In-flight is
 * correctly EMPTY and omitted (absent-not-zero), with no ticket double-counted across bands.
 *
 * Recently-done is most-recent-first by the newest comment ts as a last-activity proxy — honestly
 * "Recently done", never a fabricated "moved 2h ago". A band whose set is empty is OMITTED from the
 * result (absent-not-zero — no `(0)` band).
 *
 * This is a pure, presentational re-projection over the existing {@link partitionBoard} substrate and
 * `status`; it adds no new write path and no backend field.
 */
export function worklistBands(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): readonly WorklistBand[] {
  const partition = partitionBoard(workflowView, tickets);
  const midPipeline = new Set(partition.columns.flatMap((c) => c.tickets));

  const claimed = new Set<TicketView>();
  const claim = (candidates: readonly TicketView[]): TicketView[] => {
    const taken: TicketView[] = [];
    for (const t of candidates) {
      if (claimed.has(t)) continue;
      claimed.add(t);
      taken.push(t);
    }
    return taken;
  };

  const needsYou = claim(tickets.filter((t) => ticketNeedsYou(t)));
  const inFlight = claim(tickets.filter((t) => t.status === 'in_progress' && midPipeline.has(t)));
  const backlog = claim(partition.backlog);
  const recentlyDone = claim(
    [...partition.doneTickets].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))),
  );
  const offTrack = claim(partition.offTrack.flatMap((g) => g.tickets));

  const bands: WorklistBand[] = [
    { kind: 'needs-you', glyph: 'need', heading: 'Needs you', tickets: needsYou },
    { kind: 'in-flight', glyph: 'progress', heading: 'In flight', tickets: inFlight },
    { kind: 'backlog', glyph: 'stack', heading: 'Backlog', tickets: backlog },
    { kind: 'recently-done', glyph: 'check', heading: 'Recently done', tickets: recentlyDone },
    { kind: 'off-track', glyph: 'warning', heading: 'Off-track', tickets: offTrack },
  ];
  return bands.filter((b) => b.tickets.length > 0);
}

/** A ticket's last-activity proxy: its newest comment timestamp, or '' when it has none (sorts last). */
function lastActivity(ticket: TicketView): string {
  return commentsNewestFirst(ticket.comments)[0]?.ts ?? '';
}

/** The six visual states a card colour-codes to (status drives off the band the card lands in). */
export type CardVisualStatus = 'needs-you' | 'blocked' | 'in-flight' | 'done' | 'backlog' | 'waiting';

/**
 * The colour key for a card — the single visual state that drives its accent edge, tinted fill, and
 * filled status pill. Pure and presentational: it reuses the SAME predicates the worklist bands claim
 * with ({@link ticketNeedsYou}, {@link isBacklog}, raw `status`) in the SAME precedence, so a card's
 * colour cannot drift from the band it renders in — one ticket, one band, one colour. It adds no model
 * field and no write path; colour only REINFORCES the glyph + text the pill already carries.
 *
 * Precedence (matching {@link worklistBands}' ordered claim): needs-you (amber) → blocked (red) →
 * backlog (neutral — a queued idea is planned, not "in flight") → in-flight (blue) → done (green) →
 * waiting (neutral fallback).
 */
export function cardVisualStatus(
  ticket: TicketView,
  workflowView: WorkflowView | null | undefined,
): CardVisualStatus {
  if (ticketNeedsYou(ticket)) return 'needs-you';
  if (ticket.status === 'blocked') return 'blocked';
  if (isBacklog(ticket, workflowView)) return 'backlog';
  if (ticket.status === 'in_progress') return 'in-flight';
  if (ticket.status === 'done') return 'done';
  return 'waiting';
}

/**
 * The feature-progress picture: the proportions the segmented bar paints and the counts row speaks.
 * `done` + `inProgress` + `backlog` partition `total` so the three bar segments sum to the whole;
 * needs-you is surfaced separately ({@link needsYou}) as a tick mark, never a segment, so the bar
 * stays honest (it would otherwise double-count a ticket that is both in-progress and needs-you).
 */
export interface WorklistProgress {
  readonly done: number;
  readonly inProgress: number;
  /** The remainder — everything not done and not in flight (queued / waiting / blocked). */
  readonly backlog: number;
  readonly total: number;
  /** round(done / total · 100) — the *done* fraction, honestly labelled "done", never "complete". */
  readonly percentDone: number;
  /** How many tickets need a human — the amber tick, not a bar segment. */
  readonly needsYou: number;
}

/**
 * The progress picture for the worklist's top bar, read off the EXISTING canonical counts
 * ({@link TaskSummary.byStatus}) when present, else counted from the rendered tickets — no new data
 * and no write path. `backlog` is the honest remainder (`total − done − inProgress`) so the three
 * segments sum to `total`. Returns `null` on an empty board (`total === 0`) so the progress block is
 * suppressed and the empty-state invitation owns the screen.
 *
 * Honesty: an all-done project reads `100% done` (a true green, not a fabricated all-clear); an
 * all-backlog project reads `0% done` (queued, not started — neutral, never a fake green or alarm red).
 */
export function worklistProgress(
  summary: TaskSummary | null | undefined,
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): WorklistProgress | null {
  let total: number;
  let done: number;
  let inProgress: number;
  let needsYou: number;

  if (summary && typeof summary.total === 'number') {
    total = summary.total;
    done = summary.byStatus?.done ?? 0;
    inProgress = summary.byStatus?.in_progress ?? 0;
    needsYou = summary.byStatus?.needsYou ?? 0;
  } else {
    total = tickets.length;
    done = tickets.filter((t) => t.status === 'done').length;
    inProgress = tickets.filter((t) => t.status === 'in_progress' && !isBacklog(t, workflowView)).length;
    needsYou = tickets.filter((t) => ticketNeedsYou(t)).length;
  }

  if (total <= 0) return null;

  const backlog = Math.max(0, total - done - inProgress);
  const percentDone = Math.round((done / total) * 100);
  return { done, inProgress, backlog, total, percentDone, needsYou };
}

/**
 * How many workflow stages currently hold at least one ticket on the rendered rail (excluding the
 * dropped `backlog` stage and the done folder). Drives the worklist's data-derived default mode:
 * Pipeline reads best only when work is genuinely mid-flow across ≥2 stages at once.
 */
export function populatedStageCount(
  workflowView: WorkflowView | null | undefined,
  tickets: readonly TicketView[],
): number {
  return partitionBoard(workflowView, tickets).columns.filter((c) => c.tickets.length > 0).length;
}
