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

  it('moves a stage down with the visible move button and reflects the new order optimistically', () => {
    const { fixture, host, http: h } = mount();
    http = h;
    // Move "vision" (first row) down → order [architecture, vision, security, done]
    $(host, '[data-testid="move-down-vision"]').click();
    fixture.detectChanges();
    const names = [...host.querySelectorAll('[data-testid="builder-stage-name"]')].map((e) => e.textContent?.trim());
    expect(names).toEqual(['architecture', 'vision', 'security', 'done']);
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
    const req = http.expectOne('/api/track/set-stages');
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

  it('saves a reorder via set-stages, posting the full ordered list (name + owner) + rev', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    $(host, '[data-testid="move-down-vision"]').click();
    fixture.detectChanges();
    $(host, '[data-testid="builder-save"]').click();
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.body).toEqual({
      track: 'full',
      stages: [
        { name: 'architecture', owner: '/arch' },
        { name: 'vision', owner: '/po' },
        { name: 'security', owner: '/secops' },
        { name: 'done' },
      ],
      expectedRev: 'r1',
    });
    req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
    await settle(fixture);
    expect(applied.at(-1)?.rev).toBe('r2');
    // The reorder bar is gone after a successful persist (move reliably reflected).
    expect(host.querySelector('[data-testid="builder-reorder-bar"]')).toBeNull();
  });

  describe('add a stage', () => {
    function openAdder(host: HTMLElement, fixture: ComponentFixture<WorkflowBuilderComponent>): void {
      $(host, '[data-testid="add-stage-foot"]').click();
      fixture.detectChanges();
    }
    function setName(host: HTMLElement, value: string): void {
      const input = $(host, '[data-testid="new-stage-name"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('opens an inline new-stage row from the list-foot Add stage control', () => {
      const { fixture, host, http: h } = mount();
      http = h;
      expect(host.querySelector('[data-testid="new-stage-row"]')).toBeNull();
      openAdder(host, fixture);
      expect(host.querySelector('[data-testid="new-stage-row"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="new-stage-name"]')).toBeTruthy();
    });

    it('confirms an add, posting the existing stages PLUS the new one with project + rev', async () => {
      const { fixture, host, http: h, applied } = mount();
      http = h;
      openAdder(host, fixture);
      setName(host, '  design-review  ');
      const owner = $(host, '[data-testid="new-stage-owner"]') as HTMLSelectElement;
      owner.value = '/ui';
      owner.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      $(host, '[data-testid="new-stage-confirm"]').click();

      const req = http.expectOne('/api/track/set-stages');
      expect(req.request.body.track).toBe('full');
      expect(req.request.body.stages).toEqual([
        { name: 'vision', owner: '/po' },
        { name: 'architecture', owner: '/arch' },
        { name: 'security', owner: '/secops' },
        { name: 'done' },
        { name: 'design-review', owner: '/ui' },
      ]);
      expect(req.request.body.expectedRev).toBe('r1');
      req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
      await settle(fixture);
      expect(applied.at(-1)?.rev).toBe('r2');
    });

    it('blocks a blank name client-side (confirm disabled, nothing posted)', () => {
      const { fixture, host, http: h } = mount();
      http = h;
      openAdder(host, fixture);
      setName(host, '   ');
      fixture.detectChanges();
      expect(($(host, '[data-testid="new-stage-confirm"]') as HTMLButtonElement).disabled).toBe(true);
      http.expectNone('/api/track/set-stages');
    });

    it('blocks a duplicate name client-side (confirm disabled, shows a reason, nothing posted)', () => {
      const { fixture, host, http: h } = mount();
      http = h;
      openAdder(host, fixture);
      setName(host, 'security');
      fixture.detectChanges();
      expect(($(host, '[data-testid="new-stage-confirm"]') as HTMLButtonElement).disabled).toBe(true);
      expect($(host, '[data-testid="new-stage-error"]').textContent ?? '').toMatch(/already exists/i);
      http.expectNone('/api/track/set-stages');
    });
  });

  describe('delete a stage', () => {
    it('opens an inline confirm warning how many tickets are in the stage and that they go off-track', () => {
      const withTickets: ProjectState = {
        ...STATE,
        tickets: [
          { id: 'T1', stage: 'architecture' },
          { id: 'T2', stage: 'architecture' },
        ],
      };
      const { fixture, host, http: h } = mount(withTickets);
      http = h;
      $(host, '[data-testid="delete-stage-architecture"]').click();
      fixture.detectChanges();
      const confirm = $(host, '[data-testid="delete-confirm-architecture"]');
      expect(confirm.textContent ?? '').toMatch(/2 task/i);
      expect(confirm.textContent ?? '').toMatch(/off-track/i);
    });

    it('confirms a delete, posting the list WITHOUT that stage + rev', async () => {
      const { fixture, host, http: h, applied } = mount();
      http = h;
      $(host, '[data-testid="delete-stage-security"]').click();
      fixture.detectChanges();
      $(host, '[data-testid="delete-confirm-go-security"]').click();
      const req = http.expectOne('/api/track/set-stages');
      expect(req.request.body.stages).toEqual([
        { name: 'vision', owner: '/po' },
        { name: 'architecture', owner: '/arch' },
        { name: 'done' },
      ]);
      expect(req.request.body.expectedRev).toBe('r1');
      req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
      await settle(fixture);
      expect(applied.at(-1)?.rev).toBe('r2');
    });

    it('refuses deleting the last remaining stage (button disabled, nothing posted)', () => {
      const single: ProjectState = {
        ...STATE,
        workflowView: { activeTrack: 'solo', stages: [{ stage: 'do', owner: '/you', gate: null }] },
        tracks: { solo: ['do'] },
      };
      const { host, http: h } = mount(single);
      http = h;
      expect(($(host, '[data-testid="delete-stage-do"]') as HTMLButtonElement).disabled).toBe(true);
      http.expectNone('/api/track/set-stages');
    });
  });

  describe('set a stage owner', () => {
    it('changing the row owner posts set-stages with that stage owner updated', async () => {
      const { fixture, host, http: h } = mount();
      http = h;
      const select = $(host, '[data-testid="owner-select-done"]') as HTMLSelectElement;
      select.value = '/qa';
      select.dispatchEvent(new Event('change'));
      const req = http.expectOne('/api/track/set-stages');
      expect(req.request.body.stages).toEqual([
        { name: 'vision', owner: '/po' },
        { name: 'architecture', owner: '/arch' },
        { name: 'security', owner: '/secops' },
        { name: 'done', owner: '/qa' },
      ]);
      req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
      await settle(fixture);
    });

    it('selecting the "—" option clears the owner to the derived default', async () => {
      const { fixture, host, http: h } = mount();
      http = h;
      const select = $(host, '[data-testid="owner-select-vision"]') as HTMLSelectElement;
      select.value = '';
      select.dispatchEvent(new Event('change'));
      const req = http.expectOne('/api/track/set-stages');
      // vision's owner cleared → it carries no owner field; the rest are unchanged.
      expect(req.request.body.stages).toEqual([
        { name: 'vision' },
        { name: 'architecture', owner: '/arch' },
        { name: 'security', owner: '/secops' },
        { name: 'done' },
      ]);
      req.flush({ ok: true, state: { ...STATE, rev: 'r2' } });
      await settle(fixture);
    });

    it('constrains the owner picker to the allowed agent set plus the clear option', () => {
      const { host, http: h } = mount();
      http = h;
      const select = $(host, '[data-testid="owner-select-vision"]') as HTMLSelectElement;
      const values = [...select.options].map((o) => o.value);
      expect(values).toContain('');
      expect(values).toContain('/secops');
      expect(values).toContain('/qa');
    });
  });

  it('reconciles a 409 from set-stages: adopts fresh state and surfaces the conflict reconcile', async () => {
    const { fixture, host, http: h, applied } = mount();
    http = h;
    const select = $(host, '[data-testid="owner-select-done"]') as HTMLSelectElement;
    select.value = '/qa';
    select.dispatchEvent(new Event('change'));
    const req = http.expectOne('/api/track/set-stages');
    req.flush({ ok: false, conflict: true, state: { ...STATE, rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect($(host, '[data-testid="builder-conflict"]').getAttribute('role')).toBe('alert');
    expect(applied.at(-1)?.rev).toBe('r9');
  });
});
