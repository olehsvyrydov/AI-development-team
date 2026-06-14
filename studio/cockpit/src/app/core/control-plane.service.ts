import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type {
  KbSource,
  KnowledgeAnswer,
  KnowledgeDoc,
  KnowledgeScope,
  KnowledgeSearchOutcome,
  KnowledgeSearchResult,
  ProjectState,
} from './models';

/**
 * The outcome of a control-plane mutation. The hub answers every guarded mutation with one of
 * three shapes, and a conflict is a first-class state — NOT an error — so callers can adopt the
 * fresh server `state` and let the operator retry rather than overwrite:
 * - `ok: true` — applied; `state` is the fresh read-model (carries the new `rev`).
 * - `ok: 'conflict'` — the `expectedRev` was stale (HTTP 409); `state` is current server truth.
 * - `ok: false` — any other failure (guard 403, validation 400, network); `error` is terse.
 */
export type MutationResult =
  | { readonly ok: true; readonly state: ProjectState | null }
  | { readonly ok: 'conflict'; readonly state: ProjectState | null }
  | { readonly ok: false; readonly error: string };

/**
 * The outcome of adding a knowledge-base note. On success the hub returns the fresh `state` (whose
 * knowledge projection already carries the new doc + incremented count) AND the `doc` it actually
 * wrote — the server derives the filename from the title, so on a duplicate it reports the unique
 * name it chose (e.g. `code-rules-2`) and the UI names what was really created rather than asked.
 */
export type KbAddResult =
  | { readonly ok: true; readonly state: ProjectState | null; readonly doc: KnowledgeDoc | null }
  | { readonly ok: false; readonly error: string };

/**
 * Body for `kb/add`. The client supplies a title, a markdown body, and the note's classifying
 * metadata — `scope` (a fixed enum the server validates and uses to pick the vault), and optional
 * `stack`/`kind` tags. It NEVER supplies a path, filename, directory, or extension: the hub slugs
 * the title into a contained `*.md` filename server-side, and `scope` selects one of two
 * server-known vault roots, so the client can never escape the knowledge-base directory.
 */
export interface KbAddInput {
  readonly title: string;
  readonly body: string;
  /** Which vault to write to. A fixed enum the server re-validates; default `project` (narrowest). */
  readonly scope?: KnowledgeScope;
  /** Optional stack tags from the project's allowed set. */
  readonly stack?: readonly string[];
  /** Optional kind classifier. */
  readonly kind?: string;
}

/**
 * Body for `kb/update`. Addresses the note by its server-known `id`/`file` (slug) — NEVER a path —
 * plus the `scope` enum that selects the holding vault. `title` is immutable on edit (the slug is
 * identity; a rename is add+delete), so it is sent for completeness but the server ignores a change.
 * A `scope` that differs from the note's current vault is a vault MOVE the server performs. `body`
 * is re-validated against the same caps as add. `expectedRev` is the note's per-file CAS token
 * ({@link KnowledgeDoc.rev}); a stale value yields a `conflict` carrying fresh state (no clobber).
 */
export interface KbUpdateInput {
  readonly id?: string;
  readonly file?: string;
  readonly title?: string;
  readonly body: string;
  /** The target vault (a fixed enum the server re-validates); a change off the current vault MOVES it. */
  readonly scope: KnowledgeScope;
  readonly stack?: readonly string[];
  readonly kind?: string;
  /** The note's per-file CAS token ({@link KnowledgeDoc.rev}); a stale value → `conflict`. */
  readonly expectedRev?: string;
}

/**
 * Body for `kb/remove`. Addresses the note by its server-known `id`/`file` + `scope` enum — NEVER a
 * path. The server soft-deletes it (an atomic move into a contained, scan-excluded trash; recoverable),
 * confirm-gated server-side, audited. `expectedRev` is the note's per-file CAS token; a stale value
 * yields a `conflict` carrying fresh state (nothing moved).
 */
export interface KbRemoveInput {
  readonly id?: string;
  readonly file?: string;
  readonly scope: KnowledgeScope;
  readonly expectedRev?: string;
}

/**
 * Body for `kb/source/connect`. `path` is the absolute folder the operator chose in the reused
 * folder-picker — the server realpath-validates it is a real directory and records its canonical
 * realpath; a non-directory records nothing. The connector is read-only and never writes under the
 * source root. `expectedRev` is the sources-record CAS token (absent → the server skips the check).
 */
