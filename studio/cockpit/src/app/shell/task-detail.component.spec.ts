import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { GateDef, TicketView } from '../core/models';
import { settle } from '../testing/settle';
import { TaskDetailComponent } from './task-detail.component';

const GATE_DEFS: readonly GateDef[] = [
  { name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' },
  { name: 'SECOPS_APPROVED', refusal: 'hard', owner: '/secops' },
  { name: 'DESIGN_APPROVED', refusal: 'soft', owner: '/aura' },
];

function baseTicket(over: Partial<TicketView> = {}): TicketView {
  return {
    id: 'ADT-219',
    title: 'Knowledge-Base embedder swap',
    status: 'blocked',
    stage: 'security',
    track: 'full',
    assignee: '/be',
    gates: [
      { name: 'ARCH_APPROVED', refusal: 'hard', state: 'passed', by: '/arch', at: '2026-06-08T08:00:00Z' },
      {
        name: 'SECOPS_APPROVED',
        refusal: 'hard',
        state: 'rejected',
        owner: '/secops',
        note: 'needs the size-cap test',
        trigger: ['external-input file write'],
      },
    ],
    comments: [
      { id: 'c1', author: '/be', kind: 'comment', ts: '2026-06-08T05:00:00Z', body: 'Started the chokepoint.' },
      { id: 'c2', author: '/secops', kind: 'gate', ts: '2026-06-08T09:00:00Z', body: 'Rejected — needs test.' },
    ],
    ...over,
  };
}

function mount(ticket: TicketView): { fixture: ComponentFixture<TaskDetailComponent>; host: HTMLElement; http: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [TaskDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
    ],
  });
  const fixture = TestBed.createComponent(TaskDetailComponent);
  fixture.componentRef.setInput('ticket', ticket);
  fixture.componentRef.setInput('gateDefs', GATE_DEFS);
  fixture.componentRef.setInput('tracks', { full: ['vision', 'security', 'code', 'done'] });
  fixture.componentRef.setInput('rev', 'r1');
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('TaskDetailComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('is a focus-trapped modal dialog labelled by the title', () => {
    const { host } = mount(baseTicket());
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledby = dialog.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    expect(host.querySelector(`#${labelledby}`)?.textContent).toContain('Knowledge-Base embedder swap');
  });

  it('shows id, status, stage, and assignee in the header', () => {
    const { host } = mount(baseTicket());
    const head = host.querySelector('[data-testid="detail-header"]')!.textContent ?? '';
    expect(head).toContain('ADT-219');
    expect(head).toMatch(/security/i);
    expect(head).toMatch(/blocked/i);
    expect(head).toContain('/be');
  });

  it('renders each gate with its hard/soft SHAPE marker and passed/rejected/pending state by glyph+text', () => {
    const { host } = mount(baseTicket());
    const arch = host.querySelector('[data-testid="gate-ARCH_APPROVED"]')!;
    expect(arch.textContent).toMatch(/passed/i);
    expect(arch.querySelector('[data-shape="hard"]')).toBeTruthy();
    const sec = host.querySelector('[data-testid="gate-SECOPS_APPROVED"]')!;
    expect(sec.textContent).toMatch(/rejected/i);
    expect(sec.querySelector('[data-shape="hard"]')).toBeTruthy();
    expect(sec.textContent).toContain('needs the size-cap test');
    expect(sec.textContent).toContain('external-input file write');
  });

  it('escapes untrusted comment bodies and authors (no HTML injection), newest first', () => {
    const ticket = baseTicket({
      comments: [
        { id: 'c1', author: '/be', ts: '2026-06-08T05:00:00Z', body: 'first' },
        { id: 'x', author: '<img src=x onerror=alert(1)>', ts: '2026-06-08T09:00:00Z', body: '<script>alert(1)</script>' },
      ],
    });
    const { host } = mount(ticket);
    const list = host.querySelector('[data-testid="comments"]')!;
    expect(list.querySelector('script')).toBeNull();
    expect(list.querySelector('img')).toBeNull();
    expect(list.textContent).toContain('<script>alert(1)</script>');
    const items = [...list.querySelectorAll('[data-testid^="comment-"]')];
    expect(items[0].textContent).toContain('<script>');
  });

  it('escapes an untrusted ticket title (XSS-safe header)', () => {
    const { host } = mount(baseTicket({ title: '<b>boom</b><img src=x onerror=alert(1)>' }));
    const head = host.querySelector('[data-testid="detail-header"]')!;
    expect(head.querySelector('img')).toBeNull();
    expect(head.textContent).toContain('<b>boom</b>');
  });

  it('disables Post when the composer is empty and posts a comment otherwise', async () => {
    const { fixture, host, http } = mount(baseTicket());
    const post = host.querySelector('[data-testid="comment-post"]') as HTMLButtonElement;
    expect(post.disabled).toBe(true);

    const textarea = host.querySelector('[data-testid="comment-body"]') as HTMLTextAreaElement;
    textarea.value = 'Looks good';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(post.disabled).toBe(false);

    post.click();
    const req = http.expectOne('/api/ticket/comment');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ id: 'ADT-219', body: 'Looks good' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    await settle(fixture);
  });

  it('blocks posting a body over the 8 KB cap with a clear message', () => {
    const { fixture, host } = mount(baseTicket());
    const textarea = host.querySelector('[data-testid="comment-body"]') as HTMLTextAreaElement;
    textarea.value = 'x'.repeat(8193);
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const post = host.querySelector('[data-testid="comment-post"]') as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    expect((host.textContent ?? '')).toMatch(/too long|max 8/i);
  });

  it('keeps a draft comment when the ticket input is refreshed by an SSE push', () => {
    const { fixture, host } = mount(baseTicket());
    const textarea = host.querySelector('[data-testid="comment-body"]') as HTMLTextAreaElement;
    textarea.value = 'my draft';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // A live push refreshes the ticket + rev in place.
    fixture.componentRef.setInput('ticket', baseTicket({ comments: [{ id: 'new', author: '/x', ts: '2026-06-08T10:00:00Z', body: 'live update' }] }));
    fixture.componentRef.setInput('rev', 'r2');
    fixture.detectChanges();

    expect((host.querySelector('[data-testid="comment-body"]') as HTMLTextAreaElement).value).toBe('my draft');
    expect(host.querySelector('[data-testid="comments"]')!.textContent).toContain('live update');
  });

  it('offers Approve/Reject on the governing gate of the current stage and posts gate/set with rev', async () => {
    const { fixture, host, http } = mount(baseTicket());
    const approve = host.querySelector('[data-testid="gate-SECOPS_APPROVED"] [data-testid="gate-approve"]') as HTMLButtonElement;
    expect(approve).toBeTruthy();
    approve.click();
    fixture.detectChanges();
    const confirm = host.querySelector('[data-testid="gate-decide-confirm"]') as HTMLButtonElement;
    confirm.click();
    const req = http.expectOne('/api/gate/set');
    expect(req.request.body).toMatchObject({ id: 'ADT-219', gate: 'SECOPS_APPROVED', state: 'passed', expectedRev: 'r1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    await settle(fixture);
  });

  it('surfaces a 409 on a gate decision as a conflict notice with retry, adopting fresh state', async () => {
    const { fixture, host, http } = mount(baseTicket());
    (host.querySelector('[data-testid="gate-SECOPS_APPROVED"] [data-testid="gate-reject"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="gate-decide-confirm"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/gate/set');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(host.querySelector('[data-testid="detail-conflict"]')).toBeTruthy();
    expect((host.textContent ?? '')).toMatch(/changed|reloaded|retry/i);
  });

  it('emits close on Escape and on the close button', () => {
    const { fixture, host } = mount(baseTicket());
    let closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);
    (host.querySelector('[data-testid="detail-close"]') as HTMLButtonElement).click();
    expect(closed).toBe(1);
    host.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(2);
  });
});
