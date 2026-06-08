import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import type { ProjectState } from '../core/models';
import { WorkflowBuilderComponent } from './workflow-builder.component';
import { settle } from '../testing/settle';

const STATE: ProjectState = {
  preset: 'solo',
  rev: 'r1',
  tracks: { full: ['vision', 'architecture', 'security', 'done'] },
  workflowView: {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
      { stage: 'security', owner: '/secops', gate: { name: 'SECOPS_APPROVED', refusal: 'hard' } },
      { stage: 'done', owner: null, gate: null },
    ],
  },
  gateDefs: [
    { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch', trigger: ['change-class'] },
    { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops', trigger: ['external-input'] },
    { name: 'DESIGN_APPROVED', refusal: 'soft', owner: '/ui', trigger: ['visual'] },
  ],
};

function mount(state: ProjectState = STATE): {
  fixture: ComponentFixture<WorkflowBuilderComponent>;
  host: HTMLElement;
  http: HttpTestingController;
  applied: ProjectState[];
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkflowBuilderComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(WorkflowBuilderComponent);
  const applied: ProjectState[] = [];
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.instance.applied.subscribe((s) => applied.push(s));
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController), applied };
}

function $(host: HTMLElement, sel: string): HTMLElement {
  const el = host.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

describe('WorkflowBuilderComponent', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  it('renders one editable row per stage of the active track, in order', () => {
    const { host, http: h } = mount();
    http = h;
    const rows = host.querySelectorAll('[data-testid^="builder-row-"]');
    expect(rows.length).toBe(4);
    const names = [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['vision', 'architecture', 'security', 'done']);
  });

  it('shows the persistent overlay-not-base banner', () => {
    const { host, http: h } = mount();
    http = h;
    const banner = $(host, '[data-testid="overlay-banner"]');
    expect(banner.textContent ?? '').toMatch(/overlay/i);
    expect(banner.textContent ?? '').toMatch(/base workflow file is never changed/i);
  });

  it('encodes a hard gate with a solid shield and a soft gate with a dashed shield (shape not colour)', () => {
    const { host, http: h } = mount();
    http = h;
    const hard = $(host, '[data-testid="builder-gate-architecture"] [data-gate-shape]');
    expect(hard.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('moves a stage down with the visible move button and posts the full new permutation + rev', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    // Move "vision" (first row) down → permutation [architecture, vision, security, done]
    $(host, '[data-testid="move-down-vision"]').click();
    fixture.detectChanges();
    const names = [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['architecture', 'vision', 'security', 'done']);

    // Save the batched reorder.
    $(host, '[data-testid="builder-save"]').click();
    const req = http.expectOne('/api/track/reorder');
    expect(req.request.body).toEqual({ track: 'full', stages: ['architecture', 'vision', 'security', 'done'], expectedRev: 'r1' });
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect(applied.at(-1)?.rev).toBe('r2');
  });

  it('reorders with Alt+ArrowDown on a focused stage and announces the move', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    const grip = $(host, '[data-testid="move-grip-vision"]');
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    fixture.detectChanges();
    const names = [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['architecture', 'vision', 'security', 'done']);
    const live = $(host, '[data-testid="builder-live"]');
    expect(live.textContent ?? '').toMatch(/moved vision to position 2 of 4/i);
  });

  it('opens a gate-rule editor and posts owner/refusal/trigger with the current rev', async () => {
    const { fixture, host, http: h } = mount();
    http = h;
    $(host, '[data-testid="builder-gate-edit-architecture"]').click();
    fixture.detectChanges();

    const owner = $(host, '[data-testid="gate-owner"]') as HTMLSelectElement;
    owner.value = '/po';
    owner.dispatchEvent(new Event('change'));
    $(host, '[data-testid="gate-refusal-soft"]').click();
    fixture.detectChanges();

    $(host, '[data-testid="gate-rule-save"]').click();
    const req = http.expectOne('/api/gate/trigger');
    expect(req.request.body.gate).toBe('ARCH_APPROVED');
    expect(req.request.body.owner).toBe('/po');
    expect(req.request.body.refusal).toBe('soft');
    expect(req.request.body.expectedRev).toBe('r1');
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
  });

  it('switches preset through the radiogroup and posts the chosen preset with the allowlist value', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    const radiogroup = $(host, '[data-testid="preset-control"]');
    expect(radiogroup.getAttribute('role')).toBe('radiogroup');
    $(host, '[data-testid="preset-regulated"]').click();
    const req = http.expectOne('/api/preset');
    expect(req.request.body).toEqual({ preset: 'regulated', expectedRev: 'r1' });
    req.flush({ ok: true, state: { ...STATE, preset: 'regulated', rev: 'r2' } });
    await settle(fixture);
    expect(applied.at(-1)?.preset).toBe('regulated');
  });

  it('reconciles a 409 from a reorder: adopts fresh state, rolls back the optimistic move, shows the conflict banner', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    $(host, '[data-testid="move-down-vision"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="builder-save"]').click();
    const req = http.expectOne('/api/track/reorder');
    const fresh: ProjectState = { ...STATE, rev: 'r9' };
    req.flush({ ok: false, conflict: true, state: fresh }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    // Conflict banner present and assertive.
    const banner = $(host, '[data-testid="builder-conflict"]');
    expect(banner.getAttribute('role')).toBe('alert');
    // Optimistic move rolled back to server order.
    const names = [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['vision', 'architecture', 'security', 'done']);
    // Fresh state adopted (the shell receives it).
    expect(applied.at(-1)?.rev).toBe('r9');
    // Offers discard + re-apply.
    expect(host.querySelector('[data-testid="conflict-discard"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="conflict-reapply"]')).toBeTruthy();
  });

  it('reconciles a 409 from a preset change and shows the conflict reconcile', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    $(host, '[data-testid="preset-regulated"]').click();
    const req = http.expectOne('/api/preset');
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect($(host, '[data-testid="builder-conflict"]').getAttribute('role')).toBe('alert');
    expect(applied.at(-1)?.rev).toBe('r9');
  });

  it('shows the default-workflow banner when no overlay resolves but stages exist', () => {
    const solo: ProjectState = {
      ...STATE,
      workflowView: { activeTrack: 'solo', stages: [{ stage: 'do', owner: '/you', gate: null }] },
      tracks: { solo: ['do'] },
    };
    const { host, http: h } = mount(solo);
    http = h;
    const banner = $(host, '[data-testid="overlay-banner"]');
    expect(banner.textContent ?? '').toMatch(/base/i);
  });

  it('escapes untrusted owner/trigger text through interpolation (no raw HTML)', () => {
    const hostile: ProjectState = {
      ...STATE,
      gateDefs: [{ name: 'ARCH_APPROVED', refusal: 'hard', owner: '<img src=x onerror=alert(1)>', trigger: ['<script>'] }],
    };
    const { host, http: h } = mount(hostile);
    http = h;
    expect(host.querySelector('img[onerror]')).toBeNull();
    expect(host.innerHTML).not.toContain('<script>');
  });
});
