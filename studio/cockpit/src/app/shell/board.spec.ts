import { describe, expect, it } from 'vitest';
import type { ProjectState, TicketComment, TicketView } from '../core/models';
import {
  BOARD_COLUMNS,
  commentsNewestFirst,
  groupByColumn,
  nextStage,
  ticketNeedsYou,
} from './board';

function ticket(t: Partial<TicketView>): TicketView {
  return { id: 't', title: 't', status: 'in_progress', stage: 'code', ...t };
}

describe('BOARD_COLUMNS', () => {
  it('has exactly the four real status columns, left→right, and not needsYou', () => {
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual(['in_progress', 'waiting', 'blocked', 'done']);
    expect(BOARD_COLUMNS.map((c) => c.key)).not.toContain('needsYou');
  });
});

describe('groupByColumn', () => {
  it('distributes tickets into a bucket per real status, with counts that match', () => {
    const tickets = [
      ticket({ id: 'a', status: 'in_progress' }),
      ticket({ id: 'b', status: 'in_progress' }),
      ticket({ id: 'c', status: 'blocked' }),
      ticket({ id: 'd', status: 'done' }),
    ];
    const grouped = groupByColumn(tickets);
    expect(grouped.in_progress.map((t) => t.id)).toEqual(['a', 'b']);
    expect(grouped.waiting).toEqual([]);
    expect(grouped.blocked.map((t) => t.id)).toEqual(['c']);
    expect(grouped.done.map((t) => t.id)).toEqual(['d']);
  });

  it('routes an unknown / missing status to waiting rather than dropping the ticket', () => {
    const grouped = groupByColumn([ticket({ id: 'x', status: undefined }), ticket({ id: 'y', status: 'mystery' })]);
    expect(grouped.waiting.map((t) => t.id)).toEqual(['x', 'y']);
  });
});

describe('ticketNeedsYou — a chip, derived, not a column', () => {
  it('is true only when a hard gate is currently rejected (the blocking-decision signal)', () => {
    expect(
      ticketNeedsYou(ticket({ gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] })),
    ).toBe(true);
    expect(
      ticketNeedsYou(ticket({ gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] })),
    ).toBe(false);
    expect(ticketNeedsYou(ticket({ gates: [{ name: 'DESIGN_APPROVED', refusal: 'soft', state: 'rejected' }] }))).toBe(
      false,
    );
  });
});

describe('nextStage', () => {
  const tracks = { full: ['vision', 'code', 'review', 'done'] };

  it('returns the stage after the ticket current stage on its track', () => {
    expect(nextStage(ticket({ track: 'full', stage: 'code' }), tracks)).toBe('review');
  });

  it('returns null at the last stage (nothing to advance to)', () => {
    expect(nextStage(ticket({ track: 'full', stage: 'done' }), tracks)).toBeNull();
  });

  it('returns null when the stage is not on the track', () => {
    expect(nextStage(ticket({ track: 'full', stage: 'unknown' }), tracks)).toBeNull();
  });

  it('falls back to the only track when the ticket carries no track name', () => {
    expect(nextStage(ticket({ track: null, stage: 'code' }), tracks)).toBe('review');
  });
});

describe('commentsNewestFirst', () => {
  it('orders by timestamp descending (newest first) without mutating the input', () => {
    const input: readonly TicketComment[] = [
      { id: '1', ts: '2026-06-01T10:00:00Z', body: 'old' },
      { id: '2', ts: '2026-06-02T10:00:00Z', body: 'new' },
    ];
    const out = commentsNewestFirst(input);
    expect(out.map((c) => c.id)).toEqual(['2', '1']);
    expect(input.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('treats a missing state as no comments', () => {
    const s: ProjectState = {};
    expect(commentsNewestFirst(s.tickets?.[0]?.comments)).toEqual([]);
  });
});
