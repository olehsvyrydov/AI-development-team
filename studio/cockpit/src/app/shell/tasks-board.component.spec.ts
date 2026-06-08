import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { TasksBoardComponent } from './tasks-board.component';

const STATE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  tracks: { full: ['vision', 'code', 'security', 'done'] },
  gateDefs: [
    { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops' },
  ],
  taskSummary: { total: 4, byStatus: { in_progress: 2, waiting: 0, blocked: 1, done: 1, needsYou: 1 } },
  tickets: [
    { id: 'ADT-1', title: 'First task', status: 'in_progress', stage: 'code', track: 'full', assignee: '/fe',
      gates: [{ name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed' }], comments: [] },
    { id: 'ADT-2', title: 'Second task', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/be',
      gates: [], comments: [] },
    { id: 'ADT-3', title: 'Blocked task', status: 'blocked', stage: 'security', track: 'full', assignee: '/be',
      gates: [{ name: 'SECOPS_APPROVED', refusal: 'hard', state: 'rejected' }], comments: [] },
    { id: 'ADT-4', title: 'Done task', status: 'done', stage: 'done', track: 'full', assignee: '/qa', gates: [], comments: [] },
  ],
};

function mount(state: ProjectState): { fixture: ComponentFixture<TasksBoardComponent>; host: HTMLElement; http: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [TasksBoardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(TasksBoardComponent);
  fixture.componentRef.setInput('state', state);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('TasksBoardComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders one column per real status with a header count, and not a needsYou column', () => {
    const { host } = mount(STATE);
    expect(host.querySelector('[data-testid="column-in_progress"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="column-waiting"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="column-blocked"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="column-done"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="column-needsYou"]')).toBeNull();
    expect(host.querySelector('[data-testid="column-in_progress"] [data-testid="column-count"]')?.textContent).toContain('2');
    expect(host.querySelector('[data-testid="column-blocked"] [data-testid="column-count"]')?.textContent).toContain('1');
  });

  it('places each card in its status column and shows id, escaped title, and assignee', () => {
    const { host } = mount(STATE);
    const inProgress = host.querySelector('[data-testid="column-in_progress"]')!;
    expect(inProgress.textContent).toContain('ADT-1');
    expect(inProgress.textContent).toContain('First task');
    expect(inProgress.textContent).toContain('/fe');
    expect(host.querySelector('[data-testid="column-blocked"]')!.textContent).toContain('ADT-3');
  });

  it('escapes an untrusted card title (no HTML injection on the board)', () => {
    const xss: ProjectState = { ...STATE, tickets: [{ id: 'X', title: '<img src=x onerror=alert(1)>', status: 'in_progress', stage: 'code', gates: [], comments: [] }] };
    const { host } = mount(xss);
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows a needs-you chip on a card with a rejected hard gate (chip, not a column)', () => {
    const { host } = mount(STATE);
    const blocked = host.querySelector('[data-testid="card-ADT-3"]')!;
    expect(blocked.querySelector('[data-testid="chip-needs-you"]')).toBeTruthy();
    const ok = host.querySelector('[data-testid="card-ADT-1"]')!;
    expect(ok.querySelector('[data-testid="chip-needs-you"]')).toBeNull();
  });

  it('shows a muted empty placeholder for a column with no tasks (never vanishes)', () => {
    const { host } = mount(STATE);
    const waiting = host.querySelector('[data-testid="column-waiting"]')!;
    expect(waiting.textContent).toMatch(/nothing/i);
  });

  it('advance menu posts toStage (the next stage) with the current rev and the X-AIDT guard', async () => {
    const { fixture, host, http } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const advance = host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement;
    expect(advance.textContent).toMatch(/security/);
    advance.click();
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1' });
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('surfaces a 409 on advance as an inline conflict on the card with a retry', async () => {
    const { fixture, host, http } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-menu"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="menu-advance"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/ticket/advance');
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    const card = host.querySelector('[data-testid="card-ADT-1"]')!;
    expect(card.querySelector('[data-testid="card-conflict"]')).toBeTruthy();
    expect(card.textContent).toMatch(/changed|retry/i);
  });

  it('opens the detail modal when a card is activated and emits applied state up', () => {
    const { fixture, host } = mount(STATE);
    let applied: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (applied = s));
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="detail-header"]')!.textContent).toContain('ADT-1');
    // closing removes it
    (host.querySelector('[data-testid="detail-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(applied).toBeNull();
  });

  it('the open detail reflects a live state push without closing', () => {
    const { fixture, host } = mount(STATE);
    (host.querySelector('[data-testid="card-ADT-1"] [data-testid="card-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const live: ProjectState = {
      ...STATE,
      rev: 'r2',
      tickets: STATE.tickets!.map((t) => (t.id === 'ADT-1' ? { ...t, comments: [{ id: 'k', author: '/x', ts: '2026-06-08T10:00:00Z', body: 'pushed live' }] } : t)),
    };
    fixture.componentRef.setInput('state', live);
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="comments"]')!.textContent).toContain('pushed live');
  });

  it('shows the empty board invitation when there are no tickets', () => {
    const { host } = mount({ ...STATE, tickets: [], taskSummary: { total: 0, byStatus: { in_progress: 0, waiting: 0, blocked: 0, done: 0, needsYou: 0 } } });
    expect(host.textContent).toMatch(/No tasks yet/i);
  });
});
