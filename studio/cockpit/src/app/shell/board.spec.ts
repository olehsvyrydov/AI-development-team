import { describe, expect, it } from 'vitest';
import type { ProjectState, TicketComment, TicketView, WorkflowView } from '../core/models';
import {
  activeSegmentIndex,
  backlogTickets,
  cardGateSummary,
  cardVisualStatus,
  commentsNewestFirst,
  doneStage,
  dwellSince,
  enteredCurrentStageAt,
  isBacklog,
  needsYouReason,
  nextStageInOrder,
  nextStage,
  offTrackGroups,
  partitionBoard,
  populatedStageCount,
  PRE_START_STAGES,
  RECENTLY_DONE_CAP,
  stageActivity,
  stageColumns,
  stageRoleLine,
  stageGateNode,
  stageNodeStatus,
  statusChip,
  ticketNeedsYou,
  worklistBands,
  worklistProgress,
  type StageColumn,
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

describe('doneStage — the conventional DONE stage (by name), not blindly the last stage', () => {
  it('targets a stage named "done" even when a later stage follows it (e.g. a Test stage after done)', () => {
    const wf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
        { stage: 'Test', owner: '/qa', gate: null },
      ],
    };
    expect(doneStage(wf)).toBe('done');
  });

  it('matches any conventional done-name, case-insensitively (complete/completed/closed/shipped/released)', () => {
    for (const name of ['Done', 'complete', 'COMPLETED', 'Closed', 'shipped', 'Released']) {
      const wf: WorkflowView = {
        activeTrack: 'full',
        stages: [
          { stage: 'code', owner: '/be', gate: null },
          { stage: name, owner: null, gate: null },
          { stage: 'audit', owner: '/qa', gate: null },
        ],
      };
      expect(doneStage(wf), `${name} → done folder`).toBe(name);
    }
  });

  it('falls back to the LAST stage when no stage carries a conventional done-name', () => {
    const wf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'review', owner: '/rev', gate: null },
        { stage: 'ship-it', owner: null, gate: null },
      ],
    };
    expect(doneStage(wf)).toBe('ship-it');
  });

  it('returns null when there is no workflow view (no done folder)', () => {
    expect(doneStage(null)).toBeNull();
    expect(doneStage({ activeTrack: null, stages: [] })).toBeNull();
  });
});