export interface KbSourceConnectInput {
  readonly path: string;
  readonly expectedRev?: string;
}

/** The outcome of a source mutation: like {@link MutationResult} but also carrying the public source. */
export type KbSourceResult =
  | { readonly ok: true; readonly state: ProjectState | null; readonly source: KbSource | null }
  | { readonly ok: 'conflict'; readonly state: ProjectState | null }
  | { readonly ok: false; readonly error: string };

/**
 * The outcome of an interpretation-check question. The Q&A route is read-only and never throws on
 * the backend, so a usable answer is the normal case; this result only distinguishes a transport
 * failure (`ok: false`) from a delivered answer (`ok: true`) so the UI can show a terse retry hint.
 */
export type AskResult =
  | { readonly ok: true; readonly answer: KnowledgeAnswer }
  | { readonly ok: false; readonly error: string };

interface AskEnvelope extends KnowledgeAnswer {
  readonly ok?: boolean;
  readonly error?: string;
}

/**
 * Query for `searchKb`. `query` is the operator's raw search text (sent verbatim as `q`); `scope`
 * constrains the search to one vault or every visible doc. `project` is optional: when omitted the
 * service threads the scoped project id (the viewed project), matching the read-resolution every
 * other knowledge read uses; when supplied it overrides that for this one call.
 */
export interface KbSearchInput {
  /** Optional registry id / project resolver; overrides the scoped project id for this call only. */
  readonly project?: string;
  /** The operator's raw search text. UNTRUSTED — sent verbatim as `q`, never interpolated into a path. */
  readonly query: string;
  /** Which vault(s) to search: a single scope, or every visible doc. */
  readonly scope: KnowledgeScope | 'all';
}

interface SearchEnvelope {
  readonly ok?: boolean;
  readonly error?: string;
  readonly method?: string;
  readonly query?: string;
  readonly scope?: string;
  readonly results?: readonly KnowledgeSearchResult[];
}

/** Body for `ticket/advance`. `expectedRev` is the opaque token from the last received state. */
export interface AdvanceInput {
  readonly id: string;
  readonly toStage: string;
  readonly expectedRev: string;
  readonly by: string;
}

/** Body for `ticket/comment`. Append-only — comments cannot clobber, so no `expectedRev`. */
export interface CommentInput {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly kind?: string;
}

/** Body for `gate/set`. The hub emits the typed audit comment itself on success. */
export interface GateSetInput {
  readonly id: string;
  readonly gate: string;
  readonly state: 'passed' | 'rejected';
  readonly by: string;
  readonly expectedRev: string;
  readonly note?: string;
}

/**
 * Body for `track/reorder`. `stages` is the FULL new permutation of the track's stages — the hub
 * validates it adds, drops, or duplicates none. `expectedRev` guards against a stale overlay write.
 */
export interface ReorderInput {
  readonly track: string;
  readonly stages: readonly string[];
  readonly expectedRev: string;
}

/**
 * One stage of a {@link SetStagesInput} list. `name` is the stage's identity; `owner` is the agent
 * that runs it (omitted/empty falls back to the derived default); `gate` is advisory view metadata —
 * the authoritative gate rule lives in `overlay.gates`, edited via {@link GateTriggerInput}.
 */
export interface SetStagesStage {
  readonly name: string;
  readonly owner?: string;
  readonly gate?: string;
}

/**
 * Body for `track/set-stages`. `stages` is the COMPLETE new ordered stage list for the track — add
 * is a name not previously present, delete is an omitted name, move is a reorder, owner is the
 * per-stage `owner`. One declarative overlay write makes all four a single atomic CAS. The hub
 * validates the list (non-empty, unique, trimmed, capped, known track, owner from the plain-string
 * set) and writes only the overlay; the base workflow file is never changed. `expectedRev` guards
 * against a stale overlay write.
 */
export interface SetStagesInput {
  readonly track: string;
  readonly stages: readonly SetStagesStage[];
  readonly expectedRev: string;
}

/**
 * Body for `gate/trigger`. Only the fields the operator changed are sent; an omitted field leaves
 * that part of the gate rule untouched on the overlay. `refusal` chooses hard (blocking) vs soft.
 */
