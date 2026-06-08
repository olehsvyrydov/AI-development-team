import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FsService } from '../core/fs.service';
import type { FsEntry, FsPlace } from '../core/models';
import { PICKER_FOOTER, PICKER_SUBTITLE } from './copy';

interface Listing {
  readonly path: string;
  readonly parent: string | null;
  readonly entries: readonly FsEntry[];
  readonly truncated: boolean;
}

/**
 * The folder-picker dialog — a Core-served directory browser for adding a project.
 *
 * A focus-trapped modal (`role="dialog"`, `aria-modal`) that lets the user navigate the local
 * filesystem the Core exposes (read-only) and pick a project folder. It drives the two guarded
 * `/api/fs/*` endpoints via {@link FsService}: roots/recent for Quick Access, and a one-level
 * listing per directory. Folders only; a "has project" marker flags directories that already
 * contain DART artefacts.
 *
 * Interaction: the directory being listed is the default selection, so Connect is enabled the
 * moment a folder opens — navigate in, then Connect connects that folder. A row is select-on-click
 * (echoed in the footer, `aria-selected`) which connects the child instead; drill-in is
 * double-click / the chevron / Enter; the keyboard moves with Up/Down, drills with Enter/Right,
 * and goes up with Backspace/Left. Connect is enabled whenever a valid folder is selected. Escape,
 * the backdrop, Cancel and ✕ all emit `cancelled`; the opener is responsible for restoring focus.
 *
 * Security: folder names are untrusted filesystem text rendered with interpolation only
 * (escaped) — never `[innerHTML]`. The reassurance subtitle/footer are ratified claim strings
 * that match the endpoint's real read-only, contained behaviour.
 */
