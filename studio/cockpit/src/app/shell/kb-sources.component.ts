import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KbSource, ProjectState } from '../core/models';
import { FolderPickerComponent } from '../projects/folder-picker.component';
import { GlyphComponent } from './glyph.component';

type RowPhase = 'idle' | 'busy' | 'error';

/**
 * The connected-codebases strip — connect / status / re-index / disconnect, and nothing more.
 * Connecting a codebase registers a folder as a READ-ONLY indexed knowledge source (the backend
 * owns the index; the page never crawls files into the note list). It reuses the existing
 * `dart-folder-picker` over `/api/fs/*` for folder choice — no second picker is built.
 *
 * Each source row leads with honesty: a status glyph + colour + text (never colour alone), the
 * honest "{n} files · {method}" index label (never "semantic" unless an embedder is wired), and a
 * REQUIRED last-indexed freshness marker with a stale state. A ⋯ menu offers Disconnect (which
 * removes the registration only — the folder is untouched, said in the copy). When no source is
 * connected the strip shows ONE quiet invite line (the single deliberate empty-affordance).
 *
 * The Canon seam is data-driven: the row reads `external`/`residency` (both absent/false this slice)
 * so an external overlay row could appear later without a second code path — no overlay control ships.
 *
 * Security: source `label`, `path`, `reason`, and `residency` are UNTRUSTED filesystem/config text
 * and reach the DOM through interpolation only (escaped), never `[innerHTML]`.
 */
