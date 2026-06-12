import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlPlaneService } from '../core/control-plane.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { AskResult } from '../core/control-plane.service';
import type { KnowledgeAnswer } from '../core/models';
import { KnowledgeQaComponent } from './knowledge-qa.component';
import { settle } from '../testing/settle';

/** A control plane whose `askKnowledge` is stubbed so the component is tested in isolation. */
function stubCp(answer: AskResult): { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async () => answer);
  return { ask };
}

function mount(stub: { ask: ReturnType<typeof vi.fn> }): ComponentFixture<KnowledgeQaComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [KnowledgeQaComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
      { provide: ControlPlaneService, useValue: { askKnowledge: stub.ask } },
    ],
  });
  const fixture = TestBed.createComponent(KnowledgeQaComponent);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<KnowledgeQaComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function input(h: HTMLElement): HTMLInputElement {
  return h.querySelector('[data-testid="qa-input"]') as HTMLInputElement;
}

function form(h: HTMLElement): HTMLFormElement {
  return h.querySelector('[data-testid="qa-form"]') as HTMLFormElement;
}

async function ask(fixture: ComponentFixture<KnowledgeQaComponent>, question: string): Promise<void> {
  const h = host(fixture);
  const field = input(h);
  field.value = question;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  form(h).dispatchEvent(new Event('submit'));
  await settle(fixture);
}

const LEXICAL: KnowledgeAnswer = {
  answer: 'Filename/keyword match in this project: webhook-retry.',
  matches: [{ name: 'webhook-retry', scope: 'project', snippet: 'retry with exponential backoff' }],
  grounding: {
    method: 'filename-only',
    source: 'filename-only',
    external: false,
    label: 'Filename/keyword match only — no embedder configured, so this is not a semantic understanding check.',
  },
  egressDisclosed: false,
};

const OVERLAY: KnowledgeAnswer = {
  answer: 'The service understood this as retry-with-backoff.',
  matches: [{ name: 'memory-1', scope: 'overlay', score: 0.91 }],
  grounding: {
    method: 'overlay',
    source: 'openmemory',
    external: true,
    residency: 'local-service',
    label: 'Answered by your connected memory service openmemory (external).',
  },
  egressDisclosed: true,
};

const ABSENCE: KnowledgeAnswer = {
  answer: "No note found on this topic in this project's scope.",
  matches: [],
  grounding: {
    method: 'none',
    source: 'filename-only',
    external: false,
    label: "No note found on this topic in this project's scope.",
  },
  egressDisclosed: false,
};

