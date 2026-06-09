import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type { BaseDoc, KnowledgeScope, ProjectState } from './models';

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
 * base projection already carries the new doc + incremented count) AND the `doc` it actually wrote
 * — the server derives the filename from the title, so on a duplicate it reports the unique name it
 * chose (e.g. `code-rules-2`) and the UI names what was really created rather than what was asked.
 */
export type KbAddResult =
  | { readonly ok: true; readonly state: ProjectState | null; readonly doc: BaseDoc | null }
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
  readonly doc?: BaseDoc | null;
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
   * Add a knowledge-base note. Sends ONLY `{ title, body }` — the server derives a contained
   * filename. On success returns the fresh `state` to adopt (count/list refresh) plus the `doc` the
   * server actually wrote; any failure (size/slug 400, guard 403, network) is a terse error result.
   * This is an additive create, not a CAS mutation, so there is no `expectedRev` and no conflict.
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
