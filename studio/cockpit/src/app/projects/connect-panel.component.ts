import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { ConnectStatus } from '../core/projects.store';
import { FolderPickerComponent } from './folder-picker.component';

/**
 * Facts the ready state needs to tell the user WHICH path happened — a fresh init or an adopt of
 * an existing project — plus the counts to show. `created`/`source` come straight from the
 * connect response (`created:true` + source `analysis` = initialised; otherwise adopted).
 */
export interface ConnectOutcome {
  readonly created: boolean;
  readonly source?: string;
  readonly title: string;
  readonly tickets?: number;
  readonly docs?: number;
}

/**
 * The always-last "Add a project" cell of the launcher grid, and the progress surface for the
 * connect → analyse → ready/error flow.
 *
 * Picking a folder is delegated to the focus-trapped {@link FolderPickerComponent} (a Core
 * directory browser) rather than a free-text path field: a browser cannot read an absolute path
 * from a native file input. The button opens the dialog; the dialog emits the chosen path, which
 * this cell forwards as the connect request. On every close path — chosen, cancel, Escape,
 * backdrop — keyboard focus returns to the button that opened the dialog. A later Tauri host can
 * swap the dialog for the native OS picker behind the PlatformBridge with no change to this flow.
 *
 * The ready state names the outcome explicitly — "Initialised" vs "Adopted — found existing
 * project" — so the user knows whether connect created a profile or picked up existing artefacts.
 */
@Component({
  selector: 'dart-connect-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderPickerComponent],
  template: `
    <section class="connect" aria-labelledby="connect-h">
      <h2 id="connect-h" class="connect__title">
        <svg class="connect__plus" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
          <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        Add a project
      </h2>

      @switch (status()) {
        @case ('analyzing') {
          <div class="state" data-testid="connect-analyzing" role="status" aria-live="polite">
            <span class="spinner" aria-hidden="true"></span>
            <p class="state__line">Analysing folder…</p>
            <p class="state__sub">Reading the folder and summarising it on this machine.</p>
          </div>
        }
        @case ('ready') {
          <div class="state state--ready" data-testid="connect-ready" role="status" aria-live="polite">
            @if (outcome(); as o) {
              @if (isAdopt()) {
                <p class="state__line">Adopted — found existing project</p>
              } @else {
                <p class="state__line">Initialised — analysed and indexed</p>
              }
              <p class="state__sub">{{ summaryLine() }}</p>
            } @else {
              <p class="state__line">Connected.</p>
            }
            <button type="button" class="btn btn--ghost" (click)="reset.emit()">Add another</button>
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
          <p class="connect__lead">Pick a folder on this machine — DART analyses it right here.</p>
          <button type="button" class="btn" data-testid="open-picker" (click)="openPicker($event)">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Choose a folder…
          </button>
          <p class="connect__hint">No account, no API key to paste. Takes about a minute.</p>
        }
      }
    </section>

    <dart-folder-picker [open]="pickerOpen()" (chosen)="onChosen($event)" (cancelled)="closePicker()" />
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
    .connect__plus { flex: none; color: var(--kb-accent); }
    .connect__lead { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .connect__hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .btn {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
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
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  `,
})
export class ConnectPanelComponent {
  readonly status = input<ConnectStatus>('idle');
  readonly error = input<string | null>(null);
  /** The init-vs-adopt facts for the ready state, when a connect has resolved. */
  readonly outcome = input<ConnectOutcome | null>(null);
  readonly connect = output<string>();
  readonly reset = output<void>();

  protected readonly pickerOpen = signal(false);

  /** The control that opened the picker, refocused on close so keyboard focus is never lost. */
  private opener: HTMLElement | null = null;

  /** Adopted when the connect did not create a new profile, or the source is existing artefacts. */
  protected readonly isAdopt = computed(() => {
    const o = this.outcome();
    return !!o && (o.created === false || o.source === 'artefacts');
  });

  protected readonly summaryLine = computed(() => {
    const o = this.outcome();
    if (!o) return '';
    const parts: string[] = [];
    if (typeof o.tickets === 'number') parts.push(`${o.tickets} tickets`);
    if (typeof o.docs === 'number') parts.push(`${o.docs} docs`);
    const counts = parts.length ? `${parts.join(', ')} ready.` : 'Ready.';
    return `${o.title} — ${counts}`;
  });

  protected openPicker(event: Event): void {
    this.opener = event.currentTarget as HTMLElement | null;
    this.pickerOpen.set(true);
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.restoreOpenerFocus();
  }

  protected onChosen(path: string): void {
    this.pickerOpen.set(false);
    this.restoreOpenerFocus();
    this.connect.emit(path);
  }

  private restoreOpenerFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus();
  }
}
