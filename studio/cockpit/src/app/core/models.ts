/**
 * Wire types for the hub registry API. These mirror the shapes returned by the
 * zero-dependency Node hub (hub/lib/projects.js, registry.js, analyze.js) and are the
 * single source of truth the cockpit binds against.
 *
 * Security note: `title` and `description` originate from a project's README/manifest and are
 * therefore UNTRUSTED. They must only ever reach the DOM through Angular interpolation/binding,
 * which HTML-escapes by default. Never feed them to `[innerHTML]` or a DomSanitizer bypass.
 */

/** Lifecycle status the registry assigns to a connected project. */
export type ProjectStatus = 'connected' | 'analyzing' | 'needs-auth' | 'offline' | 'error';

/**
 * The compact per-project roll-up the LIST endpoint attaches to each record so the home view
 * needs no per-card fetch. Omitted entirely for a project whose state cannot be built — absent,
 * never a fabricated zero.
 */
export interface ListTaskSummary {
  readonly open: number;
  readonly needsYou: number;
}

/** A registry index entry — what `GET /api/projects` returns per project (no profile). */
export interface ProjectRecord {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly addedAt: string;
  readonly lastSeen: string;
  readonly status: ProjectStatus;
  /** Compact `{ open, needsYou }` roll-up; absent when the project's state was unreadable. */
  readonly taskSummary?: ListTaskSummary;
}

/**
 * The analysis profile derived from a project's artefacts. `title`/`description` are the
 * auto-collected, UNTRUSTED strings shown on the card and shell. When analysis fails the hub
 * returns a placeholder profile carrying only `error`, hence the optional fields.
 */
export interface ProjectProfile {
  readonly version?: number;
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly titleOverride?: string | null;
  readonly descriptionOverride?: string | null;
  readonly stack?: readonly string[];
  readonly keyFiles?: readonly string[];
  readonly source?: string;
  readonly analyzedAt?: string;
  readonly error?: string;
}

/** Per-status ticket counts the hub derives from the ledger. Buckets sum to `total`. */
export interface TaskStatusCounts {
  readonly in_progress: number;
  readonly waiting: number;
  readonly needsYou: number;
  readonly blocked: number;
  readonly done: number;
}

/** A status roll-up of a project's tickets — drives the card pulse and the global strip. */
export interface TaskSummary {
  readonly total: number;
  readonly byStatus: TaskStatusCounts;
}

/** A gate governing a workflow stage; `refusal` distinguishes a hard (blocking) gate from soft. */
export interface WorkflowGateRef {
  readonly name: string;
  readonly refusal: 'hard' | 'soft';
}

/** One stage of the active track, flattened render-ready (owner + governing gate, if any). */
export interface WorkflowStageView {
  readonly stage: string;
  readonly owner: string | null;
  readonly gate: WorkflowGateRef | null;
}

/** The active track flattened into ordered stages for the workflow panel. */
export interface WorkflowView {
  readonly activeTrack: string | null;
  readonly stages: readonly WorkflowStageView[];
}

/** One known knowledge-base document plus its index state. */
export interface BaseDoc {
  readonly name: string;
  readonly file?: string;
  readonly index?: string;
}

/** Knowledge-base facts for the project: how docs are indexed and how many. */
export interface BaseView {
  readonly method: string;
  readonly counts: { readonly indexed: number; readonly indexing: number; readonly failed: number };
  readonly docs?: readonly BaseDoc[];
}

/** A gate as it appears on a ticket: its definition plus current ledger state. */
export interface TicketGate {
  readonly name: string;
  readonly refusal?: 'hard' | 'soft';
  readonly state?: string;
  readonly [key: string]: unknown;
}

/** A ticket as the detail state exposes it (gates carry live ledger state). */
export interface TicketView {
  readonly id?: string;
  readonly status?: string;
  readonly stage?: string;
  readonly assignee?: string | null;
  readonly gates?: readonly TicketGate[];
  readonly [key: string]: unknown;
}

/** Workflow/board state for a project (read-model passthrough). */
export interface ProjectState {
  readonly project?: string;
  readonly preset?: string;
  readonly tickets?: readonly TicketView[];
  readonly taskSummary?: TaskSummary | null;
  readonly workflowView?: WorkflowView | null;
  readonly base?: BaseView | null;
  readonly [key: string]: unknown;
}

