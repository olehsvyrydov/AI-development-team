import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ControlPlaneService } from '../core/control-plane.service';
import type { KnowledgeAnswer } from '../core/models';
import { GlyphComponent } from './glyph.component';

type Phase = 'idle' | 'busy' | 'error';

/**
 * Interpretation-check Q&A over the project's already-visible knowledge — "does DART understand my
 * note on X?". The operator types a question; on submit the panel reads `GET /api/knowledge/ask`
 * (a read, never a mutation) for the viewed project and renders the answer the backend assembled.
 *
 * Honesty contract (rendered verbatim, never strengthened):
 * - The answer carries a grounding LABEL the backend wrote — filename/keyword match, a local
 *   semantic score, or an external overlay — and this panel shows that label as-is. It never
 *   invents a stronger claim ("it understood") than the evidence the backend reported.
 * - The egress indicator is driven SOLELY by the answer's `egressDisclosed` flag: it appears only
 *   when an external overlay was actually queried (and then names the residency tier), and is
 *   absent for a purely-local answer. The panel prints no absolute "100% private" assurance — a
 *   local answer simply carries its local grounding label, nothing more.
 *
 * Security: the answer text, the matched note titles + snippets, and any overlay response are
 * UNTRUSTED (project files / an external service). They reach the DOM through interpolation only
 * (escaped) — never `[innerHTML]`, never a sanitizer bypass — so a hostile snippet or overlay
 * answer renders as inert text and cannot execute.
 */
@Component({
  selector: 'dart-knowledge-qa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GlyphComponent],
  template: `
    <section class="qa" aria-labelledby="qa-heading">
      <h3 class="qa__title" id="qa-heading">Ask the knowledge base</h3>
      <p class="qa__hint" id="qa-hint">Check what DART actually holds on a topic in this project's scope.</p>

      <form class="qa__form" data-testid="qa-form" (submit)="onSubmit($event)">
        <input
          #q
          type="text"
          class="qa__input"
          data-testid="qa-input"
          name="question"
          aria-label="Question for the knowledge base"
          aria-describedby="qa-hint"
          autocomplete="off"
          placeholder="e.g. how do we retry webhooks?"
          [value]="question()"
          [disabled]="phase() === 'busy'"
          (input)="onInput($event)"
        />
        <button
          type="submit"
          class="qa__ask"
          data-testid="qa-ask"
          aria-label="Ask the knowledge base"
          [disabled]="phase() === 'busy' || !canAsk()"
        >
          @if (phase() === 'busy') { <dart-glyph name="spinner" [size]="14" /> } @else { <dart-glyph name="search" [size]="14" /> }
          Ask
        </button>
      </form>

      @if (phase() === 'busy') {
        <p class="qa__loading" data-testid="qa-loading" role="status" aria-live="polite">Asking the knowledge base…</p>
      }

      <div class="qa__result" role="region" aria-live="polite" aria-label="Answer">
        @if (phase() === 'error') {
          <p class="qa__error" data-testid="qa-error" role="alert"><dart-glyph name="cross" [size]="12" /> {{ errorText() }}</p>
        } @else if (answer(); as a) {
          <p class="qa__answer" data-testid="qa-answer">{{ a.answer }}</p>

          @if (a.egressDisclosed) {
            <p class="qa__egress" data-testid="qa-egress"><dart-glyph name="cloud" [size]="12" /> {{ egressLine(a) }}</p>
          }

          <p class="qa__grounding" data-testid="qa-grounding">{{ a.grounding.label }}</p>

          @if (a.matches.length) {
            <ul class="qa__matches" aria-label="Matched notes">
              @for (m of a.matches; track $index) {
                <li class="qa__match" data-testid="qa-match">
                  <span class="qa__match-name">{{ m.name }}</span>
                  @if (m.snippet) {
                    <span class="qa__match-snippet">{{ m.snippet }}</span>
                  }
                </li>
              }
            </ul>
          }
        }
      </div>
    </section>
  `,
  styles: `
    .qa { display: flex; flex-direction: column; gap: var(--kb-space-2); }
    .qa__title { margin: 0; font-size: var(--kb-text-md, 0.95rem); font-weight: 600; color: var(--kb-text); }
    .qa__hint { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .qa__form { display: flex; gap: var(--kb-space-2); align-items: stretch; }
    .qa__input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: var(--kb-text-sm); color: var(--kb-text); background: var(--kb-surface); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm, 0.3rem); padding: 0.3rem 0.5rem; }
    .qa__input:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .qa__input[disabled] { opacity: 0.6; }
    .qa__ask { display: inline-flex; align-items: center; gap: 0.3rem; flex: none; padding: 0.3rem 0.7rem; font: inherit; font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-accent-contrast, #fff); background: var(--kb-accent); border: 1px solid var(--kb-accent); border-radius: var(--kb-radius-md); cursor: pointer; }
    .qa__ask:focus-visible { outline: 2px solid var(--kb-focus-ring); outline-offset: 2px; }
    .qa__ask[disabled] { opacity: 0.55; cursor: default; }
    .qa__loading { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .qa__result { display: flex; flex-direction: column; gap: 0.35rem; }
    .qa__answer { margin: 0; font-size: var(--kb-text-sm); color: var(--kb-text); white-space: pre-wrap; overflow-wrap: anywhere; }
    .qa__egress { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-xs); font-weight: 600; color: var(--kb-accent); }
    .qa__grounding { margin: 0; font-size: var(--kb-text-xs); color: var(--kb-text-muted); }
    .qa__matches { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
    .qa__match { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.3rem 0.4rem; background: var(--kb-surface-muted); border: 1px solid var(--kb-border); border-radius: var(--kb-radius-sm, 0.3rem); }
    .qa__match-name { font-size: var(--kb-text-sm); font-weight: 600; color: var(--kb-text); overflow-wrap: anywhere; }
    .qa__match-snippet { font-size: var(--kb-text-xs); color: var(--kb-text-muted); overflow-wrap: anywhere; }
    .qa__error { display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: var(--kb-text-sm); color: var(--kb-danger); }
  `,
})
export class KnowledgeQaComponent {
  private readonly cp = inject(ControlPlaneService);

  private readonly question_ = signal('');
  readonly question = this.question_.asReadonly();

  private readonly phase_ = signal<Phase>('idle');
  readonly phase = this.phase_.asReadonly();

  private readonly answer_ = signal<KnowledgeAnswer | null>(null);
  readonly answer = this.answer_.asReadonly();

  private readonly error_ = signal('');
  readonly errorText = this.error_.asReadonly();

  /** Enabled only with a non-blank question, so a submit cannot fire an empty read. */
  readonly canAsk = computed(() => this.question_().trim().length > 0);

  onInput(event: Event): void {
    this.question_.set((event.target as HTMLInputElement).value);
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const q = this.question_().trim();
    if (!q || this.phase_() === 'busy') return;
    this.error_.set('');
    this.phase_.set('busy');
    const res = await this.cp.askKnowledge(q);
    if (res.ok) {
      this.answer_.set(res.answer);
      this.phase_.set('idle');
    } else {
      this.answer_.set(null);
      this.error_.set("Couldn't reach the knowledge base — try again.");
      this.phase_.set('error');
    }
  }

  /** The truthful egress sentence, shown only when an overlay actually answered. */
  egressLine(a: KnowledgeAnswer): string {
    const residency = a.grounding.residency ? ` · ${a.grounding.residency}` : '';
    return `Answered using your external memory service (external)${residency}`;
  }
}
