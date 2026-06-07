import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { ConnectStatus } from '../core/projects.store';

/**
 * The always-last "Connect a project" cell of the launcher grid, and the progress surface for
 * the connect → analyse → ready/error flow (the card itself shows the state, so the user keeps
 * context). The user enters a folder path and submits; the parent performs the POST (with the
 * X-AIDT write guard) via the store and feeds the resulting status/error back in.
 *
 * A free-text path field is used rather than a native picker: the picker is a host capability
 * (browser/Tauri/IDE) that arrives with the PlatformBridge in a later ticket. The field is the
 * cross-platform floor that works in every host today.
 */
@Component({
  selector: 'dart-connect-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="connect" aria-labelledby="connect-h">
      <h2 id="connect-h" class="connect__title">
        <span class="connect__plus" aria-hidden="true">＋</span> Connect a project
      </h2>

      @switch (status()) {
        @case ('analyzing') {
          <div class="state" data-testid="connect-analyzing" role="status" aria-live="polite">
            <span class="spinner" aria-hidden="true"></span>
            <p class="state__line">Analysing project…</p>
            <p class="state__sub">Reading the folder and summarising it on this machine.</p>
          </div>
        }
        @case ('error') {
          <div class="state state--error" data-testid="connect-error" role="alert">
            <p class="state__line">Couldn't connect that folder.</p>
            <p class="state__sub">{{ error() }}</p>
            <button type="button" class="btn btn--ghost" (click)="reset.emit()">Try again</button>
          </div>
        }
        @default {
          <form class="form" (submit)="submit($event)">
            <label class="form__label" [attr.for]="inputId">Folder path</label>
            <input
              class="form__input"
              data-testid="connect-path"
              [id]="inputId"
              type="text"
              name="path"
              autocomplete="off"
              spellcheck="false"
              placeholder="/path/to/your/project"
              [value]="path()"
              (input)="onInput($event)"
              [attr.aria-describedby]="hintId"
            />
            <p [id]="hintId" class="form__hint">We never upload your code. Analysis runs on this machine.</p>
            <button type="submit" class="btn" data-testid="connect-submit" [disabled]="!canSubmit()">
              Connect
            </button>
          </form>
        }
      }
    </section>
  `,
  styles: `
    .connect {
      display: flex;
      flex-direction: column;
      gap: var(--kb-space-2);
      min-height: 11rem;
      padding: var(--kb-space-3);
      background: transparent;
      border: 1.5px dashed var(--kb-border-strong);
      border-radius: var(--kb-radius-lg);
    }
    .connect__title { margin: 0; font-size: var(--kb-text-base); font-weight: 600; display: flex; align-items: center; gap: 0.4rem; }
    .connect__plus { color: var(--kb-accent); font-size: var(--kb-text-lg); }
    .form { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .form__label { font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .form__input {
      width: 100%;
      padding: 0.5rem 0.65rem;
      font: inherit;
      color: var(--kb-text);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-md);
    }
    .form__input:focus-visible { outline: 2px solid var(--kb-accent); outline-offset: 1px; }
    .form__hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .btn {
      align-self: flex-start;
      padding: 0.5rem 0.9rem;
      font: inherit;
      font-weight: 600;
      color: #fff;
      background: var(--kb-accent-strong);
      border: 1px solid transparent;
      border-radius: var(--kb-radius-md);
      cursor: pointer;
    }
    .btn:hover { background: var(--kb-accent-strong-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn--ghost { color: var(--kb-text); background: transparent; border-color: var(--kb-border-strong); }
    .state { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .state__line { margin: 0; font-weight: 600; }
    .state__sub { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); overflow-wrap: anywhere; }
    .state--error .state__sub { color: var(--kb-danger); }
    .spinner {
      width: 1.1rem; height: 1.1rem; border-radius: 999px;
      border: 2px solid var(--kb-border-strong);
      border-top-color: var(--kb-accent);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class ConnectPanelComponent {
  readonly status = input<ConnectStatus>('idle');
  readonly error = input<string | null>(null);
  readonly connect = output<string>();
  readonly reset = output<void>();

  protected readonly path = signal('');
  protected readonly inputId = `connect-path-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly hintId = `${this.inputId}-hint`;

  protected readonly canSubmit = computed(() => this.path().trim().length > 0);

  protected onInput(event: Event): void {
    this.path.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.path().trim();
    if (value) this.connect.emit(value);
  }
}