describe('partitionBoard — one pass partitions every ticket into exactly one region', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'backlog', owner: '/po', gate: null },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
      { stage: 'Test', owner: '/qa', gate: null },
    ],
  };
  const tickets = [
    ticket({ id: 'b', stage: undefined, status: 'waiting' }),
    ticket({ id: 'c1', stage: 'code', status: 'in_progress' }),
    ticket({ id: 'd1', stage: 'done', status: 'done' }),
    ticket({ id: 'd2', stage: 'done', status: 'done' }),
    ticket({ id: 't1', stage: 'Test', status: 'waiting' }),
    ticket({ id: 'o1', stage: 'gone', status: 'waiting' }),
  ];

  it('drops both the backlog stage and the done stage from the rendered columns (a Test-after-done stays a column)', () => {
    const p = partitionBoard(wf, tickets);
    expect(p.columns.map((c) => c.stage)).toEqual(['code', 'Test']);
    expect(p.doneStage).toBe('done');
  });

  it('collapses the done-named stage tickets into the done bucket (real count, not the trailing stage)', () => {
    const p = partitionBoard(wf, tickets);
    expect(p.doneTickets.map((t) => t.id)).toEqual(['d1', 'd2']);
    // The trailing `Test` column holds its own ticket, not the done ones.
    expect(p.columns.find((c) => c.stage === 'Test')!.tickets.map((t) => t.id)).toEqual(['t1']);
  });

  it('routes unstaged tickets to backlog and unknown-stage tickets to off-track', () => {
    const p = partitionBoard(wf, tickets);
    expect(p.backlog.map((t) => t.id)).toEqual(['b']);
    expect(p.offTrack.map((g) => g.stage)).toEqual(['gone']);
    expect(p.offTrack[0].tickets.map((t) => t.id)).toEqual(['o1']);
  });

  it('R1 disjointness: every ticket lands in exactly one region', () => {
    const p = partitionBoard(wf, tickets);
    const ids = new Set<string>();
    const add = (id: string | undefined) => {
      expect(ids.has(id!), `duplicate ${id}`).toBe(false);
      ids.add(id!);
    };
    p.backlog.forEach((t) => add(t.id));
    p.columns.forEach((c) => c.tickets.forEach((t) => add(t.id)));
    p.doneTickets.forEach((t) => add(t.id));
    p.offTrack.forEach((g) => g.tickets.forEach((t) => add(t.id)));
    expect([...ids].sort()).toEqual(['b', 'c1', 'd1', 'd2', 'o1', 't1']);
  });

  it('matches the standalone helpers (parity) so the single pass changes no behavior', () => {
    const p = partitionBoard(wf, tickets);
    expect(p.backlog.map((t) => t.id)).toEqual(backlogTickets(wf, tickets).map((t) => t.id));
    expect(p.offTrack.map((g) => g.stage)).toEqual(offTrackGroups(wf, tickets).map((g) => g.stage));
  });

  it('empties to all-empty regions when there is no workflow view', () => {
    const p = partitionBoard(null, []);
    expect(p.columns).toEqual([]);
    expect(p.backlog).toEqual([]);
    expect(p.doneTickets).toEqual([]);
    expect(p.offTrack).toEqual([]);
    expect(p.doneStage).toBeNull();
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

  it('indexes against the rendered rail (stages minus the dropped `backlog`), so the accent aligns with the nodes', () => {
    // The workflow opens with a literal `backlog` stage that the rail drops, so the rendered
    // columns are [code, review, done] — `code` is rail index 0, not 1.
    const wfBacklogFirst: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'review', owner: '/rev', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const tickets = [ticket({ id: 'a', stage: 'code', status: 'in_progress' })];
    const cols = stageColumns(wfBacklogFirst, tickets);
    expect(cols.map((c) => c.stage)).toEqual(['code', 'review', 'done']);
    // `code` is the furthest in-progress stage; in the rendered rail it sits at index 0.
    const idx = activeSegmentIndex(wfBacklogFirst, tickets);
    expect(idx).toBe(0);
    expect(cols[idx].stage).toBe('code');
  });

  it('returns the furthest (not the last-seen) in-progress stage across a mix of tickets', () => {
    const tickets = [
      ticket({ id: 'a', stage: 'code', status: 'in_progress' }),
      ticket({ id: 'b', stage: 'vision', status: 'in_progress' }),
      ticket({ id: 'c', stage: 'review', status: 'in_progress' }),
      ticket({ id: 'd', stage: 'vision', status: 'in_progress' }),
    ];
    // WF rail order: vision=0, code=2, review=... ; review is furthest regardless of ticket order.
    const rail = partitionBoard(WF, tickets).columns.map((c) => c.stage);
    const expected = Math.max(...tickets.map((t) => rail.indexOf(t.stage!)));
    expect(activeSegmentIndex(WF, tickets)).toBe(expected);
  });

  it('matches a per-ticket indexOf over the rendered rail (precomputed map equals indexOf semantics)', () => {
    const wf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'review', owner: '/rev', gate: null },
        { stage: 'done', owner: null, gate: null },
      ],
    };
    const tickets = [
      ticket({ id: 'a', stage: 'review', status: 'in_progress' }),
      ticket({ id: 'b', stage: 'code', status: 'in_progress' }),
      ticket({ id: 'c', stage: 'unknown', status: 'in_progress' }),
      ticket({ id: 'd', stage: 'code', status: 'done' }),
    ];
    const rail = partitionBoard(wf, tickets).columns.map((c) => c.stage);
    let furthest = -1;
    for (const t of tickets) {
      if (t.status !== 'in_progress') continue;
      furthest = Math.max(furthest, rail.indexOf(t.stage ?? ''));
    }
    expect(activeSegmentIndex(wf, tickets)).toBe(furthest);
  });

  it('indexes against the rail with the done stage dropped too (a stage after done does not shift the accent)', () => {
    // The rail drops the literal `backlog` stage AND the done-named stage (now the folder), so the
    // rendered nodes are [code, Test]. A `code` in-progress ticket lights index 0.
    const wf: WorkflowView = {
      activeTrack: 'full',
      stages: [
        { stage: 'backlog', owner: '/po', gate: null },
        { stage: 'code', owner: '/be', gate: null },
        { stage: 'done', owner: null, gate: null },
        { stage: 'Test', owner: '/qa', gate: null },
      ],
    };
    const tickets = [ticket({ id: 'a', stage: 'code', status: 'in_progress' })];
    const rail = partitionBoard(wf, tickets).columns;
    expect(rail.map((c) => c.stage)).toEqual(['code', 'Test']);
    const idx = activeSegmentIndex(wf, tickets);
    expect(idx).toBe(0);
    expect(rail[idx].stage).toBe('code');
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

describe('ticketNeedsYou — a chip/band, derived, not a column', () => {
  it('is true when a hard gate is currently rejected (the blocking-decision signal)', () => {
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

  it('is true when waiting on a known expected owner with no live agent (the hub case board.ts missed)', () => {
    expect(
      ticketNeedsYou(ticket({ status: 'waiting', expectedOwner: '/arch', active: false, gates: [] })),
    ).toBe(true);
  });

  it('is false when a live agent IS active on a waiting ticket (an agent will act, not the human)', () => {
    expect(
      ticketNeedsYou(ticket({ status: 'waiting', expectedOwner: '/arch', active: true, gates: [] })),
    ).toBe(false);
  });

  it('is false when waiting with no expected owner (nobody named to decide)', () => {
    expect(ticketNeedsYou(ticket({ status: 'waiting', expectedOwner: null, active: false, gates: [] }))).toBe(false);
  });

  it('is false for an in_progress ticket and a done ticket (not awaiting a person)', () => {
    expect(ticketNeedsYou(ticket({ status: 'in_progress', expectedOwner: '/be', active: false }))).toBe(false);
    expect(ticketNeedsYou(ticket({ status: 'done', expectedOwner: '/qa', active: false }))).toBe(false);
  });
});

/**
 * The canonical hub predicate, replicated verbatim from `hub/lib/state.js` `needsHumanDecision` as
 * the contract the FE must mirror byte-for-byte. If the FE `ticketNeedsYou` ever drifts from this,
 * the Needs-you band, the per-card chip, and `taskSummary.byStatus.needsYou` would disagree.
 */
function hubNeedsHumanDecision(t: TicketView): boolean {
  for (const g of t.gates ?? []) {
    if (g.state === 'rejected' && g.refusal === 'hard') return true;
  }
  return t.status === 'waiting' && !!t.expectedOwner && !t.active;
}

describe('ticketNeedsYou parity — mirrors the canonical hub needsHumanDecision', () => {
  const fixtures: TicketView[] = [
    ticket({ gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] }),
    ticket({ gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] }),
    ticket({ gates: [{ name: 'DESIGN_APPROVED', refusal: 'soft', state: 'rejected' }] }),
    ticket({ status: 'waiting', expectedOwner: '/arch', active: false, gates: [] }),
    ticket({ status: 'waiting', expectedOwner: '/arch', active: true, gates: [] }),
    ticket({ status: 'waiting', expectedOwner: null, active: false, gates: [] }),
    ticket({ status: 'in_progress', expectedOwner: '/be', active: false, gates: [] }),
    ticket({ status: 'done', stage: 'done', expectedOwner: '/qa', active: false, gates: [] }),
  ];

  it('agrees with the hub predicate on every representative fixture', () => {
    for (const t of fixtures) {
      expect(ticketNeedsYou(t)).toBe(hubNeedsHumanDecision(t));
    }
  });
});

describe('needsYouReason — the plain-words why, derived from the same fields the predicate reads', () => {
  it('is null for a ticket that does not need you', () => {
    expect(needsYouReason(ticket({ status: 'in_progress', active: true }))).toBeNull();
  });

  it('reads a loop hand-back first, with the loop glyph', () => {
    const r = needsYouReason(
      ticket({ status: 'waiting', expectedOwner: '/po', active: false, labels: ['loop:3'], gates: [] }),
    );
    expect(r?.glyph).toBe('loop');
    expect(r?.text).toMatch(/looped 3× — needs you/);
  });

  it('names a rejected hard gate as a blocking decision', () => {
    const r = needsYouReason(ticket({ gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] }));
    expect(r?.text).toMatch(/blocked: a gate needs your decision/);
  });

  it('names the expected owner whose approval is pending', () => {
    const r = needsYouReason(ticket({ status: 'waiting', expectedOwner: '/arch', active: false, gates: [] }));
    expect(r?.text).toBe('/arch approval pending');
  });
});

describe('worklistBands — fixed-order lifecycle bands, absent-not-zero, disjoint (R1)', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
      { stage: 'done', owner: null, gate: null },
    ],
  };
  const tickets: TicketView[] = [
    ticket({ id: 'N1', status: 'blocked', stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] }),
    ticket({ id: 'N2', status: 'waiting', stage: 'vision', expectedOwner: '/po', active: false, gates: [] }),
    ticket({ id: 'F1', status: 'in_progress', stage: 'code', assignee: '/be', gates: [] }),
    ticket({ id: 'B1', status: 'waiting', stage: 'backlog', gates: [] }),
    ticket({ id: 'D1', status: 'done', stage: 'done', comments: [{ ts: '2026-06-10T00:00:00Z' }] }),
    ticket({ id: 'D2', status: 'done', stage: 'done', comments: [{ ts: '2026-06-12T00:00:00Z' }] }),
    ticket({ id: 'OT', status: 'waiting', stage: 'gone-stage', gates: [] }),
  ];

  it('renders the bands in fixed reading order', () => {
    const bands = worklistBands(wf, tickets);
    expect(bands.map((b) => b.kind)).toEqual(['needs-you', 'in-flight', 'backlog', 'recently-done', 'off-track']);
  });

  it('claims needs-you first; each ticket lands in exactly one band (disjointness)', () => {
    const bands = worklistBands(wf, tickets);
    const ids = bands.flatMap((b) => b.tickets.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(bands.find((b) => b.kind === 'needs-you')!.tickets.map((t) => t.id).sort()).toEqual(['N1', 'N2']);
    // N2 is a waiting backlog ticket that needs you → it is in Needs-you, NOT Backlog.
    expect(bands.find((b) => b.kind === 'backlog')!.tickets.map((t) => t.id)).toEqual(['B1']);
  });

  it('orders recently-done most-recent-first by newest comment ts', () => {
    const done = worklistBands(wf, tickets).find((b) => b.kind === 'recently-done')!;
    expect(done.tickets.map((t) => t.id)).toEqual(['D2', 'D1']);
  });

  it('omits a band whose set is empty (absent-not-zero, no (0) band)', () => {
    const onlyDone = worklistBands(wf, [ticket({ id: 'D', status: 'done', stage: 'done' })]);
    expect(onlyDone.map((b) => b.kind)).toEqual(['recently-done']);
  });

  it('band counts sum to the visible total', () => {
    const bands = worklistBands(wf, tickets);
    const sum = bands.reduce((n, b) => n + b.tickets.length, 0);
    expect(sum).toBe(tickets.length);
  });

  it('caps the recently-done teaser threshold at a small constant', () => {
    expect(RECENTLY_DONE_CAP).toBeLessThanOrEqual(6);
  });
});

