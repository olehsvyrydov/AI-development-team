import type { GateDef, TicketGate, TicketView } from '../core/models';

/**
 * Stage token → governing gate name. Mirrors the hub's canonical stage map so the detail view can
 * tell which gate (if any) governs a ticket's CURRENT stage and is therefore decidable here.
 */
const STAGE_GATE: Readonly<Record<string, string>> = {
  architecture: 'ARCH_APPROVED',
  security: 'SECOPS_APPROVED',
  design: 'DESIGN_APPROVED',
  design_qa: 'DESIGN_APPROVED',
  approval_gate: 'APPROVAL_GATE',
  code_review: 'CODE_REVIEWED',
  reliability: 'RELIABILITY_OK',
  verify: 'VERIFIED',
  perf: 'PERF_OK',
};

/** A gate's current state rendered as glyph + text + tone — colour is never the only signal. */
export interface GateStateView {
  readonly text: 'passed' | 'rejected' | 'pending';
  readonly glyph: 'check' | 'cross' | 'pending';
  readonly tone: 'success' | 'danger' | 'muted';
}

/** Map a raw gate state to its render-ready glyph/text/tone (anything unknown reads as pending). */
export function gateStateView(state: string | undefined): GateStateView {
  switch ((state ?? '').toLowerCase()) {
    case 'passed':
      return { text: 'passed', glyph: 'check', tone: 'success' };
    case 'rejected':
      return { text: 'rejected', glyph: 'cross', tone: 'danger' };
    default:
      return { text: 'pending', glyph: 'pending', tone: 'muted' };
  }
}

/** A render-ready gate row for the detail view: identity, shape, state, provenance, decidability. */
export interface GateRowView {
  readonly name: string;
  readonly shape: 'hard' | 'soft';
  readonly state: GateStateView;
  readonly owner: string | null;
  readonly by: string | null;
  readonly at: string | null;
  readonly note: string | null;
  readonly trigger: readonly string[];
  /** True when this gate governs the ticket's current stage and an operator decision applies. */
  readonly decidable: boolean;
}

function governingGate(stage: string | undefined): string | null {
  return STAGE_GATE[String(stage ?? '').toLowerCase()] ?? null;
}

/**
 * Build the gate rows for a ticket, joining each on-ticket gate with its definition for the shape
 * and owner. A gate is `decidable` only when it governs the ticket's current stage — a passed
 * gate at the current stage stays decidable (it can be revisited), but gates from other stages are
 * read-only here.
 */
export function gateRowsFor(ticket: TicketView, defs: readonly GateDef[]): readonly GateRowView[] {
  const governing = governingGate(ticket.stage);
  const defByName = new Map(defs.map((d) => [d.name, d]));
  return (ticket.gates ?? []).map((gate: TicketGate) => {
    const def = defByName.get(gate.name);
    const shape: 'hard' | 'soft' = (gate.refusal ?? def?.refusal) === 'soft' ? 'soft' : 'hard';
    return {
      name: gate.name,
      shape,
      state: gateStateView(gate.state),
      owner: gate.owner ?? def?.owner ?? null,
      by: gate.by ?? null,
      at: gate.at ?? null,
      note: gate.note ?? null,
      trigger: gate.trigger ?? def?.trigger ?? [],
      decidable: gate.name === governing,
    };
  });
}
