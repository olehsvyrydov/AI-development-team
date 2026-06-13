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
  /** Human description of the stage's job, when the workflow carries one. UNTRUSTED — escape on render. */
  readonly meaning?: string | null;
}

/** The active track flattened into ordered stages for the workflow panel. */
export interface WorkflowView {
  readonly activeTrack: string | null;
  readonly stages: readonly WorkflowStageView[];
}

/** Which vault a knowledge document lives in: only this project, or the shared common vault. */
export type KnowledgeScope = 'project' | 'common';

/**
 * One document in the merged Knowledge projection. `scope` is the authorization boundary the
 * holding vault decided (common = shared across the operator's own projects on this machine).
 * `name`, `stack` tags, `kind`, and any author field originate from project files / front-matter
 * and are UNTRUSTED — they reach the DOM through interpolation only (escaped), never `[innerHTML]`.
 */
export interface KnowledgeDoc {
  readonly name: string;
  readonly file?: string;
  readonly scope: KnowledgeScope;
  /** Closed-vocabulary stack tags (e.g. `java`, `python`, or `any`). UNTRUSTED — escape on render. */
  readonly stack?: readonly string[];
  /** Plain-language kind (`rule` / `style` / `pattern` / `context`). UNTRUSTED — escape on render. */
  readonly kind?: string;
  readonly status?: string;
  readonly index?: string;
  /**
   * The note's per-file compare-and-swap token (the holding file's `mtime:size`). It is the
   * `expectedRev` an edit/remove forwards so a concurrent change is detected (a stale value →
   * 409/`conflict`, never a clobber). Absent only when the file's stat could not be read.
   */
  readonly rev?: string;
  /**
   * Who authored the note, as a closed enum the row badges (glyph + text, never colour alone):
   * `you` (operator-authored) · `kai` (approved out of the `/kai` propose-inbox) · `codebase` (a
   * connected-codebase item). Absent → the badge is omitted (never a fabricated author).
   */
  readonly provenance?: 'you' | 'kai' | 'codebase';
  /** A short, server-capped body excerpt for the 2-line row preview. UNTRUSTED — escape on render. */
  readonly excerpt?: string;
}

/**
 * One connected external codebase registered as a read-only, realpath-contained knowledge source.
 * It is a SEPARATE projection facet — never an authored note, never merged into vault scope. The
 * page reads it to render the connected-sources strip (label · path · status · honest index method ·
 * freshness · re-index · disconnect). `external` drives the cloud-vs-folder distinction and the
 * future egress disclosure (a codebase source is `external:false`; an overlay source would be
 * `external:true`), keeping the disclosure data-driven so it cannot drift.
 *
 * Security: `label`, `path`, and `residency` originate from the filesystem / config and are
 * UNTRUSTED — they reach the DOM through interpolation only (escaped), never `[innerHTML]`.
 */
export interface KbSource {
  readonly id: string;
  /** Folder basename for display. UNTRUSTED — escape on render. */
  readonly label: string;
  /** The canonical realpath of the connected folder. UNTRUSTED — escape on render. */
  readonly path: string;
  readonly kind: 'codebase' | 'overlay' | string;
  /** Index lifecycle: `indexing` while a connect/reindex runs, then `indexed`, or `failed`. */
  readonly status: 'connected' | 'indexing' | 'indexed' | 'failed' | string;
  readonly fileCount?: number;
  /** Honest index method (`filename` / `semantic`) — never claims semantic without a real embedder. */
  readonly method?: string;
  readonly lastIndexedAt?: string | null;
  /** When the source's files changed after the last index — drives a "stale — re-index" marker. */
  readonly stale?: boolean;
  /** A failed index's terse reason. UNTRUSTED — escape on render. */
  readonly reason?: string;
  /** Residency tier of a (future) external overlay source. UNTRUSTED — escape on render. */
  readonly residency?: string;
  /** `false` for a local codebase source; `true` for a (future) external overlay source. */
  readonly external?: boolean;
}