describe('worklistBands — In-flight is mid-pipeline only; a queued backlog ticket is not "in flight"', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  // A backlog-stage ticket whose derived status is in_progress, a done-stage in_progress ticket,
  // an off-track in_progress ticket, and a genuinely mid-pipeline in_progress ticket. Only the last
  // is "In flight"; the others belong to Backlog / Recently-done / Off-track respectively.
  const tickets: TicketView[] = [
    ticket({ id: 'BQ', status: 'in_progress', stage: 'backlog', gates: [] }),
    ticket({ id: 'DQ', status: 'in_progress', stage: 'done', comments: [{ ts: '2026-06-11T00:00:00Z' }] }),
    ticket({ id: 'OQ', status: 'in_progress', stage: 'gone-stage', gates: [] }),
    ticket({ id: 'MP', status: 'in_progress', stage: 'code', gates: [] }),
  ];

  it('no ticket id appears in two bands and the bands are mutually exclusive', () => {
    const bands = worklistBands(wf, tickets);
    const ids = bands.flatMap((b) => b.tickets.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Σ band counts equals the visible ticket count (no overlap, none dropped)', () => {
    const bands = worklistBands(wf, tickets);
    const sum = bands.reduce((n, b) => n + b.tickets.length, 0);
    expect(sum).toBe(tickets.length);
  });

  it('a backlog-stage in_progress ticket lands in Backlog, never In-flight', () => {
    const bands = worklistBands(wf, tickets);
    expect(bands.find((b) => b.kind === 'backlog')!.tickets.map((t) => t.id)).toContain('BQ');
    expect(bands.find((b) => b.kind === 'in-flight')!.tickets.map((t) => t.id)).not.toContain('BQ');
  });

  it('In-flight holds only tickets in a real workflow stage (not backlog/done/off-track)', () => {
    const inFlight = worklistBands(wf, tickets).find((b) => b.kind === 'in-flight')!;
    expect(inFlight.tickets.map((t) => t.id)).toEqual(['MP']);
  });

  it('routes the done- and off-track-staged in_progress tickets to their own bands', () => {
    const bands = worklistBands(wf, tickets);
    expect(bands.find((b) => b.kind === 'recently-done')!.tickets.map((t) => t.id)).toEqual(['DQ']);
    expect(bands.find((b) => b.kind === 'off-track')!.tickets.map((t) => t.id)).toEqual(['OQ']);
  });

  it('for an all-backlog/done project In-flight is correctly empty (absent), tickets not duplicated', () => {
    const project: TicketView[] = [
      ticket({ id: 'B1', status: 'in_progress', stage: 'backlog', gates: [] }),
      ticket({ id: 'B2', status: 'in_progress', stage: 'backlog', gates: [] }),
      ticket({ id: 'B3', status: 'in_progress', stage: 'backlog', gates: [] }),
      ticket({ id: 'DN', status: 'done', stage: 'done', comments: [{ ts: '2026-06-12T00:00:00Z' }] }),
    ];
    const bands = worklistBands(wf, project);
    expect(bands.map((b) => b.kind)).not.toContain('in-flight');
    expect(bands.find((b) => b.kind === 'backlog')!.tickets.map((t) => t.id)).toEqual(['B1', 'B2', 'B3']);
    const ids = bands.flatMap((b) => b.tickets.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.reduce((n) => n + 1, 0)).toBe(project.length);
  });
});

