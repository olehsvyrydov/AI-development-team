import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type { BaseDoc, ProjectState } from './models';

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
 * Body for `kb/add`. The client supplies ONLY a title and a markdown body — never a path, filename,
 * directory, or extension. The hub slugs the title into a contained `*.md` filename server-side; a
 * client that named the file could escape the knowledge-base directory, so the boundary is enforced
 * here by sending these two fields and nothing else.
 */
export interface KbAddInput {
  readonly title: string;
  readonly body: string;
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
 */
@Injectable({ providedIn: 'root' })
export class ControlPlaneService {
  private readonly http = inject(HttpClient);
  private readonly bridge = inject(PLATFORM_BRIDGE);

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

  gateTrigger(input: GateTriggerInput): Promise<MutationResult> {
    return this.mutate('/api/gate/trigger', input);
  }

  setPreset(input: PresetInput): Promise<MutationResult> {
    return this.mutate('/api/preset', input);
  }

  /**
   * Add a knowledge-base note. Sends ONLY `{ title, body }` — the server derives a contained
   * filename. On success returns the fresh `state` to adopt (count/list refresh) plus the `doc` the
   * server actually wrote; any failure (size/slug 400, guard 403, network) is a terse error result.
   * This is an additive create, not a CAS mutation, so there is no `expectedRev` and no conflict.
   */
  async addKbNote(input: KbAddInput): Promise<KbAddResult> {
    const body: KbAddInput = { title: input.title, body: input.body };
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

  private async mutate(apiPath: string, body: unknown): Promise<MutationResult> {
    try {
      const res = await firstValueFrom(
        this.http.post<MutationEnvelope>(this.bridge.apiUrl(apiPath), body, {
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