/**
 * One pending `/kai` proposal in the inbox — model-authored, UNTRUSTED knowledge awaiting an
 * explicit human approve. It lives in a store the recall path never reads, so it is inert until
 * approved: nothing here is recallable knowledge yet. Every field originates from the model and
 * reaches the DOM through interpolation only (escaped), never `[innerHTML]`. `suggestedScope` is
 * the scope `/kai` proposes; the operator stays free to approve it into either vault. The approve
 * scope sent to the server is a fixed enum (`project` | `common`), never derived from a free path.
 */
export interface KnowledgeProposal {
  readonly id: string;
  /** Short label `/kai` gave the proposal. UNTRUSTED — escape on render. */
  readonly title?: string;
  /** The proposed knowledge body. UNTRUSTED model output — escape on render. */
  readonly content: string;
  /** The vault `/kai` suggests; a hint, not the authorization — the operator chooses on approve. */
  readonly suggestedScope?: KnowledgeScope;
  /** Suggested stack tags. UNTRUSTED — escape on render. */
  readonly suggestedStack?: readonly string[];
  /** Suggested kind classifier. UNTRUSTED — escape on render. */
  readonly suggestedKind?: string;
  /** Where `/kai` saw this (e.g. an agent or skill). UNTRUSTED — escape on render. */
  readonly source?: string;
  /** Why `/kai` proposes it — the recurrence evidence. UNTRUSTED — escape on render. */
  readonly why?: string;
  readonly proposedAt?: string;
}

/**
 * The merged Knowledge projection a project sees: its own project-scoped notes unioned with the
 * approved common notes whose stack matches the project's. `counts` reports how many of each scope
 * are visible plus how many `/kai` proposals are pending (absent-not-zero is the panel's job, never
 * the wire's). `method` stays honest — `filename-only` unless a real embedder is configured, never
 * claimed for scope/tags alone. `proposals` is the `/kai` inbox: pending-only, inert until approved.
 */
export interface KnowledgeView {
  readonly method: string;
  /** The project's declared stack, the allowed-set the add form offers as tags. */
  readonly stack?: readonly string[];
  readonly counts: { readonly project: number; readonly common: number; readonly proposals?: number };
  readonly docs?: readonly KnowledgeDoc[];
  /** The `/kai` propose inbox: pending proposals only, inert until an explicit human approve. */
  readonly proposals?: readonly KnowledgeProposal[];
  /**
   * The connected external-codebase sources (a separate read-only facet, never merged into `docs`).
   * Absent/empty until a codebase is connected — the strip then shows one quiet invite line.
   */
  readonly sources?: readonly KbSource[];
  /**
   * The compare-and-swap token for the connected-sources facet — the rev a source mutation
   * (connect / reindex / disconnect) forwards as `expectedRev` so a concurrent sources change is
   * detected (a stale value → 409/`conflict`, never a clobber). It is DISTINCT from the project's
   * workflow-state `rev`: the server CASes source mutations against this token, not the state hash.
   * Absent until a sources facet exists.
   */
  readonly sourcesRev?: string;
  /**
   * Whether an external memory overlay is configured + enabled + healthy. The Source toggle and any
   * overlay source row appear ONLY when true (absent otherwise — never a disabled tease). Expected
   * `false`/absent in this slice (no overlay control ships); the field is the seam, not a feature.
   */
  readonly overlayPresent?: boolean;
}

/**
 * How the Q&A grounded an interpretation-check answer — shown to the operator VERBATIM so the
 * confidence claim can never be stronger than the evidence. `method` names the tier that answered
 * (`overlay` external · `semantic` local index · `filename-only` keyword · `none` honest absence),
 * `external` is true only when an external overlay produced the answer, and `residency` (overlay
 * only) names whether the query stayed on the user's network or left it. `label` is the honest
 * sentence the backend wrote; the UI renders it as-is and never paraphrases a stronger assurance.
 * Every field originates from the backend (and, for an overlay, from an external service) and is
 * UNTRUSTED — it reaches the DOM through interpolation only (escaped), never `[innerHTML]`.
 */