describe('populatedStageCount — how many rail stages hold work (drives the auto-default mode)', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  it('counts only stages with at least one ticket (excludes backlog and done)', () => {
    const ts = [
      ticket({ id: 'V', status: 'in_progress', stage: 'vision' }),
      ticket({ id: 'C', status: 'in_progress', stage: 'code' }),
      ticket({ id: 'B', status: 'waiting', stage: 'backlog' }),
      ticket({ id: 'D', status: 'done', stage: 'done' }),
    ];
    expect(populatedStageCount(wf, ts)).toBe(2);
  });

  it('is at most 1 when work clusters at one stage', () => {
    expect(populatedStageCount(wf, [ticket({ id: 'C', status: 'in_progress', stage: 'code' })])).toBe(1);
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

describe('cardVisualStatus — the per-card colour key, reusing the band predicates (no new data)', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  it('maps a genuinely mid-pipeline in_progress ticket to in-flight (blue)', () => {
    expect(cardVisualStatus(ticket({ status: 'in_progress', stage: 'code' }), wf)).toBe('in-flight');
  });

  it('maps a done ticket to done (green)', () => {
    expect(cardVisualStatus(ticket({ status: 'done', stage: 'done' }), wf)).toBe('done');
  });

  it('maps an unstaged/backlog ticket to backlog (neutral), even if its raw status is in_progress', () => {
    expect(cardVisualStatus(ticket({ status: 'waiting', stage: 'backlog' }), wf)).toBe('backlog');
    // A queued idea is planned, not "in flight" — backlog beats in_progress in precedence.
    expect(cardVisualStatus(ticket({ status: 'in_progress', stage: 'backlog' }), wf)).toBe('backlog');
    expect(cardVisualStatus(ticket({ status: 'waiting', stage: undefined }), wf)).toBe('backlog');
  });

  it('maps a blocked ticket to blocked (red)', () => {
    expect(cardVisualStatus(ticket({ status: 'blocked', stage: 'code' }), wf)).toBe('blocked');
  });

  it('needs-you OVERRIDES the raw status (a waiting card awaiting its owner reads amber, not neutral)', () => {
    const t = ticket({ status: 'waiting', stage: 'vision', expectedOwner: '/arch', active: false, gates: [] });
    expect(ticketNeedsYou(t)).toBe(true);
    expect(cardVisualStatus(t, wf)).toBe('needs-you');
  });

  it('needs-you beats in_progress (precedence): a rejected hard gate on an in_progress card reads amber', () => {
    const t = ticket({ status: 'in_progress', stage: 'code', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }] });
    expect(cardVisualStatus(t, wf)).toBe('needs-you');
  });

  it('a generic waiting card (not needs-you, not backlog) falls back to waiting (neutral)', () => {
    // A waiting ticket at a real stage with nobody named to decide is not needs-you.
    expect(cardVisualStatus(ticket({ status: 'waiting', stage: 'code', expectedOwner: null, active: false, gates: [] }), wf)).toBe('waiting');
  });

  it('the colour key matches the band a ticket lands in (colour cannot drift from the band)', () => {
    const tickets: TicketView[] = [
      ticket({ id: 'N', status: 'waiting', stage: 'vision', expectedOwner: '/po', active: false, gates: [] }),
      ticket({ id: 'F', status: 'in_progress', stage: 'code', gates: [] }),
      ticket({ id: 'B', status: 'waiting', stage: 'backlog', gates: [] }),
      ticket({ id: 'D', status: 'done', stage: 'done', comments: [{ ts: '2026-06-12T00:00:00Z' }] }),
    ];
    const bandOf = new Map<string, string>();
    for (const band of worklistBands(wf, tickets)) {
      for (const t of band.tickets) bandOf.set(t.id!, band.kind);
    }
    const expectedColourForBand: Record<string, string> = {
      'needs-you': 'needs-you',
      'in-flight': 'in-flight',
      backlog: 'backlog',
      'recently-done': 'done',
    };
    for (const t of tickets) {
      expect(cardVisualStatus(t, wf), `${t.id}`).toBe(expectedColourForBand[bandOf.get(t.id!)!]);
    }
  });
});

