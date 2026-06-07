import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Application root. The cockpit is a router-driven shell: the launcher (Projects Home) and the
 * per-project shell are routed views, so this root is just the outlet plus a skip link for
 * keyboard users.
 */
@Component({
  selector: 'dart-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <router-outlet />
  `,
  styles: `
    .skip-link {
      position: absolute;
      left: var(--kb-space-3);
      top: -3rem;
      padding: var(--kb-space-2) var(--kb-space-3);
      background: var(--kb-surface);
      color: var(--kb-text);
      border-radius: var(--kb-radius-md);
      box-shadow: var(--kb-shadow-md);
      transition: top 0.15s ease;
      z-index: 10;
    }
    .skip-link:focus {
      top: var(--kb-space-3);
    }
  `,
})
export class App {}
