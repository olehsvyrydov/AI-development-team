import { describe, expect, it } from 'vitest';
import type { GateDef, TicketGate, TicketView } from '../core/models';
import { gateRowsFor, gateStateView } from './gate-view';

describe('gateStateView', () => {
  it('maps passed/rejected/pending to a glyph + text + tone, never colour alone', () => {
    expect(gateStateView('passed')).toMatchObject({ text: 'passed', glyph: 'check', tone: 'success' });
    expect(gateStateView('rejected')).toMatchObject({ text: 'rejected', glyph: 'cross', tone: 'danger' });
    expect(gateStateView('pending')).toMatchObject({ text: 'pending', glyph: 'pending', tone: 'muted' });
    expect(gateStateView(undefined)).toMatchObject({ text: 'pending', glyph: 'pending' });
  });
});

describe('gateRowsFor', () => {
  const defs: readonly GateDef[] = [
    { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops' },
    { name: 'DESIGN_APPROVED', refusal: 'soft', owner: '/aura' },
  ];

  function ticket(gates: readonly TicketGate[], stage = 'security'): TicketView {
    return { id: 't', title: 't', stage, gates };
  }

  it('carries shape (hard=solid/soft=dashed) and the deciding owner/by + note + trigger', () => {
    const rows = gateRowsFor(
      ticket([
        { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed', by: '/arch', at: '2026-06-08T08:00:00Z' },
        { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected', owner: '/secops', note: 'fix it', trigger: ['x'] },
      ]),
      defs,
    );
    const arch = rows.find((r) => r.name === 'ARCH_APPROVED')!;
    expect(arch.shape).toBe('hard');
    expect(arch.state.text).toBe('passed');
    expect(arch.by).toBe('/arch');
    const sec = rows.find((r) => r.name === 'SECOPS_APPROVED')!;
    expect(sec.shape).toBe('hard');
    expect(sec.note).toBe('fix it');
    expect(sec.trigger).toEqual(['x']);
  });

  it('marks a gate decidable only when it governs the current stage and is not terminally decided', () => {
    const rows = gateRowsFor(
      ticket(
        [
          { name: 'SECOPS_APPROVED', refusal: 'hard', state: 'pending', owner: '/secops' },
          { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed', by: '/arch' },
        ],
        'security',
      ),
      defs,
    );
    const sec = rows.find((r) => r.name === 'SECOPS_APPROVED')!;
    expect(sec.decidable).toBe(true);
    const arch = rows.find((r) => r.name === 'ARCH_APPROVED')!;
    expect(arch.decidable).toBe(false);
  });

  it('treats a rejected governing gate as still decidable (it can be approved to unblock)', () => {
    const rows = gateRowsFor(
      ticket([{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected', owner: '/secops' }], 'security'),
      defs,
    );
    expect(rows.find((r) => r.name === 'SECOPS_APPROVED')!.decidable).toBe(true);
  });
});