export interface KnowledgeGrounding {
  readonly method: 'overlay' | 'semantic' | 'filename-only' | 'none' | string;
  readonly source: string;
  readonly external: boolean;
  /** Residency tier of an overlay answer (e.g. `local-service` / `cloud`); absent for local tiers. */
  readonly residency?: string;
  /** The honest grounding sentence from the backend, rendered verbatim. UNTRUSTED — escape on render. */
  readonly label: string;
}

/**
 * One note the Q&A matched for the asked topic. `name`/`snippet` come from project files or, for an
 * overlay answer, from the external service, and are UNTRUSTED — they reach the DOM through
 * interpolation only (escaped), never `[innerHTML]`. `scope` is `overlay` for an external match.
 */
export interface KnowledgeMatch {
  readonly name?: string;
  readonly scope?: KnowledgeScope | 'overlay' | string;
  readonly stack?: readonly string[];
  readonly kind?: string;
  readonly score?: number;
  /** A short body excerpt for display. UNTRUSTED — escape on render. */
  readonly snippet?: string;
}

/**
 * The answer to an interpretation-check question — what the project actually holds for the topic,
 * scoped exactly as the Knowledge panel is, with an HONEST grounding label and a TRUTHFUL egress
 * flag. `egressDisclosed` is true IFF an external overlay was queried; it is the sole driver of the
 * UI's "queried an external service" indicator, so the disclosure cannot drift from what happened.
 * `answer`, `matches`, and `grounding.label` are UNTRUSTED text (the matched notes, and any overlay
 * response) — they reach the DOM through interpolation only (escaped), never `[innerHTML]`.
 */
export interface KnowledgeAnswer {
  readonly answer: string;
  readonly matches: readonly KnowledgeMatch[];
  readonly grounding: KnowledgeGrounding;
  /** True only when an external overlay was queried; drives the truthful egress indicator. */
  readonly egressDisclosed: boolean;
}

/** A gate as it appears on a ticket: its definition plus current ledger state. */
export interface TicketGate {
  readonly name: string;
  readonly refusal?: 'hard' | 'soft';
  readonly state?: string;
  /** Role that owns the gate decision; from gate defs / overlay. UNTRUSTED — escape on render. */
  readonly owner?: string | null;
  /** Role that recorded the current state, when decided. UNTRUSTED — escape on render. */
  readonly by?: string | null;
  /** ISO timestamp of the current state's decision, when decided. */
  readonly at?: string | null;
  /** Deciding rationale carried on the gate. UNTRUSTED — escape on render. */
  readonly note?: string | null;
  /** Trigger labels that arm the gate. Each entry is UNTRUSTED — escape on render. */
  readonly trigger?: readonly string[];
  readonly [key: string]: unknown;
}

/**
 * One entry in a ticket's append-only comment log. `author`, `body`, `gate` and `kind` are all
 * UNTRUSTED — they originate from agents / the operator and reach the DOM through interpolation
 * only (escaped). `body` is server-capped at 8 KB.
 */
export interface TicketComment {
  readonly id?: string;
  readonly ticket?: string;
  readonly ts?: string;
  readonly author?: string;
  readonly kind?: string;
  readonly body?: string;
  readonly gate?: string;
  readonly state?: string;
}

/** A ticket as the board/detail expose it (gates carry live ledger state; comments are the log). */
export interface TicketView {
  readonly id?: string;
  /** Human title. UNTRUSTED README/ledger text — escape on render. */
  readonly title?: string;
  readonly status?: string;
  readonly stage?: string;
  readonly track?: string | null;
  readonly assignee?: string | null;
  /** Role the workflow expects to act at this stage when unassigned. */
  readonly expectedOwner?: string | null;
  /** Whether a live agent is currently acting on this ticket (heartbeat). Absent → not live. */
  readonly active?: boolean;
  readonly gates?: readonly TicketGate[];
  readonly comments?: readonly TicketComment[];
  /** Free-form description. UNTRUSTED — escape on render. */
  readonly description?: string;
  /** Labels currently set on this ticket. Each entry is UNTRUSTED — escape on render. */
  readonly labels?: readonly string[];
  readonly [key: string]: unknown;
}

