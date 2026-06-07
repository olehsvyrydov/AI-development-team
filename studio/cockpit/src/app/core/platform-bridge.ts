import { InjectionToken } from '@angular/core';

/**
 * The header the hub's write-guard requires on every mutating request. A cross-origin page
 * cannot set a custom request header, so its presence proves the call came from the cockpit's
 * own code rather than a hostile site driving the loopback API (anti-CSRF / anti-DNS-rebinding,
 * matching hub/lib/guard.js). The value is a non-empty marker; only its presence is checked.
 */
export const WRITE_GUARD_HEADER = 'X-AIDT';

/**
 * Indirection over transport + host capabilities. The cockpit ships as one bundle served by
 * three hosts (Constellation Core over HTTP, a Tauri WebView, an IDE webview); they differ only
 * in how the API is reached and which native capabilities exist. Code depends on this interface,
 * never on `fetch`/base-URL details directly, so a host can swap the implementation.
 */
export interface PlatformBridge {
  /** Resolve an API path (e.g. `/api/projects`) to a full URL for the current host. */
  apiUrl(path: string): string;
  /** Headers that must accompany a mutating request for the hub to accept it. */
  writeHeaders(): Record<string, string>;
}

/** Injection token so a host can provide its own bridge at bootstrap. */
export const PLATFORM_BRIDGE = new InjectionToken<PlatformBridge>('PlatformBridge');

/**
 * Default bridge for a plain browser / Core-served deployment. With no base URL it issues
 * same-origin relative requests (the dev server's proxy, or Core, serves both the SPA and the
 * API). A host may pass an absolute base to target a separate hub.
 */
export class BrowserPlatformBridge implements PlatformBridge {
  private readonly base: string;

  constructor(baseUrl = '') {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  apiUrl(path: string): string {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${this.base}${suffix}`;
  }

  writeHeaders(): Record<string, string> {
    return { [WRITE_GUARD_HEADER]: '1' };
  }
}