describe('worklistProgress — the segmented progress picture (reads existing counts, no new data)', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  it('reads the canonical taskSummary.byStatus when present: done / inProgress / backlog (remainder) / total / percent', () => {
    // backlog is the honest remainder: 49 − 30 − 11 = 8.
    const p = worklistProgress(
      { total: 49, byStatus: { in_progress: 11, waiting: 8, blocked: 0, done: 30, needsYou: 1 } },
      wf,
      [],
    );
    expect(p).toMatchObject({ done: 30, inProgress: 11, backlog: 8, total: 49, percentDone: 61, needsYou: 1 });
  });

  it('rounds the done percentage (done / total · 100)', () => {
    const p = worklistProgress({ total: 3, byStatus: { in_progress: 1, waiting: 0, blocked: 0, done: 1, needsYou: 0 } }, wf, []);
    expect(p!.percentDone).toBe(33); // round(1/3*100)
  });

  it('all-done → 100% done, full green, no remaining backlog, no amber tick', () => {
    const p = worklistProgress({ total: 4, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 4, needsYou: 0 } }, wf, []);
    expect(p).toMatchObject({ done: 4, inProgress: 0, backlog: 0, total: 4, percentDone: 100, needsYou: 0 });
  });

  it('all-backlog → 0% done, full neutral track (nothing done, nothing in flight)', () => {
    const p = worklistProgress({ total: 8, byStatus: { in_progress: 0, waiting: 8, blocked: 0, done: 0, needsYou: 0 } }, wf, []);
    expect(p).toMatchObject({ done: 0, inProgress: 0, backlog: 8, total: 8, percentDone: 0 });
  });

  it('segments (done + inProgress + backlog) sum to total — needs-you is NOT its own segment', () => {
    const p = worklistProgress({ total: 43, byStatus: { in_progress: 11, waiting: 0, blocked: 2, done: 30, needsYou: 5 } }, wf, []);
    expect(p!.done + p!.inProgress + p!.backlog).toBe(p!.total);
  });

  it('is null on an empty board (total 0) so the progress block is suppressed', () => {
    expect(worklistProgress({ total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } }, wf, [])).toBeNull();
    expect(worklistProgress(null, wf, [])).toBeNull();
  });

  it('falls back to counting tickets when the summary is absent', () => {
    const tickets: TicketView[] = [
      ticket({ id: 'F', status: 'in_progress', stage: 'code', gates: [] }),
      ticket({ id: 'B', status: 'waiting', stage: 'backlog', gates: [] }),
      ticket({ id: 'D1', status: 'done', stage: 'done', comments: [{ ts: '2026-06-12T00:00:00Z' }] }),
      ticket({ id: 'D2', status: 'done', stage: 'done', comments: [{ ts: '2026-06-12T00:00:00Z' }] }),
    ];
    const p = worklistProgress(undefined, wf, tickets);
    expect(p).toMatchObject({ done: 2, inProgress: 1, backlog: 1, total: 4, percentDone: 50 });
  });
});