@Component({
  selector: 'dart-kb-sources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, FolderPickerComponent],
  template: `
    <section class="strip" aria-labelledby="kb-sources-heading">
      <header class="strip__head">
        <h3 class="strip__title" id="kb-sources-heading">Connected codebases</h3>
        @if (sources().length) {
          <button type="button" class="btn btn--ghost" data-testid="kb-source-connect" (click)="openPicker()">
            <dart-glyph name="folder-stack" [size]="14" /> Connect…
          </button>
        }
      </header>

      @if (sources().length) {
        <ul class="rows" aria-label="Connected codebases">
          @for (s of sources(); track s.id) {
            <li class="row" data-testid="kb-source-row">
              <div class="row__main">
                <span class="row__label">
                  <dart-glyph [name]="s.external ? 'cloud' : 'folder-stack'" [size]="14" /> {{ s.label }}
                </span>
                <span class="row__status" data-testid="kb-source-status" [class]="'row__status--' + statusKind(s)">
                  <dart-glyph [name]="statusGlyph(s)" [size]="12" /> {{ statusText(s) }}
                </span>
              </div>
              <p class="row__path">{{ s.path }}</p>
              <div class="row__meta">
                <span class="row__method" data-testid="kb-source-method">{{ methodLabel(s) }}</span>
                <span class="row__sep" aria-hidden="true">·</span>
                <span class="row__fresh" data-testid="kb-source-freshness" [class.row__fresh--stale]="s.stale">
                  @if (s.stale) { <dart-glyph name="warning" [size]="12" /> stale — re-index }
                  @else { indexed {{ freshness(s) }} }
                </span>
              </div>
              @if (rowError(s.id); as err) {
                <p class="row__err" role="alert">{{ err }}</p>
              }
              <div class="row__actions">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  data-testid="kb-source-reindex"
                  [disabled]="s.status === 'indexing' || rowPhase(s.id) === 'busy'"
                  (click)="reindex(s)"
                >
                  @if (rowPhase(s.id) === 'busy') { <dart-glyph name="spinner" [size]="12" /> } @else { <dart-glyph name="loop" [size]="12" /> }
                  Re-index
                </button>
                <div class="menu">
                  <button
                    type="button"
                    class="btn btn--icon"
                    data-testid="kb-source-menu"
                    [attr.aria-expanded]="menuFor() === s.id"
                    [attr.aria-label]="'More actions for ' + s.label"
                    (click)="toggleMenu(s.id)"
                  >
                    <dart-glyph name="kebab" [size]="16" />
                  </button>
                  @if (menuFor() === s.id) {
                    <div class="menu__pop" role="menu">
                      <button type="button" class="menu__item" role="menuitem" data-testid="kb-source-disconnect" (click)="askDisconnect(s)">
                        <dart-glyph name="cross" [size]="12" /> Disconnect
                      </button>
                    </div>
                  }
                </div>
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="empty" data-testid="kb-source-empty">
          <dart-glyph name="folder-stack" [size]="14" /> Connect a codebase to make it searchable here.
          <button type="button" class="btn btn--ghost btn--sm" data-testid="kb-source-connect" (click)="openPicker()">Connect</button>
        </p>
      }

      @if (confirmDisconnect(); as target) {
        <div class="backdrop" (click)="cancelDisconnect()">
          <div class="confirm" role="alertdialog" aria-modal="true" aria-label="Disconnect codebase" (click)="$event.stopPropagation()">
            <p class="confirm__body">
              Disconnect {{ target.label }}? Its files stop being searchable here. The folder itself is untouched.
            </p>
            <div class="confirm__foot">
              <button type="button" class="btn" data-testid="kb-source-disconnect-cancel" (click)="cancelDisconnect()">Cancel</button>
              <button type="button" class="btn btn--danger" data-testid="kb-source-disconnect-ok" (click)="doDisconnect(target)">Disconnect</button>
            </div>
          </div>
        </div>
      }
    </section>

    <dart-folder-picker [open]="pickerOpen()" (chosen)="onChosen($event)" (cancelled)="closePicker()" />
  `,
  styles: `
    .strip { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .strip__head { display: flex; align-items: center; gap: var(--kb-space-2); }
    .strip__title { margin: 0; margin-right: auto; font-size: var(--kb-text-md, 0.95rem); font-weight: 600; }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .row { display: flex; flex-direction: column; gap: 0.3rem; padding: var(--kb-space-2); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    @media (prefers-reduced-motion: no-preference) { .row { animation: row-arrive var(--kb-dur-base, 0.18s) var(--kb-ease-out, ease-out); } }
    @keyframes row-arrive { from { opacity: 0.4; transform: translateY(0.25rem); } }
    .row__main { display: flex; align-items: center; gap: var(--kb-space-2); flex-wrap: wrap; }
    .row__label { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 600; font-size: var(--kb-text-sm); overflow-wrap: anywhere; }
    .row__status { display: inline-flex; align-items: center; gap: 0.25rem; margin-left: auto; font-size: var(--kb-text-xs); font-weight: 600; }
    .row__status--indexed { color: var(--kb-success); }
    .row__status--indexing { color: var(--kb-warning); }
    .row__status--failed { color: var(--kb-danger); }
    .row__path { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-subtle); overflow-wrap: anywhere; }
    .row__meta { display: flex; align-items: center; gap: 0.35rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .row__sep { color: var(--kb-text-subtle); }
    .row__fresh { display: inline-flex; align-items: center; gap: 0.2rem; }
    .row__fresh--stale { color: var(--kb-warning); font-weight: 600; }
    .row__err { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-danger); }
    .row__actions { display: flex; align-items: center; gap: var(--kb-space-2); }
    .menu { position: relative; margin-left: auto; }
    .menu__pop { position: absolute; right: 0; top: 100%; margin-top: 0.2rem; padding: 0.2rem; background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-shadow: var(--kb-shadow-sm); z-index: 5; }
    .menu__item { display: inline-flex; align-items: center; gap: 0.3rem; width: 100%; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-danger); background: transparent; border: none; border-radius: var(--kb-radius-sm, 0.3rem); cursor: pointer; }
    .menu__item:hover { background: var(--kb-surface-muted); }
    .empty { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin: 0; padding: var(--kb-space-2); font-size: var(--kb-text-sm); color: var(--kb-text-muted); background: var(--kb-surface-muted); border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); }
    .btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); cursor: pointer; }
    .btn:hover { border-color: var(--kb-border-strong); }
    .btn:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .btn--ghost { background: transparent; }
    .btn--sm { padding: 0.2rem 0.45rem; font-size: var(--kb-text-xs); }
    .btn--icon { padding: 0.25rem; min-width: 1.6rem; justify-content: center; }
    .btn--danger { color: #fff; background: var(--kb-danger); border-color: var(--kb-danger); }
    .btn[disabled] { opacity: 0.55; cursor: default; }
    .backdrop { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--kb-space-4); background: rgba(0, 0, 0, 0.55); z-index: 70; }
    .confirm { display: flex; flex-direction: column; gap: var(--kb-space-3); width: min(26rem, 100%); padding: var(--kb-space-4); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-lg); box-shadow: var(--kb-shadow-md); }
    .confirm__body { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text); overflow-wrap: anywhere; }
    .confirm__foot { display: flex; justify-content: flex-end; gap: var(--kb-space-2); }
  `,
})
export class KbSourcesComponent {
  private readonly cp = inject(ControlPlaneService);

