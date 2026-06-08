import { describe, expect, it } from 'vitest';
import type { ProjectState, TicketComment, TicketView, WorkflowView } from '../core/models';
import {
  commentsNewestFirst,
  nextStageInOrder,
  nextStage,
  offTrackGroups,
  stageColumns,
  statusChip,
  ticketNeedsYou,
} from './board';

function ticket(t: Partial<TicketView>): TicketView {
  return { id: 't', title: 't', status: 'in_progress', stage: 'code', ...t };
}

const WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'done', owner: null, gate: null },
  ],
};

describe('stageColumns — columns follow the active track stages in order', () => {
  it('returns one column per workflow stage, in order, each placing tickets whose stage matches', () => {
    const tickets = [
      ticket({ id: 'a', stage: 'vision' }),
      ticket({ id: 'b', stage: 'code' }),
      ticket({ id: 'c', stage: 'code' }),
    ];
    const cols = stageColumns(WF, tickets);
    expect(cols.map((c) => c.stage)).toEqual(['vision', 'architecture', 'code', 'done']);
    expect(cols.map((c) => c.owner)).toEqual(['/po', '/arch', '/be', null]);
    expect(cols.find((c) => c.stage === 'vision')!.tickets.map((t) => t.id)).toEqual(['a']);
    expect(cols.find((c) => c.stage === 'code')!.tickets.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('renders an empty stage column (no tickets) rather than dropping it — count is zero', () => {
    const cols = stageColumns(WF, [ticket({ id: 'a', stage: 'vision' })]);
    const arch = cols.find((c) => c.stage === 'architecture')!;
    expect(arch.tickets).toEqual([]);
  });

  it('returns no columns when there is no workflow view (board falls back to empty)', () => {
    expect(stageColumns(null, [])).toEqual([]);
    expect(stageColumns(undefined, [])).toEqual([]);
  });
});

describe('offTrackGroups — a ticket in a stage not in the track is surfaced, never dropped', () => {
  it('groups orphaned tickets by their recorded stage and excludes in-track tickets', () => {
    const tickets = [
      ticket({ id: 'a', stage: 'code' }),
      ticket({ id: 'orphan1', stage: 'design-review' }),
      ticket({ id: 'orphan2', stage: 'design-review' }),
      ticket({ id: 'orphan3', stage: 'qa' }),
    ];
    const groups = offTrackGroups(WF, tickets);
    expect(groups.map((g) => g.stage)).toEqual(['design-review', 'qa']);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['orphan1', 'orphan2']);
    expect(groups[1].tickets.map((t) => t.id)).toEqual(['orphan3']);
  });

  it('is empty when every ticket sits on a real stage (absent-not-zero off-track lane)', () => {
    expect(offTrackGroups(WF, [ticket({ id: 'a', stage: 'code' })])).toEqual([]);
  });

  it('treats a ticket with no stage as off-track under a blank-stage group rather than losing it', () => {
    const groups = offTrackGroups(WF, [ticket({ id: 'x', stage: undefined })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['x']);
  });
});

describe('nextStageInOrder — advance follows the workflow stage order', () => {
  const order = ['vision', 'architecture', 'code', 'done'];
  it('returns the stage after the current one', () => {
    expect(nextStageInOrder('architecture', order)).toBe('code');
  });
  it('returns null at the last stage (nothing to advance to)', () => {
    expect(nextStageInOrder('done', order)).toBeNull();
  });
  it('returns the first real stage for an off-track ticket so it can be re-homed onto the track', () => {
    expect(nextStageInOrder('design-review', order)).toBe('vision');
  });
  it('returns null with no stages', () => {
    expect(nextStageInOrder('code', [])).toBeNull();
  });
});

describe('statusChip — status becomes a card chip, never a column', () => {
  it('maps each status to a glyph + label', () => {
    expect(statusChip('in_progress')).toMatchObject({ glyph: 'progress', label: 'in progress' });
    expect(statusChip('waiting')).toMatchObject({ glyph: 'dot', label: 'waiting' });
    expect(statusChip('blocked')).toMatchObject({ glyph: 'blocked', label: 'blocked' });
    expect(statusChip('done')).toMatchObject({ glyph: 'check', label: 'done' });
  });
  it('falls back to a neutral waiting chip for an unknown status (never blank)', () => {
    expect(statusChip('mystery')).toMatchObject({ glyph: 'dot' });
    expect(statusChip(undefined)).toMatchObject({ glyph: 'dot' });
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
