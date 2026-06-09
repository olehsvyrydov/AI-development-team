import { describe, expect, it } from 'vitest';
import type { ProjectState, TicketComment, TicketView, WorkflowView } from '../core/models';
import {
  activeSegmentIndex,
  backlogTickets,
  cardGateSummary,
  commentsNewestFirst,
  isBacklog,
  nextStageInOrder,
  nextStage,
  offTrackGroups,
  PRE_START_STAGES,
  stageColumns,
  statusChip,
  terminalStage,
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

  it('excludes a ticket the Backlog bar claims (unstaged or backlog-staged) from the off-track lane', () => {
    const groups = offTrackGroups(WF, [
      ticket({ id: 'x', stage: undefined }),
      ticket({ id: 'y', stage: 'backlog' }),
      ticket({ id: 'orphan', stage: 'design-review' }),
    ]);
    expect(groups.map((g) => g.stage)).toEqual(['design-review']);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['orphan']);
  });

  it('excludes a pre-start ticket (e.g. "ready") yet keeps a genuine orphan (e.g. "superseded")', () => {
    const groups = offTrackGroups(WF, [
      ticket({ id: 'ready', stage: 'ready' }),
      ticket({ id: 'super', stage: 'superseded' }),
    ]);
    expect(groups.map((g) => g.stage)).toEqual(['superseded']);
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['super']);
  });
});