  /** The connected sources from the projection; empty → the quiet invite line. */
  readonly sources = input<readonly KbSource[]>([]);
  /** The live project `rev`; threaded as a best-effort hint (the server CASes on the sources rev). */
  readonly stateRev = input<string | undefined>(undefined);
  /** Fresh project state to adopt after connect/reindex/disconnect (or a 409 reconcile). */
  readonly applied = output<ProjectState>();

  private readonly pickerOpen_ = signal(false);
  readonly pickerOpen = this.pickerOpen_.asReadonly();
  private readonly menuFor_ = signal<string | null>(null);
  readonly menuFor = this.menuFor_.asReadonly();
  private readonly confirmDisconnect_ = signal<KbSource | null>(null);
  readonly confirmDisconnect = this.confirmDisconnect_.asReadonly();

  private readonly phaseById = signal<Readonly<Record<string, RowPhase>>>({});
  private readonly errorById = signal<Readonly<Record<string, string>>>({});

  rowPhase(id: string): RowPhase {
    return this.phaseById()[id] ?? 'idle';
  }
  rowError(id: string): string {
    return this.errorById()[id] ?? '';
  }

  /** The status family driving the status colour class (kept off the raw string for unknown values). */
  statusKind(s: KbSource): 'indexed' | 'indexing' | 'failed' {
    if (s.status === 'indexing' || s.status === 'connected') return 'indexing';
    if (s.status === 'failed') return 'failed';
    return 'indexed';
  }
  statusGlyph(s: KbSource): string {
    const kind = this.statusKind(s);
    return kind === 'failed' ? 'warning' : kind === 'indexing' ? 'spinner' : 'check';
  }
  statusText(s: KbSource): string {
    const kind = this.statusKind(s);
    if (kind === 'indexing') return 'indexing…';
    if (kind === 'failed') return s.reason ? `index failed — ${s.reason}` : 'index failed';
    return 'indexed';
  }

  /** The honest "{n} files · {method}" label — never claims semantic without a real embedder. */
  methodLabel(s: KbSource): string {
    const n = typeof s.fileCount === 'number' ? s.fileCount : 0;
    const method = s.method === 'semantic' ? 'semantic' : 'filename';
    return `${n} files · ${method}`;
  }

  /** A coarse relative-time freshness marker for the last index; "just now" under a minute. */
  freshness(s: KbSource): string {
    if (!s.lastIndexedAt) return 'recently';
    const then = Date.parse(s.lastIndexedAt);
    if (Number.isNaN(then)) return 'recently';
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  openPicker(): void {
    this.menuFor_.set(null);
    this.pickerOpen_.set(true);
  }
  closePicker(): void {
    this.pickerOpen_.set(false);
  }

  toggleMenu(id: string): void {
    this.menuFor_.update((cur) => (cur === id ? null : id));
  }

  async onChosen(path: string): Promise<void> {
    this.pickerOpen_.set(false);
    const res = await this.cp.connectKbSource({ path, expectedRev: this.stateRev() });
    if (res.ok === true || res.ok === 'conflict') {
      if (res.state) this.applied.emit(res.state);
    }
    // A connect failure surfaces no row to attach to; the projection is unchanged (the strip is
    // honest by absence). A future inline banner can attach here if product wants the reason shown.
  }

  async reindex(s: KbSource): Promise<void> {
    if (this.rowPhase(s.id) === 'busy') return;
    this.setPhase(s.id, 'busy');
    this.setError(s.id, '');
    const res = await this.cp.reindexKbSource(s.id, this.stateRev());
    if (res.ok === true || res.ok === 'conflict') {
      this.setPhase(s.id, 'idle');
      if (res.state) this.applied.emit(res.state);
    } else {
      this.setPhase(s.id, 'error');
      this.setError(s.id, 'Couldn’t re-index — try again.');
    }
  }

  askDisconnect(s: KbSource): void {
    this.menuFor_.set(null);
    this.confirmDisconnect_.set(s);
  }
  cancelDisconnect(): void {
    this.confirmDisconnect_.set(null);
  }

  async doDisconnect(s: KbSource): Promise<void> {
    this.confirmDisconnect_.set(null);
    const res = await this.cp.disconnectKbSource(s.id, this.stateRev());
    if ((res.ok === true || res.ok === 'conflict') && res.state) this.applied.emit(res.state);
  }

  private setPhase(id: string, phase: RowPhase): void {
    this.phaseById.update((m) => ({ ...m, [id]: phase }));
  }
  private setError(id: string, error: string): void {
    this.errorById.update((m) => ({ ...m, [id]: error }));
  }
}
