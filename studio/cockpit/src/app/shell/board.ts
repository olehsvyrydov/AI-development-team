import type { TicketComment, TicketView } from '../core/models';

/** A board column key — one of the four real ticket statuses (needsYou is a chip, not a column). */
export type ColumnKey = 'in_progress' | 'waiting' | 'blocked' | 'done';

/** A column definition: its status key, display label, and glyph name (resolved to inline SVG). */
export interface ColumnDef {
  readonly key: ColumnKey;
  readonly label: string;
}

/**
 * The board's columns, left→right. These mirror the four real `status` buckets the hub derives.
 * `needsYou` is an overlay count surfaced as a card chip, never a sixth bucket — adding it here
 * would double-count tickets that already sit in one of these columns.
 */
export const BOARD_COLUMNS: readonly ColumnDef[] = [
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
];

const COLUMN_KEYS: readonly ColumnKey[] = BOARD_COLUMNS.map((c) => c.key);

/** A ticket bucketed under each column key. Every column is present (empty arrays, never absent). */
export type GroupedTickets = Readonly<Record<ColumnKey, readonly TicketView[]>>;

/**
 * Distribute tickets into one bucket per real status. A ticket whose status is missing or not a
 * known column falls into `waiting` so it is never silently dropped from the board.
 */
export function groupByColumn(tickets: readonly TicketView[]): GroupedTickets {
  const out: Record<ColumnKey, TicketView[]> = { in_progress: [], waiting: [], blocked: [], done: [] };
  for (const t of tickets) {
    const key = t.status as ColumnKey;
    (COLUMN_KEYS.includes(key) ? out[key] : out.waiting).push(t);
  }
  return out;
}

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

/**
 * A ticket's comments newest-first (the established reading order), without mutating the input.
 * Comments without a timestamp sort to the end (treated as oldest). Returns `[]` for no comments.
 */
export function commentsNewestFirst(comments: readonly TicketComment[] | undefined): readonly TicketComment[] {
  return [...(comments ?? [])].sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
}
