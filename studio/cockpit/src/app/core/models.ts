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

/** A registry index entry — what `GET /api/projects` returns per project (no profile). */
export interface ProjectRecord {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly addedAt: string;
  readonly lastSeen: string;
  readonly status: ProjectStatus;
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

/** Workflow/board state for a project (read-model passthrough; panels are later tickets). */
export interface ProjectState {
  readonly project?: string;
  readonly preset?: string;
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