/**
 * The published contract for one label: who may set it and where it routes. This is the single
 * source of truth the engine enforces and the editor mirrors — the Set-label picker is filtered to
 * `settableBy`, and a routing chip shows `routesTo`. `name`/`meaning`/`owner`/`routesTo` are
 * UNTRUSTED overlay text — escape on render.
 */
export interface LabelDef {
  readonly name: string;
  /** Agents allowed to set this label (`"*"` = any). The editor filters the Set-label picker to this. */
  readonly settableBy: readonly string[];
  /** Stage this label routes a ticket to, if any. */
  readonly routesTo?: string | null;
  /** Agent that owns the routed-to work, if any. */
  readonly owner?: string | null;
  /** Human-readable purpose of the label. */
  readonly meaning?: string | null;
}

/** One predicate of a rule's `when`. AND-of-predicates within a rule; an empty `when` means "always". */
export interface RuleCondition {
  /** The discriminating predicate kind chosen in the WHEN-selector. */
  readonly type: 'label' | 'pattern' | 'event';
  /** A ticket-carried label name (type `label`). UNTRUSTED — escape on render. */
  readonly label?: string;
  /** A match pattern (type `pattern`), rendered escaped inside `/…/`. UNTRUSTED. */
  readonly pattern?: string;
  /** Where the pattern matches: comment (default), title, or description. */
  readonly in?: 'comment' | 'title' | 'description';
  /** A closed-enum event name (type `event`). */
  readonly event?: string;
  /** Qualifier for gate.* events: the gate name. */
  readonly gate?: string;
  /** Qualifier for stage.* events: the stage name. */
  readonly stage?: string;
}

/** One action of a rule's ordered `do`. The discriminating `action` chooses which fields apply. */
export interface RuleAction {
  readonly action: 'route_to_stage' | 'set_label' | 'clear_label' | 'instruct' | 'fan_out';
  /** Target stage (action `route_to_stage`). UNTRUSTED — escape on render. */
  readonly stage?: string;
  /** Target stages (action `fan_out`, schema-only). */
  readonly stages?: readonly string[];
  /** Label name (action `set_label` / `clear_label`). UNTRUSTED — escape on render. */
  readonly label?: string;
  /** Target agents (action `instruct`). UNTRUSTED — escape on render. */
  readonly target?: readonly string[];
  /** Directive prompt text (action `instruct`). UNTRUSTED model-authored text — escape on render. */
  readonly prompt?: string;
}

/**
 * One `when → do` rule attached to a stage (or its gate). All free-text fields are UNTRUSTED overlay
 * content and reach the DOM through interpolation only. The editor reads this shape and writes the
 * full rule list back through the guarded overlay CAS (`workflow/set-rules`); the server re-validates
 * and is the authority.
 */
export interface RuleView {
  /** Stable id — the dedup/audit key. UNTRUSTED — escape on render. */
  readonly id: string;
  /** The stage this rule is attached to (for grouping under a builder row). */
  readonly stage?: string | null;
  /** AND-of-predicates; empty/absent means "when this stage runs". */
  readonly when?: readonly RuleCondition[];
  /** Ordered actions. */
  readonly do: readonly RuleAction[];
  /** Cross-rule chain: ids evaluated in the same tick iff this fired. */
  readonly then?: readonly string[];
}

/**
 * The label contract as the hub serialises it: an object keyed by label name, each value an
 * engine-shaped definition with snake_case `settable_by` / `routes_to`. {@link normalizeLabels}
 * converts this (or an already-normalised {@link LabelDef} array) into the editor's array shape.
 */
type RawLabelDef = {
  readonly settable_by?: readonly string[];
  readonly settableBy?: readonly string[];
  readonly routes_to?: string | null;
  readonly routesTo?: string | null;
  readonly owner?: string | null;
  readonly meaning?: string | null;
};