export interface GateTriggerInput {
  readonly gate: string;
  readonly owner?: string;
  readonly refusal?: 'hard' | 'soft';
  readonly trigger?: readonly string[];
  readonly expectedRev: string;
}

/** Body for `preset`. The hub enforces the `solo|small-team|regulated` allowlist server-side. */
export interface PresetInput {
  readonly preset: string;
  readonly expectedRev: string;
}

/**
 * Body for `workflow/set-rules`. `rules` is the COMPLETE rule list for the project as one
 * declarative overlay patch — add/edit/delete are all expressed by sending the full list. The hub
 * re-runs the full author-time safety validation (rejects a rule that routes past an unmet safety
 * gate, sets an unauthorized label, or uses an unknown action/event/agent → 400) and is the
 * authority; the client mirror is UX only. `expectedRev` guards against a stale overlay write
 * (stale → 409 conflict, never a silent overwrite).
 */
export interface SetRulesInput {
  /** The full rule list in the engine's wire grammar (single `when` object, verb-keyed `do`). */
  readonly rules: readonly Record<string, unknown>[];
  readonly expectedRev: string;
}

/**
 * Body for `workflow/set-labels`. `labels` is the COMPLETE label contract for the project as one
 * declarative overlay patch — create/edit/delete are all expressed by sending the full name-keyed
 * map (`{ NAME: { settable_by, routes_to?, owner?, meaning? } }`). The hub re-validates every entry
 * (name bounded + proto-safe, `settable_by` a list → 400) and is the authority; the client mirror is
 * UX only. `expectedRev` guards against a stale overlay write (stale → 409 conflict, never a silent
 * overwrite). Labels share the same overlay/`rev` as stages and rules, so they conflict the same way.
 */
export interface SetLabelsInput {
  /** The full label contract keyed by name, in the engine's snake_case wire shape. */
  readonly labels: Readonly<Record<string, LabelSpec>>;
  readonly expectedRev: string;
}

/** One label's engine-shaped definition: who may set it, where it routes, who owns it, what it means. */
export interface LabelSpec {
  readonly settable_by: readonly string[];
  readonly routes_to?: string;
  readonly owner?: string;
  readonly meaning?: string;
}

interface MutationEnvelope {
  readonly ok?: boolean;
  readonly conflict?: boolean;
  readonly error?: string;
  readonly state?: ProjectState | null;
  readonly doc?: KnowledgeDoc | null;
  readonly source?: KbSource | null;
}

/**
 * Typed client for the hub's guarded control-plane mutations (advance / comment / gate-set). Every
 * call rides the existing X-AIDT write guard via the injected bridge — the UI never sets headers
 * itself. A 409 is decoded into a `conflict` result carrying the fresh state, never thrown, so the
 * optimistic-write + re-sync contract holds at one place for every mutating surface.
 *
 * Project scoping: the workspace shell calls {@link setProject} with the viewed project's registry
 * id, and every mutation then carries that id as a `project` body field so the hub resolves the
 * write to the viewed project (not the launch directory). The id is a lookup key the hub validates
 * and resolves via its registry — the client never sends a path. With no id set (single-project
 * launch), the field is omitted and the hub falls back to its launch project.
 */
@Injectable({ providedIn: 'root' })
export class ControlPlaneService {
  private readonly http = inject(HttpClient);
  private readonly bridge = inject(PLATFORM_BRIDGE);

  private projectId: string | null = null;

  /**
   * Scope every subsequent mutation to a project by its registry id, or clear scoping with `null`.
   * The id is sent verbatim as the `project` body field; the hub validates and resolves it. The
   * scoped id always wins over any incoming `project` field on a mutation body.
   */
  setProject(id: string | null): void {
    this.projectId = id;
  }

  advance(input: AdvanceInput): Promise<MutationResult> {
    return this.mutate('/api/ticket/advance', input);
  }

  comment(input: CommentInput): Promise<MutationResult> {
    return this.mutate('/api/ticket/comment', input);
  }

  gateSet(input: GateSetInput): Promise<MutationResult> {
    return this.mutate('/api/gate/set', input);
  }

  reorderTrack(input: ReorderInput): Promise<MutationResult> {
    return this.mutate('/api/track/reorder', input);
  }

