import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type {
  ApiEnvelope,
  ConnectResponse,
  ProjectDetailResponse,
  ProjectListResponse,
  ProjectRecord,
  ProjectView,
} from './models';

/** Result of a connect call: whether a new project was created plus its joined view. */
export interface ConnectResult {
  readonly created: boolean;
  readonly view: ProjectView;
}

/**
 * Typed client for the hub registry API (the three endpoints the cockpit uses). All transport
 * details — base URL and the write-guard header — come from the injected {@link PlatformBridge},
 * so a Tauri/IDE host can redirect or re-secure requests without touching this service.
 *
 * Every method resolves to domain types and rejects with the hub's own error text, so callers
 * (the store) get one uniform failure channel for both `ok:false` envelopes and HTTP errors.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly bridge = inject(PLATFORM_BRIDGE);

  /** List connected projects. Read-only — no write-guard header. */
  async listProjects(): Promise<readonly ProjectRecord[]> {
    const res = await this.get<ProjectListResponse>('/api/projects');
    return res.projects ?? [];
  }

  /** Fetch one project's record + profile + workflow state, joined into a view. */
  async getProject(id: string): Promise<ProjectView> {
    const res = await this.get<ProjectDetailResponse>(`/api/projects/${encodeURIComponent(id)}`);
    return this.toView(res);
  }

  /**
   * Connect (and analyse) a folder. This is a MUTATION: it carries the bridge's write headers
   * (the X-AIDT guard) so the hub accepts it. Resolves with the created flag and the new view.
   */
  async connectProject(path: string): Promise<ConnectResult> {
    const res = await this.post<ConnectResponse>('/api/projects/connect', { path });
    return { created: res.created ?? false, view: this.toView(res) };
  }

  private async get<T extends ApiEnvelope>(apiPath: string): Promise<T> {
    return this.unwrap(firstValueFrom(this.http.get<T>(this.bridge.apiUrl(apiPath))));
  }

  private async post<T extends ApiEnvelope>(apiPath: string, body: unknown): Promise<T> {
    return this.unwrap(
      firstValueFrom(
        this.http.post<T>(this.bridge.apiUrl(apiPath), body, { headers: this.bridge.writeHeaders() }),
      ),
    );
  }

  /** Normalise both `ok:false` envelopes and HTTP errors into a thrown hub-error message. */
  private async unwrap<T extends ApiEnvelope>(pending: Promise<T>): Promise<T> {
    let res: T;
    try {
      res = await pending;
    } catch (err) {
      throw new Error(httpErrorMessage(err));
    }
    if (!res || res.ok !== true) {
      throw new Error(res?.error || 'request failed');
    }
    return res;
  }

  private toView(res: ProjectDetailResponse | ConnectResponse): ProjectView {
    if (!res.project) throw new Error('hub response missing project');
    return { record: res.project, profile: res.profile ?? null, state: res.state ?? null };
  }
}

/** Pull the hub's `{ error }` text out of an HttpErrorResponse, else a generic message. */
function httpErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiEnvelope | string | null;
    if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
    if (typeof body === 'string' && body) return body;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
