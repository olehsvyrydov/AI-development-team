import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TaskSummary } from '../core/models';

interface StatusRow {
  readonly key: 'in_progress' | 'needsYou' | 'blocked' | 'done' | 'waiting';
  readonly label: string;
  readonly count: number;
}

/**
 * Tasks panel — an at-a-glance status summary of a project's tickets. Counts come straight from
 * the hub-derived `taskSummary`; each count pairs a glyph, a colour, and a text label so status is
 * never carried by colour alone. A decorative stacked proportion bar visualises the mix — the
 * numbers above it are the source of truth, and each bar segment exposes its count via aria-label.
 *
 * Absent-not-zero: when there is no summary, or every bucket is zero, the panel shows an
 * invitation rather than a grid of zeros.
 */
@Component({
  selector: 'dart-tasks-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ph">
      <span class="ph__tile ph__tile--tasks" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="3" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <polyline points="4.5,8 6.5,10 9.5,5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="14" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="14" y1="11" x2="21" y2="11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="4" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <line x1="4" y1="21" x2="21" y2="21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </span>
      <h2 class="ph__title">Tasks</h2>
      @if (!isEmpty()) {
        <span class="ph__count" data-testid="tasks-total">{{ summary()!.total }}</span>
      }
    </header>

    <hr class="ph__rule" aria-hidden="true" />

    @if (isEmpty()) {
      <p class="ph__empty" data-testid="tasks-empty">No tasks yet — the team will create them as work starts.</p>
    } @else {
      <ul class="counts" aria-label="Tasks by status">
        @for (row of rows(); track row.key) {
          <li class="count" [class]="'count--' + row.key" [attr.data-testid]="'count-' + row.key">
            <span class="count__glyph" aria-hidden="true">
              @switch (row.key) {
                @case ('in_progress') {
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
                    <rect x="4" y="4" width="8" height="16" fill="currentColor" stroke="none" />
                  </svg>
                }
                @case ('needsYou') {
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <path d="M6 3 h12 M6 21 h12 M7 3 c0 5 4 6 5 9 c1 -3 5 -4 5 -9 M7 21 c0 -5 4 -6 5 -9 c1 3 5 4 5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                }
                @case ('blocked') {
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
                    <line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                }
                @case ('done') {
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <polyline points="5,12 10,17 19,7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                }
                @default {
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
                  </svg>
                }
              }
            </span>
            <span class="count__num">{{ row.count }}</span>
            <span class="count__label">{{ row.label }}</span>
          </li>
        }
      </ul>

      <div class="bar" data-testid="tasks-bar" aria-hidden="true">
        @for (seg of segments(); track seg.key) {
          <span class="bar__seg" [class]="'bar__seg--' + seg.key" [style.flexGrow]="seg.count" [attr.aria-label]="seg.count + ' ' + seg.label"></span>
        }
      </div>
    }

    <hr class="ph__rule" aria-hidden="true" />

    <button
      type="button"
      class="ph__foot"
      data-testid="tasks-open-board"
      disabled
      aria-disabled="true"
      aria-label="Open board (coming soon)"
    >
      Open board
      <span class="ph__soon">soon</span>
      <svg class="ph__arrow" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14">
        <polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--kb-space-2); height: 100%; }
    .ph { display: flex; align-items: center; gap: var(--kb-space-2); }
    .ph__tile { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: var(--kb-radius-md); }
    .ph__tile--tasks { background: color-mix(in srgb, var(--kb-success) 16%, transparent); color: var(--kb-success); }
    .ph__title { margin: 0; font-size: var(--kb-text-lg); font-weight: 600; margin-right: auto; }
    .ph__count { font-size: var(--kb-text-lg); font-weight: 700; color: var(--kb-text); }
    .ph__rule { width: 100%; margin: 0; border: none; border-top: 1px solid var(--kb-border); }
    .ph__empty { margin: 0; color: var(--kb-text-subtle); font-size: var(--kb-text-sm); }
    .counts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--kb-space-1) var(--kb-space-3); }
    .count { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--kb-text-sm); }
    .count__glyph { flex: none; display: inline-flex; }
    .count__num { font-weight: 700; }
    .count__label { color: var(--kb-text-muted); }
    .count--in_progress { color: var(--kb-accent); }
    .count--needsYou { color: var(--kb-warning); }
    .count--blocked { color: var(--kb-danger); }
    .count--done { color: var(--kb-success); }
    .count--waiting { color: var(--kb-text-subtle); }
    .bar { display: flex; height: 0.5rem; border-radius: 999px; overflow: hidden; background: var(--kb-surface-muted); }
    .bar__seg { display: block; min-width: 0; }
    .bar__seg--in_progress { background: var(--kb-accent); }
    .bar__seg--needsYou { background: var(--kb-warning); }
    .bar__seg--blocked { background: var(--kb-danger); }
    .bar__seg--done { background: var(--kb-success); }
    .bar__seg--waiting { background: var(--kb-text-subtle); }
    .ph__foot { margin-top: auto; display: inline-flex; align-items: center; gap: 0.25rem; align-self: flex-start; padding: 0; font: inherit; color: var(--kb-text-subtle); background: transparent; border: none; text-decoration: none; font-size: var(--kb-text-sm); font-weight: 600; }
    .ph__foot[disabled], .ph__foot[aria-disabled='true'] { cursor: default; }
    .ph__soon { padding: 0 0.3rem; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-text-subtle); background: var(--kb-surface-muted); border-radius: 999px; }
    .ph__arrow { flex: none; opacity: 0.6; }
  `,
})
export class TasksPanelComponent {
  readonly summary = input.required<TaskSummary | null>();

  readonly isEmpty = computed(() => {
    const s = this.summary();
    return !s || s.total <= 0;
  });

  readonly rows = computed<readonly StatusRow[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const by = s.byStatus;
    const ordered: readonly StatusRow[] = [
      { key: 'in_progress', label: 'in progress', count: by.in_progress },
      { key: 'needsYou', label: 'need you', count: by.needsYou },
      { key: 'blocked', label: 'blocked', count: by.blocked },
      { key: 'done', label: 'done', count: by.done },
      { key: 'waiting', label: 'waiting', count: by.waiting },
    ];
    return ordered.filter((r) => r.key !== 'waiting' || r.count > 0);
  });

  readonly segments = computed(() => this.rows().filter((r) => r.count > 0));
}
