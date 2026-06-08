import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { ProjectState, TicketView } from '../core/models';
import { BOARD_COLUMNS, type ColumnKey, groupByColumn, nextStage, ticketNeedsYou } from './board';
import { gateStateView } from './gate-view';
import { GlyphComponent } from './glyph.component';
import { TaskDetailComponent } from './task-detail.component';

/** A short gate-state chip for a card: the gate name plus its current state glyph + text + shape. */
interface CardGateChip {
  readonly name: string;
  readonly shape: 'hard' | 'soft';
  readonly glyph: string;
  readonly tone: string;
  readonly text: string;
}

/** A column with its tickets — every column is rendered even when empty (slim placeholder). */
interface ColumnView {
  readonly key: ColumnKey;
  readonly label: string;
  readonly glyph: string;
  readonly tickets: readonly TicketView[];
}

const COLUMN_GLYPH: Readonly<Record<ColumnKey, string>> = {
  in_progress: 'progress',
  waiting: 'dot',
  blocked: 'blocked',
  done: 'check',
};

/**
 * Tasks board — columns by real status (needsYou is a card chip, never a column), task cards with
 * a kebab advance menu, and a focus-trapped detail modal opened from a card. The board is a pure
 * projection of the single `state` input; the shell refreshes it on every SSE push, so a CLI
 * agent's change appears live — cards re-bucket, counts update, and the open detail refreshes in
 * place because the selected ticket is re-derived from the latest state by id (not snapshotted).
 *
 * Advance rides the guarded control plane with the current `rev`; a 409 surfaces an inline conflict
 * on the card and the shell adopts the returned fresh state. Untrusted card text (title, assignee)
 * is interpolated only — never `[innerHTML]`.
 */