function col(over: Partial<StageColumn>): StageColumn {
  return { stage: 'code', owner: '/be', gate: null, tickets: [], ...over };
}

describe('stageNodeStatus — the per-stage colour, reduced from cardVisualStatus (worst-actionable wins)', () => {
  const wf: WorkflowView = {
    activeTrack: 'full',
    stages: [
      { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
      { stage: 'code', owner: '/be', gate: null },
      { stage: 'done', owner: null, gate: null },
    ],
  };

  it('is blocked when any ticket reduces to needs-you (rejected hard gate)', () => {
    const c = col({
      stage: 'code',
      tickets: [
        ticket({ id: 'A', status: 'in_progress', stage: 'code', gates: [] }),
        ticket({ id: 'B', status: 'waiting', stage: 'code', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'rejected' }] }),
      ],
    });
    expect(stageNodeStatus(c, 1, 0, wf)).toBe('blocked');
  });

  it('is blocked when any ticket is raw blocked (no gate)', () => {
    const c = col({ stage: 'code', tickets: [ticket({ id: 'A', status: 'blocked', stage: 'code', gates: [] })] });
    expect(stageNodeStatus(c, 1, 0, wf)).toBe('blocked');
  });

  it('is running when no ticket is blocked but at least one is in_progress', () => {
    const c = col({
      stage: 'code',
      tickets: [
        ticket({ id: 'A', status: 'waiting', stage: 'code', gates: [] }),
        ticket({ id: 'B', status: 'in_progress', stage: 'code', gates: [] }),
      ],
    });
    expect(stageNodeStatus(c, 1, 0, wf)).toBe('running');
  });

  it('is waiting when tickets are present but none is in progress or blocked', () => {
    const c = col({ stage: 'code', tickets: [ticket({ id: 'A', status: 'waiting', stage: 'code', gates: [] })] });
    expect(stageNodeStatus(c, 1, 0, wf)).toBe('waiting');
  });

  it('is passed when the stage is empty and sits behind the active front', () => {
    const c = col({ stage: 'architecture', tickets: [] });
    // activeIndex 1 (front is at code), this column ci 0 → behind the front.
    expect(stageNodeStatus(c, 1, 0, wf)).toBe('passed');
  });

  it('is pending when the stage is empty and sits ahead of the active front', () => {
    const c = col({ stage: 'code', tickets: [] });
    // activeIndex 0 (front is at architecture), this column ci 1 → ahead of the front.
    expect(stageNodeStatus(c, 0, 1, wf)).toBe('pending');
  });

  it('is pending when empty and there is no active front (-1)', () => {
    const c = col({ stage: 'code', tickets: [] });
    expect(stageNodeStatus(c, -1, 0, wf)).toBe('pending');
  });
});

