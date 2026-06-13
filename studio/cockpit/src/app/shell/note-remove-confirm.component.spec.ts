import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { KnowledgeDoc, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { NoteRemoveConfirmComponent } from './note-remove-confirm.component';

const NOTE: KnowledgeDoc = { name: 'code-rules', file: 'docs/code-rules.md', rev: 'm:1', scope: 'project', index: 'indexed' };

function mount(note: KnowledgeDoc = NOTE): {
  fixture: ComponentFixture<NoteRemoveConfirmComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [NoteRemoveConfirmComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(NoteRemoveConfirmComponent);
  fixture.componentRef.setInput('open', true);
  fixture.componentRef.setInput('note', note);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('NoteRemoveConfirmComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('is an alertdialog echoing the name + scope + the honest consequence', () => {
    const { host } = mount();
    const dialog = host.querySelector('[data-testid="note-remove-confirm"]')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('code-rules');
    expect(dialog.textContent).toContain('Project');
    expect(dialog.textContent).toMatch(/Your agents stop following it/i);
    expect(dialog.textContent).toMatch(/can't be undone here/i);
  });

  it('holds INITIAL FOCUS on Cancel (the destructive default is never auto-focused)', async () => {
    const { fixture, host } = mount();
    await settle(fixture);
    expect(document.activeElement).toBe(host.querySelector('[data-testid="note-remove-confirm-cancel"]'));
  });

  it('Cancel and Escape both emit cancelled without removing', () => {
    const { fixture, host } = mount();
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    (host.querySelector('[data-testid="note-remove-confirm-cancel"]') as HTMLButtonElement).click();
    host.querySelector('[data-testid="note-remove-confirm"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toBe(2);
  });

  it('confirms → kb/remove with the per-note expectedRev, then lifts fresh state', async () => {
    const { fixture, host, http } = mount();
    let lifted: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (lifted = s));
    (host.querySelector('[data-testid="note-remove-confirm-ok"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/kb/remove');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ file: 'docs/code-rules.md', scope: 'project', expectedRev: 'm:1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    await settle(fixture);
    expect((lifted as unknown as ProjectState)?.rev).toBe('r2');
  });

  it('treats a 409 as first-class: HOLDS the confirm, shows refresh, lifts fresh state, no blind delete', async () => {
    const { fixture, host, http } = mount();
    let lifted: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (lifted = s));
    (host.querySelector('[data-testid="note-remove-confirm-ok"]') as HTMLButtonElement).click();
    http.expectOne('/api/kb/remove').flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    // The dialog is still open (held), shows the reconcile line, and lifted fresh state.
    expect(host.querySelector('[data-testid="note-remove-confirm"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="note-remove-conflict"]')).toBeTruthy();
    expect((lifted as unknown as ProjectState)?.rev).toBe('r9');
  });

  it('escapes a hostile note name (no script execution)', () => {
    const evil = '<img src=x onerror="window.__xssRm=1">';
    const { host } = mount({ ...NOTE, name: evil });
    expect([...host.querySelectorAll('img')].filter((el) => el.hasAttribute('onerror'))).toEqual([]);
    expect((window as unknown as Record<string, unknown>)['__xssRm']).toBeUndefined();
  });
});