@Component({
  selector: 'dart-tasks-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent, TaskDetailComponent],
  template: `
    @if (isEmpty()) {
      <p class="board-empty" data-testid="board-empty">No tasks yet — the team will create them as work starts.</p>
    } @else {
      <div class="board" role="list" aria-label="Tasks by status">
        @for (col of columns(); track col.key) {
          <section class="col" [attr.data-testid]="'column-' + col.key" role="listitem">
            <header class="col__head" [class]="'col__head--' + col.key">
              <dart-glyph [name]="col.glyph" />
              <span class="col__label">{{ col.label }}</span>
              <span class="col__count" data-testid="column-count">{{ col.tickets.length }}</span>
            </header>
            <ul class="col__cards" role="list">
              @for (t of col.tickets; track t.id) {
                <li class="card" [attr.data-testid]="'card-' + t.id" role="listitem">
                  <button type="button" class="card__open" data-testid="card-open" (click)="openDetail(t)">
                    <span class="card__id">{{ t.id }}</span>
                    <span class="card__title">{{ t.title }}</span>
                    <span class="card__owner"><dart-glyph name="agent" /> {{ t.assignee || t.expectedOwner || 'unassigned' }}</span>
                    <span class="card__gates">
                      @for (g of cardGates(t); track g.name) {
                        <span class="chip" [class]="'tone--' + g.tone" [attr.data-shape]="g.shape">
                          <dart-glyph [name]="g.glyph" /> {{ g.name }} {{ g.text }}
                        </span>
                      }
                      @if (needsYou(t)) {
                        <span class="chip chip--need" data-testid="chip-needs-you"><dart-glyph name="need" /> needs you</span>
                      }
                    </span>
                  </button>

                  <div class="card__menuwrap">
                    <button type="button" class="card__kebab" data-testid="card-menu" [attr.aria-expanded]="menuFor() === t.id" aria-haspopup="menu" aria-label="Task actions" (click)="toggleMenu(t.id ?? '')">
                      <dart-glyph name="kebab" />
                    </button>
                    @if (menuFor() === t.id) {
                      <div class="menu" role="menu">
                        @if (advanceTarget(t); as to) {
                          <button type="button" class="menu__item" role="menuitem" data-testid="menu-advance" [disabled]="busyFor() === t.id" (click)="advance(t, to)">
                            <dart-glyph name="advance" /> Advance to {{ to }}
                          </button>
                        } @else {
                          <span class="menu__none" data-testid="menu-no-advance">No further stage</span>
                        }
                        <button type="button" class="menu__item" role="menuitem" data-testid="menu-open" (click)="openDetail(t)">Open detail</button>
                      </div>
                    }
                  </div>

                  @if (conflictFor() === t.id) {
                    <p class="card__conflict" role="alert" data-testid="card-conflict">
                      <dart-glyph name="conflict" /> This task changed elsewhere — reloaded.
                      @if (advanceTarget(t); as to) {
                        <button type="button" class="card__retry" data-testid="card-retry" (click)="advance(t, to)">Retry advance</button>
                      }
                    </p>
                  }
                  @if (errorFor() === t.id) {
                    <p class="card__conflict" role="alert" data-testid="card-error"><dart-glyph name="cross" /> {{ errorText() }}</p>
                  }
                </li>
              } @empty {
                <li class="col__empty" [attr.data-testid]="'column-empty-' + col.key">Nothing {{ col.label.toLowerCase() }}.</li>
              }
            </ul>
          </section>
        }
      </div>
    }

    @if (selected(); as sel) {
      <dart-task-detail
        [ticket]="sel"
        [gateDefs]="state().gateDefs ?? []"
        [tracks]="state().tracks ?? {}"
        [rev]="state().rev ?? ''"
        (applied)="applied.emit($event)"
        (close)="closeDetail()"
      />
    }
  `,
  styles: `
    .board-empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .board { display: grid; grid-template-columns: repeat(4, minmax(12rem, 1fr)); gap: var(--kb-space-3); align-items: start; }
    .col { display: flex; flex-direction: column; gap: var(--kb-space-2); min-width: 0; }
    .col__head { display: flex; align-items: center; gap: 0.4rem; padding-bottom: 0.3rem; border-bottom: 2px solid var(--kb-border); font-weight: 600; }
    .col__head--in_progress { color: var(--kb-accent); }
    .col__head--waiting { color: var(--kb-text-subtle); }
    .col__head--blocked { color: var(--kb-danger); }
    .col__head--done { color: var(--kb-success); }
    .col__label { font-size: var(--kb-text-sm); }
    .col__count { margin-left: auto; font-size: var(--kb-text-sm); color: var(--kb-text-muted); }
    .col__cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .col__empty { color: var(--kb-text-subtle); font-size: var(--kb-text-xs); font-style: italic; padding: var(--kb-space-2); border: 1px dashed var(--kb-border); border-radius: var(--kb-radius-md); }
    .card { position: relative; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); }
    .card__open { display: flex; flex-direction: column; gap: 0.3rem; width: 100%; padding: var(--kb-space-2); text-align: left; background: transparent; border: none; color: inherit; cursor: pointer; font: inherit; }
    .card__id { font-family: var(--kb-font-mono, monospace); font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .card__title { font-weight: 600; font-size: var(--kb-text-sm); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .card__owner { display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .card__gates { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .chip { display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.05rem 0.35rem; font-size: var(--kb-text-xs); border: 1px solid var(--kb-border); border-radius: 999px; }
    .chip[data-shape='soft'] { border-style: dashed; }
    .chip--need { color: var(--kb-warning); border-color: var(--kb-warning); }
    .tone--success { color: var(--kb-success); }
    .tone--danger { color: var(--kb-danger); }
    .tone--muted { color: var(--kb-text-muted); }
    .card__menuwrap { position: absolute; top: var(--kb-space-2); right: var(--kb-space-2); }
    .card__kebab { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; color: var(--kb-text-muted); background: transparent; border: 1px solid transparent; border-radius: var(--kb-radius-md); cursor: pointer; }
    .card__kebab:hover { border-color: var(--kb-border); color: var(--kb-text); }
    .menu { position: absolute; top: 1.9rem; right: 0; z-index: 5; min-width: 11rem; display: flex; flex-direction: column; background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-md); box-shadow: var(--kb-shadow-md, 0 6px 20px rgba(0,0,0,0.3)); overflow: hidden; }
    .menu__item { display: flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.6rem; text-align: left; background: transparent; border: none; color: var(--kb-text); cursor: pointer; font: inherit; font-size: var(--kb-text-sm); }
    .menu__item:hover { background: var(--kb-surface-muted); }
    .menu__none { padding: 0.45rem 0.6rem; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .card__conflict { display: flex; align-items: center; gap: 0.35rem; margin: 0; padding: 0.3rem var(--kb-space-2) var(--kb-space-2); color: var(--kb-warning); font-size: var(--kb-text-xs); }
    .card__retry, .card__kebab + .card__conflict button { font: inherit; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); background: transparent; border: none; cursor: pointer; text-decoration: underline; }
  `,
})
export class TasksBoardComponent {
  private readonly cp = inject(ControlPlaneService);

