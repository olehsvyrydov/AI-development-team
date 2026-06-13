import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState, WorkflowView } from '../core/models';
import { TasksBoardComponent } from './tasks-board.component';
import { settle } from '../testing/settle';

/**
 * The Workflow drawer (Preset / Labels / Rules) is the home for the workflow-level settings that do
 * not fit a chain node. It is reached from edit-mode (the "Workflow settings" affordance) or by a
 * stage's `rules N` pill (deep-linked to that stage's rules). It drives the SAME shared controller as
 * the chain, so a preset switch is one CAS on the single guarded chokepoint. Exercised through the
 * board (its host).
 */

const WF: WorkflowView = {
  activeTrack: 'full',
  stages: [
    { stage: 'vision', owner: '/po', gate: null },
    { stage: 'code', owner: '/be', gate: null },
    { stage: 'done', owner: null, gate: null },
  ],
};

const STATE: ProjectState = {
  rev: 'r1',
  preset: 'solo',
  project: 'p-drawer',
  workflowView: WF,
  tracks: { full: ['vision', 'code', 'done'] },
  gateDefs: [],
  labels: [],
  rules: [],
  taskSummary: { total: 2, byStatus: { in_progress: 2, waiting: 0, needsYou: 0, blocked: 0, done: 0 } },
  tickets: [
    { id: 'V-1', title: 'Vision', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
    { id: 'C-1', title: 'Coding', status: 'in_progress', stage: 'code', track: 'full', assignee: '/be', gates: [], comments: [] },
  ],
};

function mount(): {
  fixture: ComponentFixture<TasksBoardComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  localStorage.setItem('dart.tasks.viewMode.p-drawer', 'pipeline');
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TasksBoardComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() }],
  });
  const fixture = TestBed.createComponent(TasksBoardComponent);
  fixture.componentRef.setInput('state', STATE);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

function $(host: HTMLElement, sel: string): HTMLElement {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

function armEdit(host: HTMLElement, fixture: ComponentFixture<TasksBoardComponent>): void {
  $(host, '[data-testid="pipeline-mode-edit"]').click();
  fixture.detectChanges();
}

describe('Workflow drawer (AC8) — Preset / Labels / Rules in a side drawer', () => {
  let http: HttpTestingController;
  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('the edit-mode Workflow settings affordance opens a drawer with Preset / Labels / Rules tabs', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    expect(host.querySelector('[data-testid="workflow-drawer"]')).toBeNull();
    $(host, '[data-testid="pipeline-workflow-settings"]').click();
    fixture.detectChanges();
    const drawer = $(host, '[data-testid="workflow-drawer"]');
    expect(drawer.getAttribute('role')).toBe('dialog');
    expect(host.querySelector('[data-testid="workflow-tab-preset"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="workflow-tab-labels"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="workflow-tab-rules"]')).toBeTruthy();
  });

  it('switching the preset commits one preset CAS through the shared chokepoint', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-workflow-settings"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="preset-regulated"]').click();
    const req = http.expectOne('/api/preset');
    expect(req.request.body.preset).toBe('regulated');
    expect(req.request.body.expectedRev).toBe('r1');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2', preset: 'regulated' } });
    await settle(fixture);
  });

  it('saving a label from the Labels tab commits one set-labels CAS with expectedRev', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-workflow-settings"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="workflow-tab-labels"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-starter-TO_DEV_BE"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="label-save"]').click();
    const req = http.expectOne('/api/workflow/set-labels');
    expect(req.request.body.expectedRev).toBe('r1');
    expect(req.request.body.labels['TO_DEV_BE']).toBeTruthy();
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('saving a rule from the deep-linked Rules tab commits one set-rules CAS with expectedRev', async () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="rules-pill-code"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="rule-add-code"]').click();
    fixture.detectChanges();
    const name = $(host, '[data-testid="rule-name"]') as HTMLInputElement;
    name.value = 'ping';
    name.dispatchEvent(new Event('input'));
    $(host, '[data-testid="rule-add-action"]').click();
    fixture.detectChanges();
    const actType = $(host, '[data-testid="action-type-0"]') as HTMLSelectElement;
    actType.value = 'route_to_stage';
    actType.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const actStage = $(host, '[data-testid="action-stage-0"]') as HTMLSelectElement;
    actStage.value = 'vision';
    actStage.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    $(host, '[data-testid="rule-save"]').click();
    const req = http.expectOne('/api/workflow/set-rules');
    expect(req.request.body.expectedRev).toBe('r1');
    expect(req.request.body.rules.some((r: { id: string }) => r.id === 'ping')).toBe(true);
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it("a stage's rules pill deep-links the drawer to that stage's rules", () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="rules-pill-code"]').click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="workflow-drawer"]')).toBeTruthy();
    expect($(host, '[data-testid="workflow-tab-rules"]').getAttribute('aria-selected')).toBe('true');
    expect(($(host, '[data-testid="workflow-rules-stage"]') as HTMLSelectElement).value).toBe('code');
  });

  it('Escape closes the drawer', () => {
    const { host, fixture, http: h } = mount();
    http = h;
    armEdit(host, fixture);
    $(host, '[data-testid="pipeline-workflow-settings"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="workflow-drawer"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="workflow-drawer"]')).toBeNull();
  });
});
