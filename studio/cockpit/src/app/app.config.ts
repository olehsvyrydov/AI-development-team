import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from './core/platform-bridge';

/**
 * Cockpit bootstrap providers. Angular 21 is zoneless by default, so no zone provider is
 * configured. `withComponentInputBinding` lets route params (`:id`) bind straight to a
 * component input. The platform bridge is the default browser/Core implementation; a Tauri or
 * IDE host re-provides {@link PLATFORM_BRIDGE} at its own bootstrap to swap transport.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
    { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
  ],
};
