import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { KnowledgeDoc, KnowledgeView, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { NoteEditorComponent } from './note-editor.component';

const BASE: KnowledgeView = { method: 'filename-only', stack: ['java'], counts: { project: 1, common: 0 }, docs: [] };
const NOTE: KnowledgeDoc = { name: 'code-rules', file: 'docs/code-rules.md', rev: 'm:1', scope: 'project', stack: ['java'], kind: 'rule', index: 'indexed', provenance: 'you' };

function mount(note: KnowledgeDoc | null): {
  fixture: ComponentFixture<NoteEditorComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [NoteEditorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(NoteEditorComponent);
  fixture.componentRef.setInput('open', true);
  fixture.componentRef.setInput('note', note);
  fixture.componentRef.setInput('base', BASE);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function field(host: HTMLElement, id: string): HTMLInputElement | HTMLTextAreaElement {
  return host.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | HTMLTextAreaElement;
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

describe('NoteEditorComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('add mode', () => {
    it('is a focus-trapped dialog and posts kb/add (additive, no expectedRev)', async () => {
      const { fixture, host, http } = mount(null);
      const dialog = host.querySelector('[data-testid="note-editor"]')!;
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      type(field(host, 'note-title'), 'a-new-rule');
      type(field(host, 'note-body'), 'always do X');
      fixture.detectChanges();
      (host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement).click();
      const req = http.expectOne('/api/kb/add');
      expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
      expect(req.request.body).toMatchObject({ title: 'a-new-rule', scope: 'project' });
      req.flush({ ok: true, doc: { name: 'a-new-rule' }, state: { rev: 'r2' } });
      await settle(fixture);
      expect(host.querySelector('[data-testid="note-status"]')?.textContent).toContain('added');
    });
  });

  describe('edit mode', () => {
    it('pre-fills, keeps the title READ-ONLY (rename = add+delete), and says so', () => {
      const { host } = mount(NOTE);
      expect(host.querySelector('[data-testid="note-editor-title"]')?.textContent).toContain('code-rules');
      const title = field(host, 'note-title') as HTMLInputElement;
      expect(title.value).toBe('code-rules');
      expect(title.disabled).toBe(true);
      expect(host.querySelector('[data-testid="note-title-readonly"]')?.textContent).toMatch(/Renaming makes a new note/i);
    });

    it('posts kb/update with the note id/file + the per-note expectedRev (= note.rev)', async () => {
      const { fixture, host, http } = mount(NOTE);
      type(field(host, 'note-body'), 'updated body');
      fixture.detectChanges();
      (host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement).click();
      const req = http.expectOne('/api/kb/update');
      expect(req.request.body).toMatchObject({ file: 'docs/code-rules.md', body: 'updated body', scope: 'project', expectedRev: 'm:1' });
      req.flush({ ok: true, state: { rev: 'r2' } });
      await settle(fixture);
    });

    it('fires the scope-change disclosure only when the scope moves off the loaded value', () => {
      const { fixture, host } = mount(NOTE);
      // No disclosure at rest (scope === loaded 'project').
      expect(host.querySelector('[data-testid="note-scope-change"]')).toBeNull();
      (host.querySelector('[data-testid="note-scope-common"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const disc = host.querySelector('[data-testid="note-scope-change"]')!;
      expect(disc.getAttribute('role')).toBe('status');
      expect(disc.textContent).toMatch(/your other projects on this machine will be able to see this note/i);
      expect(disc.textContent).toMatch(/never a cloud/i);
      // Moving back to the loaded scope clears it (no longer a move).
      (host.querySelector('[data-testid="note-scope-project"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="note-scope-change"]')).toBeNull();
    });

    it('treats a 409 as a first-class conflict: reloads, lifts fresh state, no error toast', async () => {
      const { fixture, host, http } = mount(NOTE);
      let lifted: ProjectState | null = null;
      fixture.componentInstance.applied.subscribe((s) => (lifted = s));
      type(field(host, 'note-body'), 'my edit');
      fixture.detectChanges();
      (host.querySelector('[data-testid="note-submit"]') as HTMLButtonElement).click();
      const fresh: ProjectState = { rev: 'r9', knowledge: { method: 'filename-only', counts: { project: 1, common: 0 }, docs: [{ ...NOTE, rev: 'm:2' }] } };
      http.expectOne('/api/kb/update').flush({ ok: false, conflict: true, state: fresh }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);
      // Reconcile line shown, NO error banner, and the fresh state lifted for the page to re-derive.
      expect(host.querySelector('[data-testid="note-conflict"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="note-error"]')).toBeNull();
      expect(lifted).not.toBeNull();
      expect((lifted as unknown as ProjectState).rev).toBe('r9');
    });
  });

  it('Escape cancels the drawer', () => {
    const { fixture, host } = mount(null);
    let cancelled = false;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled = true));
    host.querySelector('[data-testid="note-editor"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toBe(true);
  });
});
