import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ControlPlaneService } from './control-plane.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from './platform-bridge';

describe('ControlPlaneService', () => {
  let cp: ControlPlaneService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
        ControlPlaneService,
      ],
    });
    cp = TestBed.inject(ControlPlaneService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('advance posts toStage + expectedRev + author with the X-AIDT guard, returns ok+state', async () => {
    const promise = cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' });
    const req = http.expectOne('/api/ticket/advance');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r2');
  });

  it('advance surfaces a 409 as a conflict result carrying the fresh server state (not a throw)', async () => {
    const promise = cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'stale', by: '/you' });
    const req = http.expectOne('/api/ticket/advance');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
    if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
  });

  it('advance maps a non-409 failure to an error result with the hub message', async () => {
    const promise = cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' });
    const req = http.expectOne('/api/ticket/advance');
    req.flush({ ok: false, error: 'unknown ticket' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('unknown ticket');
  });

  it('comment posts id/author/kind/body (append-only, no expectedRev needed)', async () => {
    const promise = cp.comment({ id: 'ADT-1', author: '/you', body: 'hello', kind: 'comment' });
    const req = http.expectOne('/api/ticket/comment');
    expect(req.request.body).toEqual({ id: 'ADT-1', author: '/you', body: 'hello', kind: 'comment' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
  });

  it('gateSet posts gate + state + note + expectedRev + by', async () => {
    const promise = cp.gateSet({ id: 'ADT-1', gate: 'SECOPS_APPROVED', state: 'passed', note: 'ok', by: '/secops', expectedRev: 'r1' });
    const req = http.expectOne('/api/gate/set');
    expect(req.request.body).toEqual({ id: 'ADT-1', gate: 'SECOPS_APPROVED', state: 'passed', note: 'ok', by: '/secops', expectedRev: 'r1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
  });

  it('gateSet surfaces a 409 conflict with fresh state', async () => {
    const promise = cp.gateSet({ id: 'ADT-1', gate: 'SECOPS_APPROVED', state: 'rejected', by: '/secops', expectedRev: 'stale' });
    const req = http.expectOne('/api/gate/set');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
  });

  it('reorderTrack posts track + the full new permutation + expectedRev with the guard', async () => {
    const promise = cp.reorderTrack({ track: 'full', stages: ['b', 'a', 'c'], expectedRev: 'r1' });
    const req = http.expectOne('/api/track/reorder');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({ track: 'full', stages: ['b', 'a', 'c'], expectedRev: 'r1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r2');
  });

  it('reorderTrack surfaces a 409 as a conflict carrying the fresh server state', async () => {
    const promise = cp.reorderTrack({ track: 'full', stages: ['b', 'a'], expectedRev: 'stale' });
    const req = http.expectOne('/api/track/reorder');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
    if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
  });

  it('reorderTrack maps a 400 non-permutation to an error result with the hub message', async () => {
    const promise = cp.reorderTrack({ track: 'full', stages: ['x'], expectedRev: 'r1' });
    const req = http.expectOne('/api/track/reorder');
    req.flush({ ok: false, error: 'stages must be a permutation of the track' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('stages must be a permutation of the track');
  });

  it('setStages posts track + the full ordered stage list (name + owner) + expectedRev with the guard', async () => {
    const promise = cp.setStages({
      track: 'full',
      stages: [{ name: 'vision', owner: '/po' }, { name: 'design-review', owner: '/ui' }, { name: 'done' }],
      expectedRev: 'r1',
    });
    const req = http.expectOne('/api/track/set-stages');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({
      track: 'full',
      stages: [{ name: 'vision', owner: '/po' }, { name: 'design-review', owner: '/ui' }, { name: 'done' }],
      expectedRev: 'r1',
    });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r2');
  });

  it('setStages surfaces a 409 as a conflict carrying the fresh server state', async () => {
    const promise = cp.setStages({ track: 'full', stages: [{ name: 'vision' }], expectedRev: 'stale' });
    const req = http.expectOne('/api/track/set-stages');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
    if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
  });

  it('setStages maps a 400 (invalid list) to an error result with the hub message', async () => {
    const promise = cp.setStages({ track: 'full', stages: [{ name: 'a' }, { name: 'a' }], expectedRev: 'r1' });
    const req = http.expectOne('/api/track/set-stages');
    req.flush({ ok: false, error: 'duplicate stage name' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('duplicate stage name');
  });

  it('gateTrigger posts only the changed fields (owner/refusal/trigger) + expectedRev', async () => {
    const promise = cp.gateTrigger({ gate: 'ARCH_APPROVED', owner: '/arch', refusal: 'hard', trigger: ['change-class'], expectedRev: 'r1' });
    const req = http.expectOne('/api/gate/trigger');
    expect(req.request.body).toEqual({ gate: 'ARCH_APPROVED', owner: '/arch', refusal: 'hard', trigger: ['change-class'], expectedRev: 'r1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
  });

  it('gateTrigger surfaces a 409 conflict with fresh state', async () => {
    const promise = cp.gateTrigger({ gate: 'ARCH_APPROVED', owner: '/arch', expectedRev: 'stale' });
    const req = http.expectOne('/api/gate/trigger');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
  });

  it('setPreset posts the chosen preset + expectedRev', async () => {
    const promise = cp.setPreset({ preset: 'regulated', expectedRev: 'r1' });
    const req = http.expectOne('/api/preset');
    expect(req.request.body).toEqual({ preset: 'regulated', expectedRev: 'r1' });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
  });

  it('setPreset surfaces a 409 conflict with fresh state', async () => {
    const promise = cp.setPreset({ preset: 'solo', expectedRev: 'stale' });
    const req = http.expectOne('/api/preset');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
  });

  it('setLabels posts the COMPLETE name-keyed label map + expectedRev with the guard', async () => {
    const promise = cp.setLabels({
      labels: {
        TO_DEV_BE: { settable_by: ['/rev', '/qa'], routes_to: 'implement', owner: '/be', meaning: 'send back to backend dev' },
      },
      expectedRev: 'r1',
    });
    const req = http.expectOne('/api/workflow/set-labels');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({
      labels: {
        TO_DEV_BE: { settable_by: ['/rev', '/qa'], routes_to: 'implement', owner: '/be', meaning: 'send back to backend dev' },
      },
      expectedRev: 'r1',
    });
    req.flush({ ok: true, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r2');
  });

  it('setLabels surfaces a 409 as a conflict carrying the fresh server state', async () => {
    const promise = cp.setLabels({ labels: { A: { settable_by: ['*'] } }, expectedRev: 'stale' });
    const req = http.expectOne('/api/workflow/set-labels');
    req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
    const res = await promise;
    expect(res.ok).toBe('conflict');
    if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
  });

  it('setLabels maps a 400 (invalid contract) to an error result with the hub message', async () => {
    const promise = cp.setLabels({ labels: { BAD: { settable_by: '/rev' as unknown as string[] } }, expectedRev: 'r1' });
    const req = http.expectOne('/api/workflow/set-labels');
    req.flush({ ok: false, error: 'settable_by must be a list' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('settable_by must be a list');
  });

  it('addKbNote posts ONLY title + body (never a path/filename) with the X-AIDT guard', async () => {
    const promise = cp.addKbNote({ title: 'Code review rules', body: '# rules\nbe kind' });
    const req = http.expectOne('/api/kb/add');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({ title: 'Code review rules', body: '# rules\nbe kind' });
    expect(Object.keys(req.request.body)).toEqual(['title', 'body']);
    req.flush({ ok: true, doc: { name: 'code-review-rules', file: 'docs/code-review-rules.md' }, state: { rev: 'r2' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.state?.rev).toBe('r2');
      expect(res.doc?.name).toBe('code-review-rules');
    }
  });

  it('addKbNote surfaces the actual file the server created on a duplicate-name collision', async () => {
    const promise = cp.addKbNote({ title: 'Code rules', body: 'x' });
    const req = http.expectOne('/api/kb/add');
    req.flush({ ok: true, doc: { name: 'code-rules-2', file: 'docs/code-rules-2.md' }, state: { rev: 'r3' } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.doc?.name).toBe('code-rules-2');
  });

  it('addKbNote maps a 400 (too large / empty slug) to an error result with the terse hub message', async () => {
    const promise = cp.addKbNote({ title: '...', body: 'x' });
    const req = http.expectOne('/api/kb/add');
    req.flush({ ok: false, error: 'title cannot be turned into a filename' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('title cannot be turned into a filename');
  });

  it('addKbNote maps a 403 write-guard refusal to an error result', async () => {
    const promise = cp.addKbNote({ title: 'x', body: 'y' });
    const req = http.expectOne('/api/kb/add');
    req.flush({ ok: false, error: 'write refused' }, { status: 403, statusText: 'Forbidden' });
    const res = await promise;
    expect(res.ok).toBe(false);
  });

  describe('viewed-project scoping (the id travels on every mutation)', () => {
    const PID = 'abcdef123456';

    it('threads the scoped project id into EVERY mutation body', async () => {
      cp.setProject(PID);

      const checks: { call: Promise<unknown>; url: string }[] = [
        { call: cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' }), url: '/api/ticket/advance' },
        { call: cp.comment({ id: 'ADT-1', author: '/you', body: 'hi', kind: 'comment' }), url: '/api/ticket/comment' },
        { call: cp.gateSet({ id: 'ADT-1', gate: 'SECOPS_APPROVED', state: 'passed', by: '/secops', expectedRev: 'r1' }), url: '/api/gate/set' },
        { call: cp.reorderTrack({ track: 'full', stages: ['a', 'b'], expectedRev: 'r1' }), url: '/api/track/reorder' },
        { call: cp.setStages({ track: 'full', stages: [{ name: 'a' }], expectedRev: 'r1' }), url: '/api/track/set-stages' },
        { call: cp.gateTrigger({ gate: 'ARCH_APPROVED', owner: '/arch', expectedRev: 'r1' }), url: '/api/gate/trigger' },
        { call: cp.setPreset({ preset: 'solo', expectedRev: 'r1' }), url: '/api/preset' },
        { call: cp.setLabels({ labels: { A: { settable_by: ['*'] } }, expectedRev: 'r1' }), url: '/api/workflow/set-labels' },
        { call: cp.addKbNote({ title: 'note', body: 'x' }), url: '/api/kb/add' },
      ];
      for (const c of checks) {
        const req = http.expectOne(c.url);
        expect((req.request.body as { project?: string }).project, `${c.url} carries project`).toBe(PID);
        req.flush({ ok: true, state: { rev: 'r2' }, doc: { name: 'note' } });
        await c.call;
      }
    });

    it('omits project when no project is scoped (single-project launch back-compat)', async () => {
      const promise = cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' });
      const req = http.expectOne('/api/ticket/advance');
      expect('project' in (req.request.body as object)).toBe(false);
      req.flush({ ok: true, state: { rev: 'r2' } });
      await promise;
    });

    it('does not let a client field named project override the scoped id', async () => {
      cp.setProject(PID);
      const promise = cp.advance({ id: 'ADT-1', toStage: 'security', expectedRev: 'r1', by: '/you' });
      const req = http.expectOne('/api/ticket/advance');
      expect((req.request.body as { project?: string }).project).toBe(PID);
      req.flush({ ok: true, state: { rev: 'r2' } });
      await promise;
    });
  });
});
