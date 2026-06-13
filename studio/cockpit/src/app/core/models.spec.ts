import { describe, expect, it } from 'vitest';
import {
  denormalizeRules,
  deriveFreshness,
  formatRelativeMs,
  governanceSignal,
  normalizeLabels,
  normalizeRules,
  type ProjectState,
  type RuleView,
} from './models';

function state(tickets: ProjectState['tickets']): ProjectState {
  return { tickets };
}

describe('governanceSignal', () => {
  it('is absent when there are no tickets / no gate facts (absent-not-zero)', () => {
    expect(governanceSignal(null)).toBeNull();
    expect(governanceSignal(state([]))).toBeNull();
    expect(governanceSignal(state([{ stage: 'security', gates: [] }]))).toBeNull();
  });

  it('surfaces "security-reviewed" when SECOPS_APPROVED has passed', () => {
    const sig = governanceSignal(
      state([{ stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] }]),
    );
    expect(sig).toEqual({ kind: 'security-reviewed' });
  });

  it('does NOT surface the badge when the security gate is merely pending', () => {
    const sig = governanceSignal(
      state([{ stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'pending' }] }]),
    );
    expect(sig).toBeNull();
  });

  it('surfaces "blocked at {stage}" when a hard gate is currently rejected (and it wins over a pass)', () => {
    const sig = governanceSignal(
      state([
        { stage: 'security', gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'passed' }] },
        { stage: 'code review', gates: [{ name: 'CODE_REVIEWED', refusal: 'hard', state: 'rejected' }] },
      ]),
    );
    expect(sig).toEqual({ kind: 'blocked', stage: 'code review' });
  });

  it('ignores a rejected SOFT gate (only hard gates block)', () => {
    const sig = governanceSignal(
      state([{ stage: 'design', gates: [{ name: 'DESIGN_APPROVED', refusal: 'soft', state: 'rejected' }] }]),
    );
    expect(sig).toBeNull();
  });
});

describe('normalizeLabels', () => {
  it('adapts the hub object contract (snake_case, keyed by name) into a LabelDef array', () => {
    const raw = {
      TO_DEV_BE: { settable_by: ['/rev', '/qa'], routes_to: 'implement', owner: '/be', meaning: 'back to be' },
    };
    expect(normalizeLabels(raw)).toEqual([
      { name: 'TO_DEV_BE', settableBy: ['/rev', '/qa'], routesTo: 'implement', owner: '/be', meaning: 'back to be' },
    ]);
  });

  it('passes an already-normalised array through (idempotent on adopted state)', () => {
    const arr = [{ name: 'X', settableBy: ['*'], routesTo: null, owner: null, meaning: null }];
    expect(normalizeLabels(arr)).toEqual(arr);
  });

  it('returns an empty allowlist (never throws) for a malformed settable_by', () => {
    expect(normalizeLabels({ X: { settable_by: 'nope' as unknown as string[] } })).toEqual([
      { name: 'X', settableBy: [], routesTo: null, owner: null, meaning: null },
    ]);
  });

  it('returns [] for null / non-object input', () => {
    expect(normalizeLabels(null)).toEqual([]);
    expect(normalizeLabels(undefined)).toEqual([]);
  });
});

describe('normalizeRules', () => {
  it('splits the engine single-object `when` into the editor predicate array', () => {
    const raw = [{ id: 'r', stage: 'code_review', when: { event: 'label.set', label: 'X' }, do: [{ route_to_stage: 'implement' }] }];
    const [rule] = normalizeRules(raw);
    expect(rule.when).toEqual([
      { type: 'label', label: 'X' },
      { type: 'event', event: 'label.set', gate: undefined, stage: undefined },
    ]);
    expect(rule.do).toEqual([{ action: 'route_to_stage', stage: 'implement' }]);
    expect(rule.stage).toBe('code_review');
  });

  it('maps every verb-keyed action to its typed form, including instruct target/prompt', () => {
    const raw = [
      {
        id: 'r',
        do: [
          { set_label: 'A' },
          { clear_label: 'B' },
          { instruct: { target: '/be', prompt: 'do it' } },
          { fan_out: ['s1', 's2'] },
        ],
      },
    ];
    expect(normalizeRules(raw)[0].do).toEqual([
      { action: 'set_label', label: 'A' },
      { action: 'clear_label', label: 'B' },
      { action: 'instruct', target: ['/be'], prompt: 'do it' },
      { action: 'fan_out', stages: ['s1', 's2'] },
    ]);
  });

  it('returns [] for a non-array input', () => {
    expect(normalizeRules({} as unknown)).toEqual([]);
  });
});