describe('stageGateNode — the rolled-up gate node on the connector entering a stage', () => {
  it('is null when the stage carries no gate', () => {
    expect(stageGateNode(col({ stage: 'code', gate: null, tickets: [] }))).toBeNull();
  });

  it('is rejected when ANY in-stage ticket has that gate rejected (worst-case wins)', () => {
    const c = col({
      stage: 'architecture',
      gate: { name: 'ARCH_APPROVED', refusal: 'hard' },
      tickets: [
        ticket({ id: 'A', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }] }),
        ticket({ id: 'B', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'rejected' }] }),
      ],
    });
    expect(stageGateNode(c)).toMatchObject({ name: 'ARCH_APPROVED', shape: 'hard', state: 'rejected', passed: 1, total: 2 });
  });

  it('is pending when any in-stage gate is non-passed but none rejected', () => {
    const c = col({
      stage: 'architecture',
      gate: { name: 'ARCH_APPROVED', refusal: 'hard' },
      tickets: [
        ticket({ id: 'A', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }] }),
        ticket({ id: 'B', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'pending' }] }),
      ],
    });
    expect(stageGateNode(c)).toMatchObject({ state: 'pending', passed: 1, total: 2 });
  });

  it('is passed when all in-stage gates are passed', () => {
    const c = col({
      stage: 'architecture',
      gate: { name: 'ARCH_APPROVED', refusal: 'hard' },
      tickets: [ticket({ id: 'A', gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }] })],
    });
    expect(stageGateNode(c)).toMatchObject({ state: 'passed', passed: 1, total: 1 });
  });

  it('is passed when the stage is empty (no blocker, no work)', () => {
    const c = col({ stage: 'architecture', gate: { name: 'ARCH_APPROVED', refusal: 'hard' }, tickets: [] });
    expect(stageGateNode(c)).toMatchObject({ state: 'passed', passed: 0, total: 0 });
  });

  it('carries the soft shape for a soft gate', () => {
    const c = col({ stage: 'design', gate: { name: 'DESIGN_APPROVED', refusal: 'soft' }, tickets: [] });
    expect(stageGateNode(c)).toMatchObject({ shape: 'soft' });
  });
});

describe('enteredCurrentStageAt — the dwell anchor from the newest advance INTO the current stage', () => {
  it('returns the newest advance comment ts that moved the ticket TO its current stage (parsed from the body)', () => {
    const t = ticket({
      stage: 'code',
      comments: [
        { kind: 'advance', body: 'stage → vision', ts: '2026-06-01T00:00:00Z' },
        { kind: 'advance', body: 'stage → code', ts: '2026-06-05T00:00:00Z' },
        { kind: 'advance', body: 'stage → code', ts: '2026-06-10T00:00:00Z' },
        { kind: 'note', body: 'stage → code', ts: '2026-06-12T00:00:00Z' },
      ] as TicketComment[],
    });
    expect(enteredCurrentStageAt(t)).toBe('2026-06-10T00:00:00Z');
  });

  it('is null when no advance comment targets the current stage', () => {
    const t = ticket({
      stage: 'code',
      comments: [{ kind: 'advance', body: 'stage → vision', ts: '2026-06-01T00:00:00Z' }] as TicketComment[],
    });
    expect(enteredCurrentStageAt(t)).toBeNull();
  });

  it('is null when the ticket has no comments', () => {
    expect(enteredCurrentStageAt(ticket({ stage: 'code', comments: [] }))).toBeNull();
    expect(enteredCurrentStageAt(ticket({ stage: 'code', comments: undefined }))).toBeNull();
  });

  it('ignores non-advance comments that mention the current stage', () => {
    const t = ticket({
      stage: 'code',
      comments: [{ kind: 'note', body: 'stage → code', ts: '2026-06-10T00:00:00Z' }] as TicketComment[],
    });
    expect(enteredCurrentStageAt(t)).toBeNull();
  });
});