/**
 * The hub's published label contract is an object keyed by name (`{ NAME: { settable_by, … } }`)
 * with snake_case fields; the editor consumes a {@link LabelDef} array with camelCase fields. This
 * adapts either shape into the array the rule editor binds against, tolerating a value that is
 * already normalised so a re-render of adopted state is idempotent. A non-array `settable_by`
 * yields an empty allowlist (the label is then settable by no one) rather than throwing.
 */
export function normalizeLabels(raw: unknown): LabelDef[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((l): l is LabelDef => !!l && typeof (l as LabelDef).name === 'string')
      .map((l) => ({ ...l, settableBy: Array.isArray(l.settableBy) ? l.settableBy : [] }));
  }
  if (!raw || typeof raw !== 'object') return [];
  const out: LabelDef[] = [];
  for (const [name, def] of Object.entries(raw as Record<string, RawLabelDef>)) {
    if (!def || typeof def !== 'object') continue;
    const settableBy = def.settableBy ?? def.settable_by;
    out.push({
      name,
      settableBy: Array.isArray(settableBy) ? settableBy : [],
      routesTo: def.routesTo ?? def.routes_to ?? null,
      owner: def.owner ?? null,
      meaning: def.meaning ?? null,
    });
  }
  return out;
}

/** The engine's `when` predicate object: AND-of-keys, a single object (not the editor's array). */
type RawWhen = {
  readonly type?: RuleCondition['type'];
  readonly label?: string;
  readonly pattern?: string;
  readonly in?: RuleCondition['in'];
  readonly event?: string;
  readonly gate?: string;
  readonly stage?: string;
};

/** Split the engine's single `when` object into the editor's array of typed predicates. */
function normalizeWhen(when: unknown): RuleCondition[] {
  if (Array.isArray(when)) {
    return when.filter((c): c is RuleCondition => !!c && typeof (c as RuleCondition).type === 'string');
  }
  if (!when || typeof when !== 'object') return [];
  const w = when as RawWhen;
  const out: RuleCondition[] = [];
  if (typeof w.label === 'string') out.push({ type: 'label', label: w.label });
  if (typeof w.pattern === 'string') out.push({ type: 'pattern', pattern: w.pattern, in: w.in });
  if (typeof w.event === 'string') out.push({ type: 'event', event: w.event, gate: w.gate, stage: w.stage });
  return out;
}

/** Convert one engine verb-keyed action (`{ route_to_stage: "x" }`) into a typed {@link RuleAction}. */
function normalizeAction(raw: unknown): RuleAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a['action'] === 'string') return a as unknown as RuleAction;
  const verb = Object.keys(a)[0];
  const value = a[verb];
  switch (verb) {
    case 'route_to_stage':
      return { action: 'route_to_stage', stage: typeof value === 'string' ? value : undefined };
    case 'set_label':
      return { action: 'set_label', label: typeof value === 'string' ? value : undefined };
    case 'clear_label':
      return { action: 'clear_label', label: typeof value === 'string' ? value : undefined };
    case 'fan_out':
      return { action: 'fan_out', stages: Array.isArray(value) ? (value as string[]) : [] };
    case 'instruct': {
      const v = (value ?? {}) as { target?: string | readonly string[]; prompt?: string };
      const target = Array.isArray(v.target) ? v.target : v.target != null ? [v.target] : [];
      return { action: 'instruct', target, prompt: typeof v.prompt === 'string' ? v.prompt : '' };
    }
    default:
      return null;
  }
}

/**
 * Adapt the hub's rule list into the editor's {@link RuleView} shape: the engine serialises a rule's
 * `when` as a single AND-of-keys object and its `do` as verb-keyed actions (`{ route_to_stage: … }`),
 * whereas the editor binds `when` as an array of typed predicates and `do` as `{ action, … }`. A rule
 * already in editor shape passes through unchanged so adopting a freshly-saved state is idempotent.
 * The cockpit-only `stage` grouping key is preserved (the hub round-trips unknown keys).
 */
