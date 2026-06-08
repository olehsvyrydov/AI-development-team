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
});