  readonly state = input.required<ProjectState>();
  /** A successful (or conflict-resync) mutation returns fresh state for the shell to adopt. */
  readonly applied = output<ProjectState>();

  private readonly openId = signal<string | null>(null);
  readonly menuFor = signal<string | null>(null);
  readonly busyFor = signal<string | null>(null);
  readonly conflictFor = signal<string | null>(null);
  readonly errorFor = signal<string | null>(null);
  readonly errorText = signal('');

  private readonly tickets = computed<readonly TicketView[]>(() => this.state().tickets ?? []);
  readonly isEmpty = computed(() => this.tickets().length === 0);

  readonly columns = computed<readonly ColumnView[]>(() => {
    const grouped = groupByColumn(this.tickets());
    return BOARD_COLUMNS.map((c) => ({ key: c.key, label: c.label, glyph: COLUMN_GLYPH[c.key], tickets: grouped[c.key] }));
  });

  /** The open ticket, re-derived from the latest state by id so live pushes refresh it in place. */
  readonly selected = computed<TicketView | null>(() => {
    const id = this.openId();
    return id ? (this.tickets().find((t) => t.id === id) ?? null) : null;
  });

  needsYou(ticket: TicketView): boolean {
    return ticketNeedsYou(ticket);
  }

  advanceTarget(ticket: TicketView): string | null {
    return nextStage(ticket, this.state().tracks);
  }

  cardGates(ticket: TicketView): readonly CardGateChip[] {
    return (ticket.gates ?? []).map((g) => {
      const view = gateStateView(g.state);
      return { name: g.name, shape: g.refusal === 'soft' ? 'soft' : 'hard', glyph: view.glyph, tone: view.tone, text: view.text };
    });
  }

  toggleMenu(id: string): void {
    this.menuFor.update((cur) => (cur === id ? null : id));
  }

  openDetail(ticket: TicketView): void {
    this.menuFor.set(null);
    this.openId.set(ticket.id ?? null);
  }

  closeDetail(): void {
    this.openId.set(null);
  }

  async advance(ticket: TicketView, toStage: string): Promise<void> {
    const id = ticket.id ?? '';
    this.menuFor.set(null);
    this.busyFor.set(id);
    this.conflictFor.set(null);
    this.errorFor.set(null);
    const res = await this.cp.advance({ id, toStage, expectedRev: this.state().rev ?? '', by: '/you' });
    this.busyFor.set(null);
    if (res.ok === true) {
      if (res.state) this.applied.emit(res.state);
    } else if (res.ok === 'conflict') {
      this.conflictFor.set(id);
      if (res.state) this.applied.emit(res.state);
    } else {
      this.errorFor.set(id);
      this.errorText.set(`Couldn't advance: ${res.error}`);
    }
  }
}