export function normalizeRules(raw: unknown): RuleView[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleView[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object' || typeof (r as RuleView).id !== 'string') continue;
    const rule = r as { id: string; stage?: string | null; when?: unknown; do?: unknown; then?: readonly string[] };
    out.push({
      id: rule.id,
      stage: rule.stage ?? null,
      when: normalizeWhen(rule.when),
      do: Array.isArray(rule.do) ? rule.do.map(normalizeAction).filter((a): a is RuleAction => a !== null) : [],
      then: rule.then,
    });
  }
  return out;
}

/** Fold the editor's typed predicate array back into the engine's single `when` object. */
function denormalizeWhen(when: readonly RuleCondition[] | undefined): Record<string, unknown> | undefined {
  if (!when || when.length === 0) return undefined;
  const out: Record<string, unknown> = {};
  for (const c of when) {
    if (c.type === 'label' && c.label) out['label'] = c.label;
    else if (c.type === 'pattern' && c.pattern) {
      out['pattern'] = c.pattern;
      if (c.in) out['in'] = c.in;
    } else if (c.type === 'event' && c.event) {
      out['event'] = c.event;
      if (c.gate) out['gate'] = c.gate;
      if (c.stage) out['stage'] = c.stage;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** Convert one typed {@link RuleAction} into the engine's single-verb action object. */
function denormalizeAction(a: RuleAction): Record<string, unknown> {
  switch (a.action) {
    case 'route_to_stage':
      return { route_to_stage: a.stage ?? '' };
    case 'set_label':
      return { set_label: a.label ?? '' };
    case 'clear_label':
      return { clear_label: a.label ?? '' };
    case 'fan_out':
      return { fan_out: [...(a.stages ?? [])] };
    case 'instruct':
      return { instruct: { target: [...(a.target ?? [])], prompt: a.prompt ?? '' } };
    default:
      return {};
  }
}

/**
 * Convert the editor's {@link RuleView} list into the engine's wire grammar for `workflow/set-rules`:
 * a single `when` object and verb-keyed `do` actions. The cockpit-only `stage` grouping key is kept
 * so the rule re-associates to its builder row when the saved state is read back. The server
 * re-validates the result and is the authority.
 */
export function denormalizeRules(rules: readonly RuleView[]): Record<string, unknown>[] {
  return rules.map((r) => {
    const out: Record<string, unknown> = { id: r.id, do: r.do.map(denormalizeAction) };
    if (r.stage) out['stage'] = r.stage;
    const when = denormalizeWhen(r.when);
    if (when) out['when'] = when;
    if (r.then) out['then'] = r.then;
    return out;
  });
}

/** A workflow gate definition (name + hard/soft + owner + arming triggers). */
export interface GateDef {
  readonly name: string;
  readonly refusal?: 'hard' | 'soft';
  readonly owner?: string | null;
  readonly trigger?: readonly string[];
  readonly required?: boolean;
  readonly [key: string]: unknown;
}

/** Workflow/board state for a project (read-model passthrough). */
export interface ProjectState {
  readonly project?: string;
  readonly preset?: string;
  readonly tickets?: readonly TicketView[];
  readonly taskSummary?: TaskSummary | null;
  readonly workflowView?: WorkflowView | null;
  /** The merged Knowledge projection (project + matching common). The panel's source of truth. */
  readonly knowledge?: KnowledgeView | null;
  readonly gateDefs?: readonly GateDef[];
  /** Track name → ordered stage list. Drives "advance to next stage". */
  readonly tracks?: Readonly<Record<string, readonly string[]>>;
  /** The `when → do` rules the engine evaluates, as the editor reads + authors them. */
  readonly rules?: readonly RuleView[];
  /** The published label contract: name → settable_by / routes_to / owner / meaning. */
  readonly labels?: readonly LabelDef[];
  /** Opaque optimistic-concurrency token round-tripped unchanged on every mutation. */
  readonly rev?: string;
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