describe('Knowledge Q&A', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders a labelled question field and an accessible Ask button', () => {
    const h = host(mount(stubCp({ ok: true, answer: ABSENCE })));
    const field = input(h);
    expect(field).toBeTruthy();
    const labelledBy = field.getAttribute('aria-label') || field.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const button = h.querySelector('[data-testid="qa-ask"]') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect((button.getAttribute('aria-label') || button.textContent || '').toLowerCase()).toContain('ask');
  });

  it('submitting the form asks the question and renders the answer text', async () => {
    const stub = stubCp({ ok: true, answer: LEXICAL });
    const fixture = mount(stub);
    await ask(fixture, 'how do we retry webhooks?');
    expect(stub.ask).toHaveBeenCalledWith('how do we retry webhooks?');
    const region = host(fixture).querySelector('[data-testid="qa-answer"]') as HTMLElement;
    expect(region.textContent).toContain('Filename/keyword match in this project');
  });

  it('renders the honest grounding label verbatim from the backend', async () => {
    const fixture = mount(stubCp({ ok: true, answer: LEXICAL }));
    await ask(fixture, 'retry');
    const grounding = host(fixture).querySelector('[data-testid="qa-grounding"]') as HTMLElement;
    expect(grounding.textContent).toContain('not a semantic understanding check');
  });

  it('renders the matched note title and snippet', async () => {
    const fixture = mount(stubCp({ ok: true, answer: LEXICAL }));
    await ask(fixture, 'retry');
    const h = host(fixture);
    expect(h.querySelector('[data-testid="qa-match"]')?.textContent).toContain('webhook-retry');
    expect(h.textContent).toContain('retry with exponential backoff');
  });

  it('shows the truthful external-service indicator when egressDisclosed is true', async () => {
    const fixture = mount(stubCp({ ok: true, answer: OVERLAY }));
    await ask(fixture, 'retry');
    const h = host(fixture);
    const egress = h.querySelector('[data-testid="qa-egress"]') as HTMLElement;
    expect(egress).toBeTruthy();
    expect(egress.textContent?.toLowerCase()).toContain('external');
    expect(egress.textContent).toContain('local-service');
  });

  it('shows NO external claim and NO absolute-privacy string when egressDisclosed is false', async () => {
    const fixture = mount(stubCp({ ok: true, answer: LEXICAL }));
    await ask(fixture, 'retry');
    const h = host(fixture);
    expect(h.querySelector('[data-testid="qa-egress"]')).toBeNull();
    expect(h.textContent || '').not.toMatch(/100% private|nothing (ever )?leaves|fully local|never touches the cloud/i);
  });

  it('renders the honest-absence case plainly', async () => {
    const fixture = mount(stubCp({ ok: true, answer: ABSENCE }));
    await ask(fixture, 'unicorns');
    const region = host(fixture).querySelector('[data-testid="qa-answer"]') as HTMLElement;
    expect(region.textContent).toContain('No note found on this topic');
    expect(host(fixture).querySelector('[data-testid="qa-match"]')).toBeNull();
  });

  it('escapes a hostile note snippet — it renders as text, never executed markup', async () => {
    const hostile: KnowledgeAnswer = {
      ...LEXICAL,
      matches: [{ name: 'evil', scope: 'project', snippet: '<img src=x onerror="window.__xss=1">' }],
    };
    const fixture = mount(stubCp({ ok: true, answer: hostile }));
    await ask(fixture, 'x');
    const h = host(fixture);
    expect(h.querySelector('img')).toBeNull();
    expect((globalThis as Record<string, unknown>)['__xss']).toBeUndefined();
    expect(h.textContent).toContain('<img src=x onerror=');
  });

  it('escapes a hostile overlay answer — rendered as text, not executed', async () => {
    const hostile: KnowledgeAnswer = {
      ...OVERLAY,
      answer: '<script>window.__xss2=1</script>understood as backoff',
    };
    const fixture = mount(stubCp({ ok: true, answer: hostile }));
    await ask(fixture, 'x');
    const h = host(fixture);
    expect(h.querySelector('script')).toBeNull();
    expect((globalThis as Record<string, unknown>)['__xss2']).toBeUndefined();
    expect(h.querySelector('[data-testid="qa-answer"]')?.textContent).toContain('<script>');
  });

  it('announces a loading state while the question is in flight', async () => {
    let resolve!: (r: AskResult) => void;
    const ask = vi.fn(() => new Promise<AskResult>((r) => (resolve = r)));
    const fixture = mount({ ask });
    const h = host(fixture);
    input(h).value = 'slow';
    input(h).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    form(h).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(h.querySelector('[data-testid="qa-loading"]')).toBeTruthy();
    resolve({ ok: true, answer: ABSENCE });
    await settle(fixture);
    expect(h.querySelector('[data-testid="qa-loading"]')).toBeNull();
  });

  it('does not ask on an empty/whitespace question', async () => {
    const stub = stubCp({ ok: true, answer: ABSENCE });
    const fixture = mount(stub);
    await ask(fixture, '   ');
    expect(stub.ask).not.toHaveBeenCalled();
  });

  it('surfaces a terse error when the read fails, without a stack trace', async () => {
    const fixture = mount(stubCp({ ok: false, error: 'unavailable' }));
    await ask(fixture, 'x');
    const err = host(fixture).querySelector('[data-testid="qa-error"]') as HTMLElement;
    expect(err).toBeTruthy();
    expect(err.textContent?.toLowerCase()).toContain("couldn't");
  });
});
