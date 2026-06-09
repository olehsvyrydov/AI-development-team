import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { KnowledgeView, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { AddNoteFormComponent } from './add-note-form.component';

const FILENAME_ONLY: KnowledgeView = {
  method: 'filename-only',
  stack: ['java'],
  counts: { project: 8, common: 0 },
  docs: [{ name: 'code-rules', scope: 'project', stack: ['java'], kind: 'rule', index: 'filename-only' }],
};

const SEMANTIC: KnowledgeView = {
  method: 'local-embeddings',
  stack: ['python'],
  counts: { project: 3, common: 0 },
  docs: [],
};

function mount(base: KnowledgeView | null = FILENAME_ONLY): {
  fixture: ComponentFixture<AddNoteFormComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [AddNoteFormComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(AddNoteFormComponent);
  fixture.componentRef.setInput('base', base);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function field(host: HTMLElement, testid: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return host.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

function submitButton(host: HTMLElement): HTMLButtonElement {
  return host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement;
}

function scopePick(host: HTMLElement, scope: string): HTMLElement {
  return host.querySelector(`[data-testid="note-scope-${scope}"]`) as HTMLElement;
}

describe('AddNoteFormComponent (scoped)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a required title field and a markdown body textarea, both labelled', () => {
    const { host } = mount();
    const title = field(host, 'note-title');
    const body = field(host, 'note-body');
    expect(title.tagName).toBe('INPUT');
    expect(title.hasAttribute('required')).toBe(true);
    expect(title.getAttribute('aria-label') || host.querySelector(`label[for="${title.id}"]`)).toBeTruthy();
    expect(body.tagName).toBe('TEXTAREA');
    expect(body.getAttribute('aria-label') || host.querySelector(`label[for="${body.id}"]`)).toBeTruthy();
  });

  it('reassures that nothing is uploaded — this is a local write', () => {
    const { host } = mount();
    expect(host.textContent).toMatch(/nothing is uploaded/i);
  });

  it('offers a scope picker as a radiogroup with fixed This project / Common enum (never a free path)', () => {
    const { host } = mount();
    const group = host.querySelector('[data-testid="note-scope"]');
    expect(group?.getAttribute('role')).toBe('radiogroup');
    const project = scopePick(host, 'project');
    const common = scopePick(host, 'common');
    expect(project.getAttribute('role')).toBe('radio');
    expect(common.getAttribute('role')).toBe('radio');
    expect(project.textContent).toMatch(/This project/i);
    expect(common.textContent).toMatch(/Common/i);
    // No free-text path input anywhere in the form.
    const textInputs = Array.from(host.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    expect(textInputs.some((i) => /path|folder|dir|file/i.test(i.getAttribute('placeholder') ?? i.id))).toBe(false);
  });

  it('defaults the scope to This project (the narrowest, least-sharing choice)', () => {
    const { host } = mount();
    expect(scopePick(host, 'project').getAttribute('aria-checked')).toBe('true');
    expect(scopePick(host, 'common').getAttribute('aria-checked')).toBe('false');
  });

  it('explains Common as shared across your own projects on this machine, never a cloud', () => {
    const { fixture, host } = mount();
    scopePick(host, 'common').click();
    fixture.detectChanges();
    const t = host.textContent ?? '';
    expect(t).toMatch(/this machine/i);
    // Honest framing: Common is local to the operator's own machine, never a cloud.
    expect(t).toMatch(/never a cloud/i);
    // No claim that anything is synced/uploaded to a cloud.
    expect(t).not.toMatch(/(synced|uploaded|stored|saved)\s+to\s+(the\s+)?cloud/i);
  });

  it('offers optional stack and kind tag controls', () => {
    const { host } = mount();
    expect(field(host, 'note-stack')).toBeTruthy();
    expect(field(host, 'note-kind')).toBeTruthy();
  });

  it('posts { title, body, scope, stack, kind } to /api/kb/add with the X-AIDT guard', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title') as HTMLInputElement, 'Code review rules');
    type(field(host, 'note-body') as HTMLTextAreaElement, '# rules\nbe kind');
    scopePick(host, 'common').click();
    fixture.detectChanges();
    (field(host, 'note-stack') as HTMLSelectElement).value = 'java';
    field(host, 'note-stack').dispatchEvent(new Event('change'));
    (field(host, 'note-kind') as HTMLSelectElement).value = 'rule';
    field(host, 'note-kind').dispatchEvent(new Event('change'));
    fixture.detectChanges();
    submitButton(host).click();
    const req = http.expectOne('/api/kb/add');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body.title).toBe('Code review rules');
    expect(req.request.body.body).toBe('# rules\nbe kind');
    expect(req.request.body.scope).toBe('common');
    expect(req.request.body.stack).toEqual(['java']);
    expect(req.request.body.kind).toBe('rule');
    req.flush({ ok: true, doc: { name: 'code-review-rules', file: 'kb/code-review-rules.md', scope: 'common', stack: ['java'], kind: 'rule' }, state: { rev: 'r2' } });
    await settle(fixture);
  });

  it('emits the returned state on success so the shell can adopt it', async () => {
    const { fixture, host, http } = mount();
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    type(field(host, 'note-title') as HTMLInputElement, 'New note');
    fixture.detectChanges();
    submitButton(host).click();
    const next: ProjectState = { rev: 'r2', knowledge: { method: 'filename-only', stack: ['java'], counts: { project: 9, common: 0 }, docs: [{ name: 'new-note', scope: 'project', stack: ['any'], kind: 'context', index: 'filename-only' }] } };
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'new-note', file: 'docs/new-note.md', scope: 'project', stack: ['any'], kind: 'context' }, state: next });
    await settle(fixture);
    expect(applied).not.toBeNull();
    expect((applied as unknown as ProjectState).knowledge?.counts.project).toBe(9);
  });

  it('clears the form and confirms with an aria-live announcement on success', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title') as HTMLInputElement, 'New note');
    type(field(host, 'note-body') as HTMLTextAreaElement, 'some body');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'new-note', file: 'docs/new-note.md', scope: 'project' }, state: { rev: 'r2' } });
    await settle(fixture);
    expect((field(host, 'note-title') as HTMLInputElement).value).toBe('');
    expect((field(host, 'note-body') as HTMLTextAreaElement).value).toBe('');
    const live = host.querySelector('[data-testid="note-status"]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toMatch(/added/i);
  });

  it('blocks an oversize body client-side before sending and shows a too-large message', () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title') as HTMLInputElement, 'Big note');
    type(field(host, 'note-body') as HTMLTextAreaElement, 'x'.repeat(64 * 1024 + 1));
    fixture.detectChanges();
    expect(submitButton(host).disabled).toBe(true);
    expect(host.textContent).toMatch(/too large/i);
    submitButton(host).click();
    http.expectNone('/api/kb/add');
  });

  it('surfaces a server 400 without changing anything, form preserved', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title') as HTMLInputElement, '...');
    type(field(host, 'note-body') as HTMLTextAreaElement, 'keep me');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: false, error: 'title cannot be turned into a filename' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    const err = host.querySelector('[data-testid="note-error"]');
    expect(err?.getAttribute('role')).toBe('alert');
    expect((field(host, 'note-body') as HTMLTextAreaElement).value).toBe('keep me');
  });

  it('surfaces a 403 write-guard refusal honestly', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title') as HTMLInputElement, 'Note');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: false, error: 'write refused' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(host.querySelector('[data-testid="note-error"]')?.textContent).toMatch(/refused|guard/i);
  });

  it('previews the body as escaped/inert text — a script payload never executes', () => {
    const { fixture, host } = mount();
    type(field(host, 'note-body') as HTMLTextAreaElement, '<img src=x onerror="window.__xssNote=1"><script>window.__xssNote=1</script>');
    fixture.detectChanges();
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    expect(host.querySelectorAll('script').length).toBe(0);
    expect((window as unknown as Record<string, unknown>)['__xssNote']).toBeUndefined();
  });

  it('shows the honest indexing preview for a filename-only base', () => {
    const { host } = mount(FILENAME_ONLY);
    const preview = host.querySelector('[data-testid="note-index-preview"]')?.textContent ?? '';
    expect(preview).toMatch(/filename/i);
  });

  it('shows the honest indexing preview for a semantic base', () => {
    const { host } = mount(SEMANTIC);
    const preview = host.querySelector('[data-testid="note-index-preview"]')?.textContent ?? '';
    expect(preview).toMatch(/semantic/i);
  });

  it('emits cancel without posting', () => {
    const { fixture, host, http } = mount();
    let cancelled = false;
    fixture.componentInstance.cancel.subscribe(() => (cancelled = true));
    (host.querySelector('[data-testid="note-cancel"]') as HTMLButtonElement).click();
    expect(cancelled).toBe(true);
    http.expectNone('/api/kb/add');
  });
});
