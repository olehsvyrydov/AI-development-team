import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_BRIDGE } from './platform-bridge';
import type { ApiEnvelope, FsListResponse, FsListing, FsPlace, FsRootsResponse } from './models';

/** Normalised roots payload: navigation roots plus recently connected paths. */
export interface FsRoots {
  readonly roots: readonly FsPlace[];
  readonly recent: readonly FsPlace[];
}

/**
 * Typed client for the hub's read-only directory-browser endpoints (`/api/fs/roots`,
 * `/api/fs/list`) that back the folder picker.
 *
 * These two GETs disclose local filesystem structure — a capability, not public data — so the
 * hub routes them through the same write-access guard as a mutation. This service therefore
 * sends the guard header (the {@link PlatformBridge}'s `writeHeaders`, i.e. X-AIDT) on every
 * call; without it the hub answers 403. The header is the control that keeps the home-directory
 * shape disclosed only to the cockpit's own session, never to a hostile web page driving
 * loopback.
 *
 * All transport details (base URL, the guard header) come from the injected bridge, so a
 * Tauri/IDE host can re-secure or redirect without touching this service.
 */
@Injectable({ providedIn: 'root' })
export class FsService {
  private readonly http = inject(HttpClient);
  private readonly bridge = inject(PLATFORM_BRIDGE);

  /** The picker's starting points: navigation roots ($HOME) plus recently connected paths. */
  async roots(): Promise<FsRoots> {
    const res = await this.get<FsRootsResponse>('/api/fs/roots');
    return { roots: res.roots ?? [], recent: res.recent ?? [] };
  }

  /**
   * List the immediate sub-folders of `path` (default: the hub's Home root when omitted).
   * Returns only directories; the hub omits files and any stat-derived metadata.
   */
  async list(path?: string): Promise<FsListing> {
    let params: HttpParams | undefined;
    if (path != null) params = new HttpParams().set('path', path);
    const res = await this.get<FsListResponse>('/api/fs/list', params);
    return {
      path: res.path ?? path ?? '',
      parent: res.parent ?? null,
      entries: res.entries ?? [],
      truncated: res.truncated === true,
    };
  }

  private async get<T extends ApiEnvelope>(apiPath: string, params?: HttpParams): Promise<T> {
    const pending = firstValueFrom(
      this.http.get<T>(this.bridge.apiUrl(apiPath), { headers: this.bridge.writeHeaders(), params }),
    );
    let res: T;
    try {
      res = await pending;
    } catch (err) {
      throw new Error(httpErrorMessage(err));
    }
    if (!res || res.ok !== true) throw new Error(res?.error || 'request failed');
    return res;
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
