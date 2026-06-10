import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { KnowledgeProposal, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { ProposeInboxComponent } from './propose-inbox.component';

const TRAILER: KnowledgeProposal = {
  id: 'p1',
  title: 'Always add the commit trailer',
  content: 'Every commit must end with the agreed Co-Authored-By trailer.',
  suggestedScope: 'common',
  suggestedStack: ['any'],
  suggestedKind: 'rule',
  source: '/kai',
  why: 'seen in 4 tickets across 2 projects',
  proposedAt: '2026-06-10T10:00:00Z',
};

const SIGNALS: KnowledgeProposal = {
  id: 'p2',
  title: 'Angular signals over RxJS for local state',
  content: 'Prefer signals for component-local state.',
  suggestedScope: 'project',
  suggestedStack: ['frontend', 'angular'],
  suggestedKind: 'style',
  source: '/kai',
  why: 'recurring review note',
};

function mount(proposals: readonly KnowledgeProposal[]): {
  fixture: ComponentFixture<ProposeInboxComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ProposeInboxComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(ProposeInboxComponent);
  fixture.componentRef.setInput('proposals', proposals);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function card(host: HTMLElement, id: string): HTMLElement {
  return host.querySelector(`[data-testid="proposal-${id}"]`) as HTMLElement;
}

describe('ProposeInboxComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders nothing when there are no pending proposals (absent, not a zero state)', () => {
    const { host } = mount([]);
    expect(host.querySelector('[data-testid="propose-inbox"]')).toBeNull();
    expect(host.textContent?.trim()).toBe('');
  });

  it('shows the inbox section with a pending count when proposals exist', () => {
    const { host } = mount([TRAILER, SIGNALS]);
    const inbox = host.querySelector('[data-testid="propose-inbox"]');
    expect(inbox).not.toBeNull();
    expect(host.querySelector('[data-testid="propose-count"]')?.textContent).toMatch(/2/);
    // Names the source so the framing is honest about where these came from.
    expect(host.textContent).toMatch(/kai/i);
  });

  it('states honestly that nothing is saved until the operator approves, and where it goes is their choice', () => {
    const { host } = mount([TRAILER]);
    const t = host.textContent ?? '';
    expect(t).toMatch(/nothing is (saved|shared) until you approve/i);
    // No cloud/upload claim on this surface.
    expect(t).not.toMatch(/cloud|uploaded/i);
  });

  it('renders each proposal: its content, suggested scope, tags, and the source/why', () => {
    const { host } = mount([TRAILER]);
    const c = card(host, 'p1');
    expect(c.textContent).toContain('Every commit must end with the agreed Co-Authored-By trailer.');
    expect(c.textContent).toMatch(/common/i);
    expect(c.textContent).toMatch(/rule/i);
    expect(c.textContent).toContain('seen in 4 tickets across 2 projects');
  });

  it('renders proposal content as ESCAPED text — a hostile payload never executes', () => {
    const hostile: KnowledgeProposal = {
      id: 'x',
      title: '<script>window.__xssTitle=1</script>',
      content: '<img src=x onerror="window.__xssBody=1"><script>window.__xssBody=1</script>',
      why: '<script>window.__xssWhy=1</script>',
      source: '<img src=y onerror="window.__xssSource=1">',
      suggestedScope: 'common',
      suggestedStack: ['<script>1</script>'],
      suggestedKind: 'rule',
    };
    const { host } = mount([hostile]);
    expect(host.querySelectorAll('script').length).toBe(0);
    expect(host.querySelectorAll('img[onerror]').length).toBe(0);
    const w = window as unknown as Record<string, unknown>;
    expect(w['__xssTitle']).toBeUndefined();
    expect(w['__xssBody']).toBeUndefined();
    expect(w['__xssWhy']).toBeUndefined();
    expect(w['__xssSource']).toBeUndefined();
    // The literal markup is shown as text, proving interpolation (not innerHTML).
    expect(host.textContent).toContain('<script>window.__xssBody=1</script>');
  });

  it('offers a fixed scope choice as a radiogroup — This project / Common, never a free path field', () => {
    const { host } = mount([TRAILER]);
    const group = card(host, 'p1').querySelector('[data-testid="proposal-scope-p1"]');
    expect(group?.getAttribute('role')).toBe('radiogroup');
    const project = host.querySelector('[data-testid="proposal-scope-p1-project"]');
    const common = host.querySelector('[data-testid="proposal-scope-p1-common"]');
    expect(project?.getAttribute('role')).toBe('radio');
    expect(common?.getAttribute('role')).toBe('radio');
    // No free-text path/folder/dir input anywhere on the card.
    const textInputs = Array.from(card(host, 'p1').querySelectorAll('input[type="text"]')) as HTMLInputElement[];
    expect(textInputs.length).toBe(0);
  });

  it('defaults the scope choice to the suggested scope', () => {
    const { host } = mount([TRAILER, SIGNALS]);
    // TRAILER suggests common.
    expect(host.querySelector('[data-testid="proposal-scope-p1-common"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-testid="proposal-scope-p1-project"]')?.getAttribute('aria-checked')).toBe('false');
    // SIGNALS suggests project.
    expect(host.querySelector('[data-testid="proposal-scope-p2-project"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('defaults to This project (narrowest) when the proposal suggests no scope', () => {
    const { host } = mount([{ id: 'p3', content: 'x' }]);
    expect(host.querySelector('[data-testid="proposal-scope-p3-project"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it("the Approve button's accessible name reflects the chosen scope (no silent over-share)", () => {
    const { fixture, host } = mount([TRAILER]);
    const approve = host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement;
    // Default suggested scope is common.
    expect(approve.getAttribute('aria-label') ?? approve.textContent ?? '').toMatch(/approve as common/i);
    // Switch the scope to This project and the label follows.
    (host.querySelector('[data-testid="proposal-scope-p1-project"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(approve.getAttribute('aria-label') ?? approve.textContent ?? '').toMatch(/approve as this project/i);
  });

  it('posts kb/approve { id, chosen scope } with the X-AIDT guard and emits the returned state', async () => {
    const { fixture, host, http } = mount([TRAILER]);
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    // Operator narrows to This project before approving.
    (host.querySelector('[data-testid="proposal-scope-p1-project"]') as HTMLElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/kb/approve');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body.id).toBe('p1');
    expect(req.request.body.scope).toBe('project');
    const next: ProjectState = {
      rev: 'r2',
      knowledge: { method: 'filename-only', counts: { project: 2, common: 0, proposals: 0 }, proposals: [] },
    };
    req.flush({ ok: true, state: next });
    await settle(fixture);
    expect(applied).not.toBeNull();
    expect((applied as unknown as ProjectState).rev).toBe('r2');
  });

  it('announces the approval (with its scope) on an aria-live region', async () => {
    const { fixture, host, http } = mount([TRAILER]);
    (host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement).click();
    http.expectOne('/api/kb/approve').flush({ ok: true, state: { rev: 'r2', knowledge: { method: 'filename-only', counts: { project: 1, common: 1, proposals: 0 }, proposals: [] } } });
    await settle(fixture);
    const live = host.querySelector('[data-testid="propose-live"]');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.textContent).toMatch(/approved/i);
    expect(live?.textContent).toMatch(/common/i);
  });

  it('posts kb/reject { id } with the X-AIDT guard and emits the returned state', async () => {
    const { fixture, host, http } = mount([TRAILER]);
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    (host.querySelector('[data-testid="proposal-reject-p1"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/kb/reject');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body.id).toBe('p1');
    expect(Object.keys(req.request.body)).toEqual(['id']);
    const next: ProjectState = {
      rev: 'r3',
      knowledge: { method: 'filename-only', counts: { project: 1, common: 0, proposals: 0 }, proposals: [] },
    };
    req.flush({ ok: true, state: next });
    await settle(fixture);
    expect((applied as unknown as ProjectState).rev).toBe('r3');
    expect(host.querySelector('[data-testid="propose-live"]')?.textContent).toMatch(/rejected/i);
  });

  it('the item leaves the inbox when the adopted state carries fewer proposals', async () => {
    const { fixture, host, http } = mount([TRAILER, SIGNALS]);
    expect(card(host, 'p1')).not.toBeNull();
    (host.querySelector('[data-testid="proposal-reject-p1"]') as HTMLButtonElement).click();
    http.expectOne('/api/kb/reject').flush({ ok: true, state: { rev: 'r3' } });
    await settle(fixture);
    // The parent re-feeds the input from the fresh state; simulate that adoption here.
    fixture.componentRef.setInput('proposals', [SIGNALS]);
    fixture.detectChanges();
    expect(card(host, 'p1')).toBeNull();
    expect(card(host, 'p2')).not.toBeNull();
  });

  it('disables the card actions while a decision is in flight and surfaces a terse error on failure', async () => {
    const { fixture, host, http } = mount([TRAILER]);
    (host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement).disabled).toBe(true);
    http.expectOne('/api/kb/approve').flush({ ok: false, error: 'write refused' }, { status: 403, statusText: 'Forbidden' });
    await settle(fixture);
    const err = card(host, 'p1').querySelector('[data-testid="proposal-error-p1"]');
    expect(err?.getAttribute('role')).toBe('alert');
    // Re-enabled so the operator can retry; the proposal stays in the inbox.
    expect((host.querySelector('[data-testid="proposal-approve-p1"]') as HTMLButtonElement).disabled).toBe(false);
    expect(card(host, 'p1')).not.toBeNull();
  });
});