/** Envelope shared by every hub JSON response. */
export interface ApiEnvelope {
  readonly ok: boolean;
  readonly error?: string;
}

export interface ProjectListResponse extends ApiEnvelope {
  readonly projects?: readonly ProjectRecord[];
}

export interface ProjectDetailResponse extends ApiEnvelope {
  readonly project?: ProjectRecord;
  readonly profile?: ProjectProfile | null;
  readonly state?: ProjectState | null;
}

export interface ConnectResponse extends ApiEnvelope {
  readonly created?: boolean;
  readonly project?: ProjectRecord;
  readonly profile?: ProjectProfile | null;
  readonly state?: ProjectState | null;
}

/** A record joined with its profile/state — the cockpit's view-model for one project. */
export interface ProjectView {
  readonly record: ProjectRecord;
  readonly profile: ProjectProfile | null;
  readonly state: ProjectState | null;
}

/** The best human title for a project: explicit override wins, then profile title, then label. */
export function displayTitle(view: Pick<ProjectView, 'record' | 'profile'>): string {
  const override = view.profile?.titleOverride?.trim();
  if (override) return override;
  const title = view.profile?.title?.trim();
  if (title) return title;
  return view.record.label;
}

/** The best description: explicit override wins, then the auto-collected description. */
export function displayDescription(profile: ProjectProfile | null): string {
  const override = profile?.descriptionOverride?.trim();
  if (override) return override;
  return profile?.description?.trim() ?? '';
}

/** One folder row from `GET /api/fs/list`. Folders only; `name` is untrusted basename text. */
export interface FsEntry {
  readonly name: string;
  readonly type: 'dir';
  readonly hasProject: boolean;
}

/** Response of `GET /api/fs/list?path=…`: the listed folder, its parent, and its sub-folders. */
export interface FsListResponse extends ApiEnvelope {
  readonly path?: string;
  readonly parent?: string | null;
  readonly entries?: readonly FsEntry[];
  readonly truncated?: boolean;
}

/** A picker starting point (a root or a recent project), `label` for display, `path` to open. */
export interface FsPlace {
  readonly label: string;
  readonly path: string;
}

/** Response of `GET /api/fs/roots`: the navigation roots plus recently connected paths. */
export interface FsRootsResponse extends ApiEnvelope {
  readonly roots?: readonly FsPlace[];
  readonly recent?: readonly FsPlace[];
}

/** A listed directory normalised for the picker (path + parent + folder rows). */
export interface FsListing {
  readonly path: string;
  readonly parent: string | null;
  readonly entries: readonly FsEntry[];
  readonly truncated: boolean;
}

/**
 * The governance signal derived from a project's gate ledger for the at-a-glance badge.
 * `kind` is `null` when no gate fact is available — the badge is then absent, never a default
 * decoration. A currently-rejected hard gate wins (a visible "blocked" is honest); otherwise a
 * passed security gate earns the "Security-reviewed" badge.
 */
export interface GovernanceSignal {
  readonly kind: 'security-reviewed' | 'blocked';
  /** For `blocked`, the stage whose hard gate is currently rejected. */
  readonly stage?: string;
}

const SECURITY_GATE = 'SECOPS_APPROVED';

function gateStateIs(state: string | undefined, target: 'passed' | 'rejected'): boolean {
  return (state ?? '').toLowerCase() === target;
}

/**
 * Derive the governance badge from a project's detail state. Returns `null` when the state
 * carries no gate facts (absent-not-zero). A hard gate in `rejected` state surfaces a danger
 * "blocked at {stage}" signal; a passed `SECOPS_APPROVED` gate surfaces "Security-reviewed".
 */
export function governanceSignal(state: ProjectState | null): GovernanceSignal | null {
  const tickets = state?.tickets;
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  for (const ticket of tickets) {
    for (const gate of ticket.gates ?? []) {
      if (gate.refusal === 'hard' && gateStateIs(gate.state, 'rejected')) {
        return { kind: 'blocked', stage: ticket.stage ?? gate.name };
      }
    }
  }
  for (const ticket of tickets) {
    for (const gate of ticket.gates ?? []) {
      if (gate.name === SECURITY_GATE && gateStateIs(gate.state, 'passed')) {
        return { kind: 'security-reviewed' };
      }
    }
  }
  return null;
}
