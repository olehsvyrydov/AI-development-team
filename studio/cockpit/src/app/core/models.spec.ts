import { describe, expect, it } from 'vitest';
import { governanceSignal, type ProjectState } from './models';

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
