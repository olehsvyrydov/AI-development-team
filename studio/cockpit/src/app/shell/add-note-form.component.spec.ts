import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { BaseView, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { AddNoteFormComponent } from './add-note-form.component';

const FILENAME_ONLY: BaseView = {
  method: 'filename-only',
  counts: { indexed: 8, indexing: 0, failed: 0 },
  docs: [{ name: 'code-rules', index: 'filename-only' }],
};

const SEMANTIC: BaseView = {
  method: 'local-embeddings',
  counts: { indexed: 3, indexing: 0, failed: 0 },
  docs: [],
};

function mount(base: BaseView | null = FILENAME_ONLY): {
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

function field(host: HTMLElement, testid: string): HTMLInputElement | HTMLTextAreaElement {
  return host.querySelector(`[data-testid="${testid}"]`) as HTMLInputElement | HTMLTextAreaElement;
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

function submitButton(host: HTMLElement): HTMLButtonElement {
  return host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement;
}

describe('AddNoteFormComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders a required title field and a markdown body textarea, both labelled', () => {
    const { host } = mount();
    const title = field(host, 'note-title');
    const body = field(host, 'note-body');
    expect(title).toBeTruthy();
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

  it('shows a live body size counter against the 64 KB limit', () => {
    const { fixture, host } = mount();
    type(field(host, 'note-body'), 'hello');
    fixture.detectChanges();
    const counter = host.querySelector('[data-testid="note-size"]')?.textContent ?? '';
    expect(counter).toMatch(/5/);
    expect(counter).toMatch(/64\s*KB/i);
  });

  it('disables submit until a non-empty title is entered', () => {
    const { fixture, host } = mount();
    expect(submitButton(host).disabled).toBe(true);
    type(field(host, 'note-title'), '   ');
    fixture.detectChanges();
    expect(submitButton(host).disabled).toBe(true);
    type(field(host, 'note-title'), 'Code review rules');
    fixture.detectChanges();
    expect(submitButton(host).disabled).toBe(false);
  });

  it('posts ONLY { title, body } to /api/kb/add with the X-AIDT guard', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), 'Code review rules');
    type(field(host, 'note-body'), '# rules\nbe kind');
    fixture.detectChanges();
    submitButton(host).click();
    const req = http.expectOne('/api/kb/add');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({ title: 'Code review rules', body: '# rules\nbe kind' });
    expect(Object.keys(req.request.body)).toEqual(['title', 'body']);
    req.flush({ ok: true, doc: { name: 'code-review-rules', file: 'docs/code-review-rules.md' }, state: { rev: 'r2' } });
    await settle(fixture);
  });

  it('emits the returned state on success so the shell can adopt it (count/list refresh)', async () => {
    const { fixture, host, http } = mount();
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    type(field(host, 'note-title'), 'New note');
    fixture.detectChanges();
    submitButton(host).click();
    const next: ProjectState = { rev: 'r2', base: { method: 'filename-only', counts: { indexed: 9, indexing: 0, failed: 0 }, docs: [{ name: 'new-note', index: 'filename-only' }] } };
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'new-note', file: 'docs/new-note.md' }, state: next });
    await settle(fixture);
    expect(applied).not.toBeNull();
    expect((applied as unknown as ProjectState).base?.counts.indexed).toBe(9);
  });

  it('clears the form and confirms with an aria-live announcement on success', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), 'New note');
    type(field(host, 'note-body'), 'some body');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'new-note', file: 'docs/new-note.md' }, state: { rev: 'r2' } });
    await settle(fixture);
    expect((field(host, 'note-title') as HTMLInputElement).value).toBe('');
    expect((field(host, 'note-body') as HTMLTextAreaElement).value).toBe('');
    const live = host.querySelector('[data-testid="note-status"]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toMatch(/added/i);
  });

  it('names the file the server actually created on a duplicate-name collision', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), 'Code rules');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: true, doc: { name: 'code-rules-2', file: 'docs/code-rules-2.md' }, state: { rev: 'r2' } });
    await settle(fixture);
    expect(host.querySelector('[data-testid="note-status"]')?.textContent).toContain('code-rules-2');
  });

  it('blocks an oversize body client-side before sending and shows a too-large message', () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), 'Big note');
    type(field(host, 'note-body'), 'x'.repeat(64 * 1024 + 1));
    fixture.detectChanges();
    expect(submitButton(host).disabled).toBe(true);
    expect(host.textContent).toMatch(/too large/i);
    submitButton(host).click();
    http.expectNone('/api/kb/add');
  });

  it('surfaces a server 400 (e.g. unslugable title) without changing anything, form preserved', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), '...');
    type(field(host, 'note-body'), 'keep me');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: false, error: 'title cannot be turned into a filename' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    const err = host.querySelector('[data-testid="note-error"]');
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toMatch(/filename|letters|numbers/i);
    // form values preserved for retry
    expect((field(host, 'note-body') as HTMLTextAreaElement).value).toBe('keep me');
  });

  it('surfaces a 403 write-guard refusal honestly', async () => {
    const { fixture, host, http } = mount();
    type(field(host, 'note-title'), 'Note');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: false, error: 'write refused' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    expect(host.querySelector('[data-testid="note-error"]')?.textContent).toMatch(/refused|guard/i);
  });

  it('does not emit applied state on an error (the Base list stays unchanged)', async () => {
    const { fixture, host, http } = mount();
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    type(field(host, 'note-title'), 'Note');
    fixture.detectChanges();
    submitButton(host).click();
    http.expectOne('/api/kb/add').flush({ ok: false, error: 'boom' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(applied).toBeNull();
  });

  it('previews the body as escaped/inert text — a script payload never executes', () => {
    const { fixture, host } = mount();
    type(field(host, 'note-body'), '<img src=x onerror="window.__xssNote=1"><script>window.__xssNote=1</script>');
    fixture.detectChanges();
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    expect(host.querySelectorAll('script').length).toBe(0);
    expect((window as unknown as Record<string, unknown>)['__xssNote']).toBeUndefined();
  });

  it('shows the honest indexing preview for a filename-only base', () => {
    const { host } = mount(FILENAME_ONLY);
    const preview = host.querySelector('[data-testid="note-index-preview"]')?.textContent ?? '';
    expect(preview).toMatch(/filename/i);
    expect(preview).not.toMatch(/semantic recall via embeddings/i);
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