describe('isBacklog / backlogTickets — the holding-pen predicate (unstaged or backlog-staged)', () => {
  it('treats an unset, empty, or "unknown" stage as Backlog (never routed onto the track)', () => {
    expect(isBacklog(ticket({ stage: undefined }), WF)).toBe(true);
    expect(isBacklog(ticket({ stage: '' }), WF)).toBe(true);
    expect(isBacklog(ticket({ stage: 'unknown' }), WF)).toBe(true);
  });

  it('treats the conventional first-stage token "backlog" as Backlog (case-insensitive)', () => {
    expect(isBacklog(ticket({ stage: 'backlog' }), WF)).toBe(true);
    expect(isBacklog(ticket({ stage: 'Backlog' }), WF)).toBe(true);
  });

  it('treats any pre-start lifecycle token as Backlog (un-started, not yet a workflow stage)', () => {
    for (const token of PRE_START_STAGES) {
      expect(isBacklog(ticket({ stage: token }), WF), `${token} → Backlog`).toBe(true);
      expect(isBacklog(ticket({ stage: token.toUpperCase() }), WF), `${token.toUpperCase()} → Backlog`).toBe(true);
    }
    // A real lifecycle observed live — `ready` un-started tickets belong in Backlog, not off-track.
    expect(isBacklog(ticket({ stage: 'ready' }), WF)).toBe(true);
  });

  it('is false for a ticket sitting at a real track stage', () => {
    expect(isBacklog(ticket({ stage: 'vision' }), WF)).toBe(false);
    expect(isBacklog(ticket({ stage: 'code' }), WF)).toBe(false);
  });

  it('is false for an unrecognized non-pre-start token (a genuine orphan → off-track, not Backlog)', () => {
    expect(isBacklog(ticket({ stage: 'superseded' }), WF)).toBe(false);
    expect(isBacklog(ticket({ stage: 'cancelled' }), WF)).toBe(false);
  });

  it('is workflow-aware: a pre-start token the workflow DEFINES as a real stage is NOT Backlog', () => {
    const wfWithReady: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'ready', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    // `ready` is a real workflow stage here → routes to its column, not Backlog.
    expect(isBacklog(ticket({ stage: 'ready' }), wfWithReady)).toBe(false);
    expect(isBacklog(ticket({ stage: 'Ready' }), wfWithReady)).toBe(false);
    // The same token, in a workflow that does NOT define it, still falls to Backlog (pre-start).
    expect(isBacklog(ticket({ stage: 'ready' }), WF)).toBe(true);
  });

  it('keeps the intake token `backlog` in Backlog even when the workflow names it a stage', () => {
    const wfBacklogStage: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
      ],
    };
    expect(isBacklog(ticket({ stage: 'backlog' }), wfBacklogStage)).toBe(true);
  });

  it('collects the backlog tickets, preserving first-seen order', () => {
    const tickets = [
      ticket({ id: 'a', stage: 'code' }),
      ticket({ id: 'b', stage: undefined }),
      ticket({ id: 'c', stage: 'backlog' }),
      ticket({ id: 'd', stage: 'vision' }),
    ];
    expect(backlogTickets(WF, tickets).map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('stageColumns — Backlog claims its set first (disjoint by set-difference)', () => {
  it('excludes backlog-claimed tickets from the stage columns (no double-placement)', () => {
    const tickets = [
      ticket({ id: 'b', stage: undefined }),
      ticket({ id: 'v', stage: 'vision' }),
    ];
    const cols = stageColumns(WF, tickets);
    const allInColumns = cols.flatMap((c) => c.tickets.map((t) => t.id));
    expect(allInColumns).not.toContain('b');
    expect(allInColumns).toContain('v');
  });

  it('drops a literal "backlog" first-stage column so the Backlog bar replaces it (no empty ghost)', () => {
    const wfBacklogFirst: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const cols = stageColumns(wfBacklogFirst, [ticket({ id: 'a', stage: 'backlog' })]);
    expect(cols.map((c) => c.stage)).toEqual(['code', 'done']);
  });

  it('workflow-aware: a pre-start token that is a REAL stage routes to its COLUMN, not Backlog', () => {
    // The workflow legitimately names `ready` as a stage (the builder allows arbitrary stage names).
    const wfReadyStage: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'ready', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const tickets = [
      ticket({ id: 'r', stage: 'ready' }),
      ticket({ id: 'c', stage: 'code' }),
    ];
    // The `ready` column renders AND holds its ticket (not misclassified into Backlog).
    const cols = stageColumns(wfReadyStage, tickets);
    expect(cols.map((c) => c.stage)).toEqual(['ready', 'code', 'done']);
    expect(cols.find((c) => c.stage === 'ready')!.tickets.map((t) => t.id)).toEqual(['r']);
    // And the Backlog set is empty: the `ready` ticket is NOT claimed by Backlog.
    expect(backlogTickets(wfReadyStage, tickets).map((t) => t.id)).toEqual([]);
    // DISJOINTNESS: each ticket lands in exactly one region (column XOR Backlog XOR off-track).
    expect(offTrackGroups(wfReadyStage, tickets)).toEqual([]);

    // Contrast: the SAME `ready` token, in a workflow that does NOT define it, falls to Backlog.
    expect(backlogTickets(WF, [ticket({ id: 'r', stage: 'ready' })]).map((t) => t.id)).toEqual(['r']);
  });
});

describe('terminalStage — the done terminus is the last stage', () => {
  it('returns the last stage name', () => {
    expect(terminalStage(WF)).toBe('done');
  });
  it('returns null when there is no workflow view', () => {
    expect(terminalStage(null)).toBeNull();
    expect(terminalStage({ activeTrack: null, stages: [] })).toBeNull();
  });
});

describe('activeSegmentIndex — how far the rail accent reaches (furthest in-progress stage)', () => {
  it('is the index of the furthest stage holding an in-progress ticket', () => {
    const tickets = [
      ticket({ id: 'a', stage: 'vision', status: 'in_progress' }),
      ticket({ id: 'b', stage: 'code', status: 'in_progress' }),
      ticket({ id: 'c', stage: 'done', status: 'done' }),
    ];
    // vision=0, code=2 → furthest in-progress is code at index 2.
    expect(activeSegmentIndex(WF, tickets)).toBe(2);
  });
  it('is -1 when no stage holds an in-progress ticket (no accent)', () => {
    expect(activeSegmentIndex(WF, [ticket({ id: 'c', stage: 'done', status: 'done' })])).toBe(-1);
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

describe('cardGateSummary — a compact card gate, never a chip per gate', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
      { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  it('is null when the ticket has no gates (nothing to summarise)', () => {
    expect(cardGateSummary(ticket({ stage: 'vision', gates: [] }), wf)).toBeNull();
    expect(cardGateSummary(ticket({ stage: 'vision', gates: undefined }), wf)).toBeNull();
  });

  it('surfaces the CURRENT-stage gate when it is unmet (rejected) so a blocked card shows why', () => {
    const s = cardGateSummary(
      ticket({
        stage: 'security',
        gates: [
          { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' },
          { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' },
        ],
      }),
      wf,
    );
    expect(s).toMatchObject({ kind: 'gate', name: 'SECOPS_APPROVED', shape: 'hard', text: 'rejected', tone: 'danger' });
  });

  it('surfaces the CURRENT-stage gate when it is pending (unmet, not yet decided)', () => {
    const s = cardGateSummary(
      ticket({ stage: 'architecture', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'pending' }] }),
      wf,
    );
    expect(s).toMatchObject({ kind: 'gate', name: 'ARCH_APPROVED', text: 'pending' });
  });

  it('rolls up to a compact passed/total chip when the current-stage gate is already passed', () => {
    const s = cardGateSummary(
      ticket({
        stage: 'security',
        gates: [
          { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' },
          { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' },
        ],
      }),
      wf,
    );
    expect(s).toMatchObject({ kind: 'rollup', passed: 2, total: 2 });
  });

  it('rolls up when no gate governs the current stage (a stage with no gate, but gates carried)', () => {
    const s = cardGateSummary(
      ticket({ stage: 'vision', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }] }),
      wf,
    );
    expect(s).toMatchObject({ kind: 'rollup', passed: 1, total: 1 });
  });

  it('counts only passed gates in the roll-up total', () => {
    const s = cardGateSummary(
      ticket({
        stage: 'vision',
        gates: [
          { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' },
          { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'pending' },
          { name: 'CODE_REVIEWED', refusal: 'soft', state: 'rejected' },
        ],
      }),
      wf,
    );
    expect(s).toMatchObject({ kind: 'rollup', passed: 1, total: 3 });
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