@Component({
  selector: 'dart-folder-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="backdrop" (click)="cancel()">
        <div
          #dialog
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="picker-title"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="onKeydown($event)"
        >
          <header class="dialog__head">
            <div>
              <h2 id="picker-title" class="dialog__title">Choose a project folder</h2>
              <p class="dialog__subtitle">{{ subtitle }}</p>
            </div>
            <button type="button" class="icon-btn" data-testid="picker-close" aria-label="Close" (click)="cancel()">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <nav class="bar">
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              data-testid="fs-up"
              [disabled]="!current()?.parent"
              (click)="up()"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
                <polyline points="6,14 12,8 18,14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Up
            </button>
            <ol class="crumbs" aria-label="Current path">
              <li class="crumbs__root">
                <button type="button" class="crumb-root" aria-label="Filesystem root" (click)="openPath('/')">/</button>
              </li>
              @for (seg of crumbs(); track seg.path) {
                <li>
                  <button type="button" class="crumb" (click)="openPath(seg.path)">{{ seg.label }}</button>
                </li>
              }
            </ol>
          </nav>

          @if (places().length) {
            <section class="quick" aria-label="Quick access">
              @for (place of places(); track place.path) {
                <button type="button" class="quick__item" (click)="openPath(place.path)">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                    <polyline points="3,11 12,4 21,11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M5 10 v9 h14 v-9" fill="none" stroke="currentColor" stroke-width="1.6" />
                  </svg>
                  <span class="quick__label">{{ place.label }}</span>
                  <span class="quick__path">{{ place.path }}</span>
                </button>
              }
            </section>
          }

          <div class="list-region" aria-live="polite">
            @if (loading()) {
              <div class="skeletons" data-testid="fs-loading" aria-hidden="true">
                @for (n of [1, 2, 3, 4, 5]; track n) {
                  <span class="skeleton"></span>
                }
              </div>
            } @else if (listError(); as err) {
              <p class="alert" role="alert" data-testid="fs-error">Couldn't read this folder ({{ err }}).</p>
            } @else if (current()?.entries?.length) {
              <ul class="rows" role="listbox" aria-label="Folders">
                @for (entry of current()!.entries; track entry.name; let i = $index) {
                  <li
                    class="row"
                    role="option"
                    data-testid="fs-row"
                    [class.row--active]="i === activeIndex()"
                    [attr.aria-selected]="pathOf(entry) === selected()"
                    (click)="select(entry)"
                    (dblclick)="openPath(pathOf(entry))"
                  >
                    <svg class="row__folder" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
                      <path d="M3 7 h5 l2 2 h11 v9 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                    </svg>
                    <span class="row__name">{{ entry.name }}</span>
                    @if (entry.hasProject) {
                      <span class="row__badge" data-testid="has-project">
                        <span class="row__dot" aria-hidden="true"></span> has project
                      </span>
                    }
                    <button
                      type="button"
                      class="row__drill"
                      [attr.aria-label]="'Open ' + entry.name"
                      (click)="$event.stopPropagation(); openPath(pathOf(entry))"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
                        <polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>
                  </li>
                }
              </ul>
              @if (current()?.truncated) {
                <p class="truncated">Showing the first folders only — narrow down by opening a sub-folder.</p>
              }
            } @else {
              <p class="muted" data-testid="fs-empty">No sub-folders here.</p>
            }
          </div>

          <footer class="dialog__foot">
            <p class="selected" data-testid="selected-path" aria-live="polite">
              @if (selected(); as sel) {
                Selected: {{ sel }}
              } @else {
                <span class="muted">Select a folder to connect.</span>
              }
            </p>
            <p class="reassure">{{ footer }}</p>
            <div class="actions">
              <button type="button" class="btn btn--ghost" data-testid="picker-cancel" (click)="cancel()">Cancel</button>
              <button type="button" class="btn" data-testid="picker-connect" [disabled]="!selected()" (click)="confirm()">
                Connect
              </button>
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--kb-space-4);
      background: rgba(0, 0, 0, 0.55);
      z-index: 50;
    }
    .dialog {
      display: flex;
      flex-direction: column;
      width: min(40rem, 100%);
      max-height: min(40rem, 90vh);
      background: var(--kb-surface);
      border: 1px solid var(--kb-border);
      border-radius: var(--kb-radius-lg);
      box-shadow: var(--kb-shadow-md);
      color: var(--kb-text);
    }
    .dialog:focus-visible { outline: 2px solid var(--kb-accent); outline-offset: 2px; }
    .dialog__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--kb-space-2);
      padding: var(--kb-space-3) var(--kb-space-4);
      border-bottom: 1px solid var(--kb-border);
    }
    .dialog__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 700; }
    .dialog__subtitle { margin: 0.2rem 0 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .icon-btn { display: inline-flex; padding: 0.25rem; color: var(--kb-text-muted); background: transparent; border: none; border-radius: var(--kb-radius-md); cursor: pointer; }
    .icon-btn:hover { color: var(--kb-text); background: var(--kb-surface-muted); }
    .bar {
      display: flex;
      align-items: center;
      gap: var(--kb-space-2);
      padding: var(--kb-space-2) var(--kb-space-4);
      border-bottom: 1px solid var(--kb-border);
    }
    .crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; margin: 0; padding: 0; list-style: none; font-size: var(--kb-text-sm); }
    .crumbs li:not(:first-child)::before { content: '/'; color: var(--kb-text-subtle); margin-right: 0.25rem; }
    .crumb, .crumb-root { color: var(--kb-text-muted); background: transparent; border: none; cursor: pointer; padding: 0.1rem 0.2rem; }
    .crumb:hover, .crumb-root:hover { color: var(--kb-text); }
    .quick {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: var(--kb-space-2) var(--kb-space-3);
      border-bottom: 1px solid var(--kb-border);
    }
    .quick__item {
      display: flex;
      align-items: center;
      gap: var(--kb-space-2);
      padding: 0.3rem 0.4rem;
      color: var(--kb-text-muted);
      background: transparent;
      border: none;
      border-radius: var(--kb-radius-md);
      cursor: pointer;
      text-align: left;
    }
    .quick__item:hover { background: var(--kb-surface-muted); color: var(--kb-text); }
    .quick__label { font-weight: 600; }
    .quick__path { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); overflow-wrap: anywhere; }
    .list-region { flex: 1; overflow: auto; padding: var(--kb-space-2) var(--kb-space-2); min-height: 8rem; }
    .rows { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; padding: 0; list-style: none; }
    .row {
      display: flex;
      align-items: center;
      gap: var(--kb-space-2);
      min-height: 2.25rem;
      padding: 0.3rem 0.5rem;
      border-radius: var(--kb-radius-md);
      cursor: pointer;
    }
    .row:hover { background: var(--kb-surface-muted); }
    .row--active { background: var(--kb-surface-muted); }
    .row[aria-selected='true'] { background: var(--kb-accent-soft); color: var(--kb-text); outline: 1px solid var(--kb-accent); }
    .row__folder { flex: none; color: var(--kb-accent); }
    .row__name { flex: 1; overflow-wrap: anywhere; }
    .row__badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: var(--kb-text-xs); color: var(--kb-success); }
    .row__dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--kb-success); }
    .row__drill { display: inline-flex; padding: 0.2rem; color: var(--kb-text-subtle); background: transparent; border: none; border-radius: var(--kb-radius-md); cursor: pointer; }
    .row__drill:hover { color: var(--kb-text); background: var(--kb-surface); }
    .skeletons { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.3rem; }
    .skeleton { height: 1.6rem; border-radius: var(--kb-radius-md); background: var(--kb-surface-muted); }
    @media (prefers-reduced-motion: no-preference) {
      .skeleton { animation: pulse 1.2s ease-in-out infinite; }
    }
    @keyframes pulse { 50% { opacity: 0.5; } }
    .alert { margin: 0.4rem; padding: var(--kb-space-2) var(--kb-space-3); border-radius: var(--kb-radius-md); background: var(--kb-accent-soft); color: var(--kb-danger); border: 1px solid var(--kb-danger); }
    .muted { color: var(--kb-text-muted); padding: 0.5rem; }
    .truncated { margin: 0.3rem 0.5rem; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .dialog__foot {
      display: flex;
      flex-direction: column;
      gap: var(--kb-space-1);
      padding: var(--kb-space-3) var(--kb-space-4);
      border-top: 1px solid var(--kb-border);
    }
    .selected { margin: 0; font-size: var(--kb-text-sm); overflow-wrap: anywhere; }
    .reassure { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); }
    .actions { display: flex; justify-content: flex-end; gap: var(--kb-space-2); margin-top: var(--kb-space-1); }
    .btn {
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
    .btn--sm { padding: 0.3rem 0.55rem; font-size: var(--kb-text-sm); display: inline-flex; align-items: center; gap: 0.3rem; }
  `,
})
export class FolderPickerComponent {
  private readonly fs = inject(FsService);

  /** Whether the dialog is open. Opening loads roots + the Home listing. */
  readonly open = input(false);
  /** Emits the chosen absolute folder path when the user confirms Connect. */
  readonly chosen = output<string>();
  /** Emits when the user cancels/closes the dialog (Escape, backdrop, Cancel, ✕). */
  readonly cancelled = output<void>();

  private readonly dialogRef = viewChild<ElementRef<HTMLElement>>('dialog');

  protected readonly subtitle = PICKER_SUBTITLE;
  protected readonly footer = PICKER_FOOTER;

  protected readonly places = signal<readonly FsPlace[]>([]);
  protected readonly current = signal<Listing | null>(null);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly selected = signal<string | null>(null);
  protected readonly activeIndex = signal(-1);

  /** Breadcrumb segments derived from the current absolute path (the filesystem root is a separate marker). */
  protected readonly crumbs = computed<readonly FsPlace[]>(() => {
    const path = this.current()?.path;
    if (!path) return [];
    const parts = path.split('/').filter(Boolean);
    const segs: FsPlace[] = [];
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      segs.push({ label: part, path: acc });
    }
    return segs;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.loadRoots();
        this.openPath(undefined);
        queueMicrotask(() => this.dialogRef()?.nativeElement.focus());
      } else {
        this.reset();
      }
    });
  }

  /** The absolute path of a child entry within the current directory. */
  protected pathOf(entry: FsEntry): string {
    const base = this.current()?.path ?? '';
    return base.endsWith('/') ? `${base}${entry.name}` : `${base}/${entry.name}`;
  }

  protected select(entry: FsEntry): void {
    this.selected.set(this.pathOf(entry));
    const entries = this.current()?.entries ?? [];
    this.activeIndex.set(entries.indexOf(entry));
  }

  protected openPath(path: string | undefined): void {
    this.loading.set(true);
    this.listError.set(null);
    this.fs
      .list(path)
      .then((listing) => {
        this.current.set(listing);
        this.selected.set(listing.path);
        this.activeIndex.set(-1);
      })
      .catch((err: unknown) => {
        this.listError.set(err instanceof Error ? err.message : String(err));
      })
      .finally(() => this.loading.set(false));
  }

  protected up(): void {
    const parent = this.current()?.parent;
    if (parent) this.openPath(parent);
  }

  protected confirm(): void {
    const sel = this.selected();
    if (sel) this.chosen.emit(sel);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.cancel();
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        return;
      case 'Enter':
      case 'ArrowRight': {
        const entry = this.activeEntry();
        if (entry) {
          event.preventDefault();
          this.openPath(this.pathOf(entry));
        }
        return;
      }
      case 'Backspace':
      case 'ArrowLeft':
        event.preventDefault();
        this.up();
        return;
      case 'Tab':
        this.trapFocus(event);
        return;
      default:
        return;
    }
  }

  private move(delta: number): void {
    const entries = this.current()?.entries ?? [];
    if (!entries.length) return;
    const next = Math.max(0, Math.min(entries.length - 1, this.activeIndex() + delta));
    this.activeIndex.set(next);
    this.select(entries[next]);
  }

  private activeEntry(): FsEntry | null {
    const entries = this.current()?.entries ?? [];
    const idx = this.activeIndex();
    return idx >= 0 && idx < entries.length ? entries[idx] : null;
  }

  /** Keep Tab focus inside the dialog (a minimal focus trap over the dialog's focusables). */
  private trapFocus(event: KeyboardEvent): void {
    const root = this.dialogRef()?.nativeElement;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private loadRoots(): void {
    this.fs
      .roots()
      .then((r) => this.places.set([...r.roots, ...r.recent]))
      .catch(() => this.places.set([]));
  }

  private reset(): void {
    this.current.set(null);
    this.selected.set(null);
    this.listError.set(null);
    this.activeIndex.set(-1);
  }
}