describe('denormalizeRules', () => {
  it('folds the editor shape back into the engine wire grammar (object when, verb-keyed do)', () => {
    const rules: RuleView[] = [
      {
        id: 'r',
        stage: 'code_review',
        when: [
          { type: 'label', label: 'X' },
          { type: 'event', event: 'label.set' },
        ],
        do: [
          { action: 'route_to_stage', stage: 'implement' },
          { action: 'instruct', target: ['/be'], prompt: 'go' },
        ],
      },
    ];
    expect(denormalizeRules(rules)).toEqual([
      {
        id: 'r',
        stage: 'code_review',
        when: { label: 'X', event: 'label.set' },
        do: [{ route_to_stage: 'implement' }, { instruct: { target: ['/be'], prompt: 'go' } }],
      },
    ]);
  });

  it('omits an empty `when` so a rule with no condition is "always"', () => {
    const [wire] = denormalizeRules([{ id: 'r', when: [], do: [{ action: 'route_to_stage', stage: 's' }] }]);
    expect('when' in wire).toBe(false);
  });

  it('round-trips a hub rule through normalize → denormalize back to the wire shape', () => {
    const wire = { id: 'r', stage: 'code_review', when: { event: 'comment.added' }, do: [{ set_label: 'X' }] };
    expect(denormalizeRules(normalizeRules([wire]))).toEqual([wire]);
  });
});

describe('deriveFreshness', () => {
  const now = 1_000_000_000_000;
  const entry = (over: Partial<import('./models').RollupProjectEntry> = {}) => ({
    id: 'a', label: 'a', status: 'connected', open: 0, needsYou: 0,
    stateChangedAt: now, live: true, ...over,
  });

  it('reads live for a state change within the active window', () => {
    expect(deriveFreshness(entry({ stateChangedAt: now - 5_000 }), now, true)).toBe('live');
  });

  it('reads idle once the active window has lapsed but before the stale threshold', () => {
    expect(deriveFreshness(entry({ stateChangedAt: now - 4 * 60_000 }), now, true)).toBe('idle');
  });

  it('reads stale past the stale threshold (the number on screen may lag)', () => {
    expect(deriveFreshness(entry({ stateChangedAt: now - 14 * 60_000 }), now, true)).toBe('stale');
  });

  it('lets a bad registry status take precedence over timing', () => {
    expect(deriveFreshness(entry({ status: 'offline', stateChangedAt: now }), now, true)).toBe('offline');
    expect(deriveFreshness(entry({ status: 'error', stateChangedAt: now }), now, true)).toBe('offline');
    expect(deriveFreshness(entry({ status: 'needs-auth', stateChangedAt: now }), now, true)).toBe('offline');
  });

  it('reads offline when the channel is closed regardless of timing', () => {
    expect(deriveFreshness(entry({ stateChangedAt: now }), now, false)).toBe('offline');
  });

  it('degrades to live/offline only when stateChangedAt is null — never a fabricated stale/idle', () => {
    expect(deriveFreshness(entry({ stateChangedAt: null, live: true }), now, true)).toBe('live');
    expect(deriveFreshness(entry({ stateChangedAt: null, live: false }), now, true)).toBe('offline');
  });

  it('is offline for an absent entry', () => {
    expect(deriveFreshness(null, now, true)).toBe('offline');
  });
});

describe('formatRelativeMs', () => {
  const now = 1_000_000_000_000;
  it('omits the age (empty string) for a null/NaN instant — never a fabricated 0', () => {
    expect(formatRelativeMs(null, now)).toBe('');
    expect(formatRelativeMs(NaN, now)).toBe('');
  });
  it('renders coarse relative strings', () => {
    expect(formatRelativeMs(now - 10_000, now)).toBe('just now');
    expect(formatRelativeMs(now - 4 * 60_000, now)).toBe('4m ago');
    expect(formatRelativeMs(now - 3 * 3_600_000, now)).toBe('3h ago');
  });
});