  /**
   * Set the active track's full ordered stage list in one declarative overlay write. Carries every
   * stage with its per-stage owner, so add / delete / move / set-owner persist as a single atomic
   * CAS keyed on `expectedRev`; a stale write returns a `conflict` result, never a silent overwrite.
   */
  setStages(input: SetStagesInput): Promise<MutationResult> {
    return this.mutate('/api/track/set-stages', input);
  }

  gateTrigger(input: GateTriggerInput): Promise<MutationResult> {
    return this.mutate('/api/gate/trigger', input);
  }

  setPreset(input: PresetInput): Promise<MutationResult> {
    return this.mutate('/api/preset', input);
  }

  /**
   * Persist the project's full `when → do` rule list in one declarative overlay write, keyed on
   * `expectedRev`. The server re-validates every rule (safety-gate bypass, label contract, schema)
   * and is the authority; a stale write returns a `conflict` result, never a silent overwrite.
   */
  setRules(input: SetRulesInput): Promise<MutationResult> {
    return this.mutate('/api/workflow/set-rules', input);
  }

  /**
   * Persist the project's full label contract in one declarative overlay write, keyed on
   * `expectedRev`. The server re-validates every entry (name rules, `settable_by` a list) and is the
   * authority; a stale write returns a `conflict` result, never a silent overwrite. Mirrors
   * {@link setRules} — labels live in the same overlay/`rev`.
   */
  setLabels(input: SetLabelsInput): Promise<MutationResult> {
    return this.mutate('/api/workflow/set-labels', input);
  }

  /**
   * Add a knowledge-base note. Always sends `{ title, body }` and conditionally includes the
   * classifying metadata the operator set — `scope` (which vault), `stack` tags, and `kind` — each
   * omitted from the body when not provided. It never sends a path, filename, or extension: the
   * server slugs the title into a contained filename and `scope` selects a server-known vault root.
   * On success returns the fresh `state` to adopt (count/list refresh) plus the `doc` the server
   * actually wrote; any failure (size/slug 400, guard 403, network) is a terse error result. This is
   * an additive create, not a CAS mutation, so there is no `expectedRev` and no conflict.
   */
  async addKbNote(input: KbAddInput): Promise<KbAddResult> {
    const note: Record<string, unknown> = { title: input.title, body: input.body };
    if (input.scope !== undefined) note['scope'] = input.scope;
    if (input.stack !== undefined) note['stack'] = input.stack;
    if (input.kind !== undefined) note['kind'] = input.kind;
    const body = this.scoped(note);
    try {
      const res = await firstValueFrom(
        this.http.post<MutationEnvelope>(this.bridge.apiUrl('/api/kb/add'), body, {
          headers: this.bridge.writeHeaders(),
        }),
      );
      if (res?.ok === true) return { ok: true, state: res.state ?? null, doc: res.doc ?? null };
      return { ok: false, error: res?.error || 'request failed' };
    } catch (err) {
      return { ok: false, error: httpErrorMessage(err) };
    }
  }

  /**
   * Approve a pending `/kai` proposal into the chosen vault. `scope` is a fixed enum the server
   * re-validates and uses to pick the target vault; the client never sends a path. The server
   * re-authorizes the stored proposal by id (a foreign/forged/stale id writes nothing), writes it
   * through the same guarded/contained knowledge chokepoint, removes it from the pending inbox, and
   * returns the fresh `state` to adopt — the approved item now appears in the Knowledge list at the
   * chosen scope and the pending count decrements. This is an additive write, so no `expectedRev`.
   */
  approveProposal(id: string, scope: KnowledgeScope): Promise<MutationResult> {
    return this.mutate('/api/kb/approve', { id, scope });
  }

  /**
   * Reject a pending `/kai` proposal. The server marks it rejected (retained for audit, never
   * recalled), removes it from the pending inbox, and returns the fresh `state` to adopt so the
   * item leaves the inbox and the pending count decrements.
   */
  rejectProposal(id: string): Promise<MutationResult> {
    return this.mutate('/api/kb/reject', { id });
  }