describe('dwellSince — the honest "stuck N" duration label (absent when unknown or below threshold)', () => {
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  it('is null for a null/unknown anchor (never a fabricated duration)', () => {
    expect(dwellSince(null, Date.now())).toBeNull();
    expect(dwellSince('not-a-date', Date.now())).toBeNull();
  });

  it('is null below the one-day stuck threshold (no fake urgency for fresh work)', () => {
    const now = Date.parse('2026-06-13T12:00:00Z');
    expect(dwellSince('2026-06-13T06:00:00Z', now)).toBeNull(); // 6h
  });

  it('labels whole days once past the threshold', () => {
    const now = Date.parse('2026-06-13T12:00:00Z');
    expect(dwellSince('2026-06-10T12:00:00Z', now)).toBe('3d');
    expect(dwellSince('2026-06-12T11:00:00Z', now)).toBe('1d');
  });

  it('is null for a future timestamp (clock skew is not "stuck")', () => {
    const now = Date.parse('2026-06-13T12:00:00Z');
    expect(dwellSince('2026-06-20T12:00:00Z', now)).toBeNull();
  });
});

describe('stageActivity — the merged, newest-first process log across a stage’s tickets', () => {
  it('is empty for a stage with no tickets', () => {
    expect(stageActivity(col({ stage: 'code', tickets: [] }))).toEqual([]);
  });

  it('merges every ticket’s comments newest-first, attributed to its ticket', () => {
    const c = col({
      stage: 'code',
      tickets: [
        ticket({ id: 'A', stage: 'code', comments: [
          { id: 'a1', author: '/be', kind: 'comment', body: 'older', ts: '2026-06-10T00:00:00Z' },
          { id: 'a2', author: '/rev', kind: 'gate', body: 'approved', ts: '2026-06-12T00:00:00Z' },
        ] }),
        ticket({ id: 'B', stage: 'code', comments: [
          { id: 'b1', author: '/be', kind: 'comment', body: 'middle', ts: '2026-06-11T00:00:00Z' },
        ] }),
      ],
    });
    const log = stageActivity(c);
    expect(log.map((e) => e.comment.id)).toEqual(['a2', 'b1', 'a1']);
    expect(log[0].ticketId).toBe('A');
    expect(log[1].ticketId).toBe('B');
  });

  it('caps at the 20 most-recent entries and flags truncation', () => {
    const comments: TicketComment[] = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`,
      author: '/be',
      kind: 'comment',
      body: `n${i}`,
      ts: `2026-06-${String(10 + (i % 20)).padStart(2, '0')}T00:00:${String(i).padStart(2, '0')}Z`,
    }));
    const c = col({ stage: 'code', tickets: [ticket({ id: 'A', stage: 'code', comments })] });
    expect(stageActivity(c).length).toBe(20);
    expect(stageActivity(c, 5).length).toBe(5);
  });

  it('omits a comment with no timestamp from being treated as newest (sorts last)', () => {
    const c = col({
      stage: 'code',
      tickets: [ticket({ id: 'A', stage: 'code', comments: [
        { id: 'noTs', author: '/be', kind: 'comment', body: 'no ts' },
        { id: 'has', author: '/be', kind: 'comment', body: 'has ts', ts: '2026-06-12T00:00:00Z' },
      ] })],
    });
    expect(stageActivity(c).map((e) => e.comment.id)).toEqual(['has', 'noTs']);
  });
});

describe('stageRoleLine — an honest one-liner for what happens at a stage (never invented)', () => {
  it('uses an explicit stage meaning verbatim when present', () => {
    const c = col({ stage: 'code' });
    const wf: WorkflowView = { activeTrack: 'full', stages: [{ stage: 'code', owner: '/be', gate: null, meaning: 'Implemented here.' } as never] };
    expect(stageRoleLine(c, wf)).toBe('Implemented here.');
  });

  it('derives from the governing gate when no meaning is given', () => {
    const c = col({ stage: 'security', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } });
    expect(stageRoleLine(c, null)).toMatch(/security/i);
    expect(stageRoleLine(c, null)).toMatch(/gates/i);
  });

  it('falls back to a neutral, non-fabricated line for an ungated stage with no meaning', () => {
    const c = col({ stage: 'code', gate: null });
    expect(stageRoleLine(c, null)).toBe('Work sits here until it advances to the next stage.');
  });
});