  /**
   * Edit a knowledge-base note (or MOVE it across vaults on a scope change) through the one guarded
   * writer. Addresses the note by its server-known `id`/`file` + `scope` enum — never a path — and
   * forwards `expectedRev` (the note's per-file CAS token) so a concurrent edit is detected: a stale
   * rev returns a `conflict` result carrying fresh state, never an optimistic clobber. The title is
   * immutable (a rename is add+delete). Returns the fresh `state` to adopt on success.
   */
  editKbNote(input: KbUpdateInput): Promise<MutationResult> {
    const body: Record<string, unknown> = { body: input.body, scope: input.scope };
    if (input.id !== undefined) body['id'] = input.id;
    if (input.file !== undefined) body['file'] = input.file;
    if (input.title !== undefined) body['title'] = input.title;
    if (input.stack !== undefined) body['stack'] = input.stack;
    if (input.kind !== undefined) body['kind'] = input.kind;
    if (input.expectedRev !== undefined) body['expectedRev'] = input.expectedRev;
    return this.mutate('/api/kb/update', body);
  }

  /**
   * Soft-delete a knowledge-base note through the guarded writer (an atomic move into a contained,
   * scan-excluded trash; recoverable). Addresses the note by `id`/`file` + `scope` — never a path —
   * and forwards `expectedRev` (the note's per-file CAS token); a stale rev returns a `conflict`
   * result carrying fresh state, so a concurrent change is never blind-deleted. Returns the fresh
   * `state` (the row leaves the list and the count decrements from that single source of truth).
   */
  removeKbNote(input: KbRemoveInput): Promise<MutationResult> {
    const body: Record<string, unknown> = { scope: input.scope };
    if (input.id !== undefined) body['id'] = input.id;
    if (input.file !== undefined) body['file'] = input.file;
    if (input.expectedRev !== undefined) body['expectedRev'] = input.expectedRev;
    return this.mutate('/api/kb/remove', body);
  }

  /**
   * Connect an external codebase as a read-only, realpath-contained knowledge source. Sends the
   * absolute `path` the operator chose; the server validates it is a real directory, records its
   * canonical realpath, and runs the bounded read-only ingest. Returns the fresh `state` plus the
   * public source record on success, or a `conflict` carrying fresh state on a stale sources rev.
   */
  connectKbSource(input: KbSourceConnectInput): Promise<KbSourceResult> {
    const body: Record<string, unknown> = { path: input.path };
    if (input.expectedRev !== undefined) body['expectedRev'] = input.expectedRev;
    return this.mutateSource('/api/kb/source/connect', body);
  }

  /**
   * Re-run the read-only contained ingest for a connected source. Forwards `expectedRev` (the
   * sources-record CAS token); a stale rev returns a `conflict` carrying fresh state. Returns the
   * fresh `state` plus the re-indexed source on success.
   */
  reindexKbSource(sourceId: string, expectedRev?: string): Promise<KbSourceResult> {
    const body: Record<string, unknown> = { sourceId };
    if (expectedRev !== undefined) body['expectedRev'] = expectedRev;
    return this.mutateSource('/api/kb/source/reindex', body);
  }

  /**
   * Disconnect a source: remove the registration + its derived index facet only — NEVER the user's
   * files. Forwards `expectedRev`; a stale rev returns a `conflict` carrying fresh state. Returns
   * the fresh `state` to adopt (the row leaves the strip from that single source of truth).
   */
  disconnectKbSource(sourceId: string, expectedRev?: string): Promise<MutationResult> {
    const body: Record<string, unknown> = { sourceId };
    if (expectedRev !== undefined) body['expectedRev'] = expectedRev;
    return this.mutate('/api/kb/source/disconnect', body);
  }

  /**
   * Ask an interpretation-check question over the project's already-visible knowledge — "does DART
   * understand my note on X?". This is a READ (`GET /api/knowledge/ask`): it carries NO write-guard
   * header, sends nothing but the question and the scoped project id as query params, and never
   * mutates. The backend answers from the local scope by default; it egresses to an external overlay
   * ONLY when the operator has configured one and it is healthy, and reports that truthfully in the
   * answer's `egressDisclosed` flag — which the UI is the sole consumer of for its egress indicator.
   *
   * @param question the operator's question (untrusted text; sent verbatim as `q`)
   * @returns `ok:true` with the answer (escaped on render), or `ok:false` with a terse error
   */
  async askKnowledge(question: string): Promise<AskResult> {
    let params = new HttpParams().set('q', question);
    if (this.projectId !== null) params = params.set('project', this.projectId);
    try {
      const res = await firstValueFrom(
        this.http.get<AskEnvelope>(this.bridge.apiUrl('/api/knowledge/ask'), { params }),
      );
      if (res?.ok === true) {
        return {
          ok: true,
          answer: {
            answer: res.answer,
            matches: res.matches ?? [],
            grounding: res.grounding,
            egressDisclosed: res.egressDisclosed === true,
          },
        };
      }
      return { ok: false, error: res?.error || 'request failed' };
    } catch (err) {
      return { ok: false, error: httpErrorMessage(err) };
    }
  }

  /**
   * Search the project's knowledge over note BODIES via the full-text index — "find the note that
   * mentions X", even when X appears only in a note's body. This is a READ (`GET /api/kb/search`):
   * it carries NO write-guard header, sends only `q`, `scope`, and the scoped project id as query
   * params, and never mutates. The route is loopback-only and read-only.
   *
   * Honesty contract: the resolved `method` is whatever path the server actually took — `full-text`
   * only when it queried note bodies, `filename-only` when it degraded to a filename/excerpt scan —
   * and the caller must reflect that verbatim, never claiming full-text on a `filename-only` answer.
   *
   * Any failure — transport error, or an `ok:false` envelope — decodes to `null` (never a throw), so
   * the caller can fall back to its existing client-side title/excerpt filter rather than blank out.
   *
   * @param input the raw query, the scope to search, and an optional project override
   * @returns the ranked, scope-safe outcome, or `null` when the search is unavailable
   */
  async searchKb(input: KbSearchInput): Promise<KnowledgeSearchOutcome | null> {
    let params = new HttpParams().set('q', input.query).set('scope', input.scope);
    const project = input.project ?? this.projectId;
    if (project !== null && project !== undefined) params = params.set('project', project);
    try {
      const res = await firstValueFrom(
        this.http.get<SearchEnvelope>(this.bridge.apiUrl('/api/kb/search'), { params }),
      );
      if (res?.ok !== true) return null;
      return {
        method: res.method ?? 'filename-only',
        query: res.query ?? input.query,
        scope: res.scope ?? input.scope,
        results: res.results ?? [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Like {@link mutate} but threads the public source record the connect/reindex routes return, so
   * the connected-sources strip can reflect the freshly indexed source while the page also adopts
   * the returned fresh `state`. A 409 still decodes to a first-class `conflict` carrying fresh state.
   */
  private async mutateSource(apiPath: string, body: object): Promise<KbSourceResult> {
    try {
      const res = await firstValueFrom(
        this.http.post<MutationEnvelope>(this.bridge.apiUrl(apiPath), this.scoped(body), {
          headers: this.bridge.writeHeaders(),
        }),
      );
      if (res?.ok === true) return { ok: true, state: res.state ?? null, source: res.source ?? null };
      return { ok: false, error: res?.error || 'request failed' };
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        const conflictBody = err.error as MutationEnvelope | null;
        return { ok: 'conflict', state: conflictBody?.state ?? null };
      }
      return { ok: false, error: httpErrorMessage(err) };
    }
  }

  private async mutate(apiPath: string, body: object): Promise<MutationResult> {
    try {
      const res = await firstValueFrom(
        this.http.post<MutationEnvelope>(this.bridge.apiUrl(apiPath), this.scoped(body), {
          headers: this.bridge.writeHeaders(),
        }),
      );
      if (res?.ok === true) return { ok: true, state: res.state ?? null };
      return { ok: false, error: res?.error || 'request failed' };
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        const conflictBody = err.error as MutationEnvelope | null;
        return { ok: 'conflict', state: conflictBody?.state ?? null };
      }
      return { ok: false, error: httpErrorMessage(err) };
    }
  }

  /**
   * Stamp the scoped project id onto a mutation body. When a project is scoped its id is appended
   * last so it always wins over any `project` field already on the body; when none is scoped the
   * body is sent unchanged (single-project launch — the hub falls back to its launch project).
   */
  private scoped<T extends object>(body: T): T | (T & { project: string }) {
    return this.projectId === null ? body : { ...body, project: this.projectId };
  }
}

/** Pull the hub's `{ error }` text out of an HttpErrorResponse, else a generic message. */
function httpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: string } | string | null;
    if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
    if (typeof body === 'string' && body) return body;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
