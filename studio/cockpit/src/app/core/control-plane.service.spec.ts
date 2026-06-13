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

  it('approveProposal posts { id, scope } to /api/kb/approve with the X-AIDT guard, returns ok+state', async () => {
    const promise = cp.approveProposal('p1', 'common');
    const req = http.expectOne('/api/kb/approve');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body.id).toBe('p1');
    expect(req.request.body.scope).toBe('common');
    req.flush({ ok: true, state: { rev: 'r2', knowledge: { method: 'filename-only', counts: { project: 1, common: 1, proposals: 0 }, proposals: [] } } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r2');
  });

  it('approveProposal sends the chosen scope verbatim (project vs common) — never a free path', async () => {
    const promise = cp.approveProposal('p2', 'project');
    const req = http.expectOne('/api/kb/approve');
    expect(req.request.body).toMatchObject({ id: 'p2', scope: 'project' });
    expect(Object.keys(req.request.body).sort()).toEqual(['id', 'scope']);
    req.flush({ ok: true, state: { rev: 'r3' } });
    await promise;
  });

  it('approveProposal maps a 400 (foreign/stale id) to a terse error result', async () => {
    const promise = cp.approveProposal('nope', 'common');
    const req = http.expectOne('/api/kb/approve');
    req.flush({ ok: false, error: 'unknown proposal' }, { status: 400, statusText: 'Bad Request' });
    const res = await promise;
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.error).toBe('unknown proposal');
  });

  it('rejectProposal posts { id } to /api/kb/reject with the X-AIDT guard, returns ok+state', async () => {
    const promise = cp.rejectProposal('p1');
    const req = http.expectOne('/api/kb/reject');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body.id).toBe('p1');
    req.flush({ ok: true, state: { rev: 'r4', knowledge: { method: 'filename-only', counts: { project: 1, common: 0, proposals: 0 }, proposals: [] } } });
    const res = await promise;
    expect(res.ok).toBe(true);
    if (res.ok === true) expect(res.state?.rev).toBe('r4');
  });

  it('rejectProposal maps a 403 write-guard refusal to an error result', async () => {
    const promise = cp.rejectProposal('p1');
    const req = http.expectOne('/api/kb/reject');
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
        { call: cp.approveProposal('p1', 'common'), url: '/api/kb/approve' },
        { call: cp.rejectProposal('p1'), url: '/api/kb/reject' },
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

  describe('askKnowledge (read-only interpretation-check Q&A)', () => {
    it('GETs /api/knowledge/ask with the question as ?q, no write-guard header (it is a read)', async () => {
      const promise = cp.askKnowledge('how do we retry webhooks?');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBeNull();
      expect(req.request.params.get('q')).toBe('how do we retry webhooks?');
      req.flush({ ok: true, answer: 'a', matches: [], grounding: { method: 'none', source: 'filename-only', external: false, label: 'No note found.' }, egressDisclosed: false });
      const res = await promise;
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.answer.grounding.method).toBe('none');
    });

    it('threads the scoped project id as ?project so the read resolves to the viewed project', async () => {
      cp.setProject('abcdef123456');
      const promise = cp.askKnowledge('x');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      expect(req.request.params.get('project')).toBe('abcdef123456');
      req.flush({ ok: true, answer: 'a', matches: [], grounding: { method: 'none', source: 'filename-only', external: false, label: 'n' }, egressDisclosed: false });
      await promise;
    });

    it('omits ?project when no project is scoped (single-project launch back-compat)', async () => {
      const promise = cp.askKnowledge('x');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      expect(req.request.params.has('project')).toBe(false);
      req.flush({ ok: true, answer: 'a', matches: [], grounding: { method: 'none', source: 'filename-only', external: false, label: 'n' }, egressDisclosed: false });
      await promise;
    });

    it('returns the answer with its honest grounding label and matches verbatim', async () => {
      const promise = cp.askKnowledge('retry');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      req.flush({
        ok: true,
        answer: 'Filename/keyword match: webhook-retry.',
        matches: [{ name: 'webhook-retry', scope: 'project', snippet: 'retry with backoff' }],
        grounding: { method: 'filename-only', source: 'filename-only', external: false, label: 'Filename/keyword match only — not a semantic understanding check.' },
        egressDisclosed: false,
      });
      const res = await promise;
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.answer.matches[0].name).toBe('webhook-retry');
        expect(res.answer.grounding.label).toMatch(/not a semantic/);
        expect(res.answer.egressDisclosed).toBe(false);
      }
    });

    it('carries the truthful egress disclosure through when an overlay answered', async () => {
      const promise = cp.askKnowledge('retry');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      req.flush({
        ok: true,
        answer: 'The service understood this as retry-with-backoff.',
        matches: [{ name: 'memory', scope: 'overlay', score: 0.9 }],
        grounding: { method: 'overlay', source: 'openmemory', external: true, residency: 'local-service', label: 'Answered by your connected memory service openmemory (external).' },
        egressDisclosed: true,
      });
      const res = await promise;
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.answer.egressDisclosed).toBe(true);
        expect(res.answer.grounding.external).toBe(true);
        expect(res.answer.grounding.residency).toBe('local-service');
      }
    });

    it('maps a transport failure to a terse error result, never a throw', async () => {
      const promise = cp.askKnowledge('x');
      const req = http.expectOne((r) => r.url === '/api/knowledge/ask');
      req.flush({ ok: false, error: 'unavailable' }, { status: 500, statusText: 'Server Error' });
      const res = await promise;
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('unavailable');
    });
  });

  describe('knowledge CRUD + sources (guarded, CAS)', () => {
    it('editKbNote posts file/scope/body + the per-note expectedRev with the X-AIDT guard', async () => {
      const promise = cp.editKbNote({ file: 'docs/x.md', body: 'after', scope: 'project', stack: ['java'], kind: 'rule', expectedRev: 'm:1' });
      const req = http.expectOne('/api/kb/update');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
      expect(req.request.body).toMatchObject({ file: 'docs/x.md', body: 'after', scope: 'project', expectedRev: 'm:1' });
      req.flush({ ok: true, state: { rev: 'r2' } });
      expect((await promise).ok).toBe(true);
    });

    it('editKbNote surfaces a 409 as a first-class conflict carrying fresh state (not a throw)', async () => {
      const promise = cp.editKbNote({ file: 'docs/x.md', body: 'after', scope: 'project', expectedRev: 'stale' });
      const req = http.expectOne('/api/kb/update');
      req.flush(
        { ok: false, conflict: true, state: { rev: 'r9', knowledge: { method: 'filename-only', counts: { project: 1, common: 0 }, docs: [] } } },
        { status: 409, statusText: 'Conflict' },
      );
      const res = await promise;
      expect(res.ok).toBe('conflict');
      if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
    });

    it('removeKbNote posts file/scope + expectedRev and surfaces a 409 as a conflict', async () => {
      const okP = cp.removeKbNote({ file: 'docs/x.md', scope: 'project', expectedRev: 'm:1' });
      const okReq = http.expectOne('/api/kb/remove');
      expect(okReq.request.body).toMatchObject({ file: 'docs/x.md', scope: 'project', expectedRev: 'm:1' });
      okReq.flush({ ok: true, state: { rev: 'r2' } });
      expect((await okP).ok).toBe(true);

      const conflictP = cp.removeKbNote({ file: 'docs/x.md', scope: 'project', expectedRev: 'stale' });
      const cReq = http.expectOne('/api/kb/remove');
      cReq.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
      expect((await conflictP).ok).toBe('conflict');
    });

    it('connectKbSource posts the chosen path and returns fresh state + the public source', async () => {
      const promise = cp.connectKbSource({ path: '/home/me/repo', expectedRev: '0' });
      const req = http.expectOne('/api/kb/source/connect');
      expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
      expect(req.request.body).toMatchObject({ path: '/home/me/repo', expectedRev: '0' });
      req.flush({ ok: true, state: { rev: 'r2' }, source: { id: 's1', label: 'repo', path: '/home/me/repo', kind: 'codebase', status: 'indexed', external: false } });
      const res = await promise;
      expect(res.ok).toBe(true);
      if (res.ok === true) expect(res.source?.id).toBe('s1');
    });

    it('connectKbSource surfaces a 409 as a first-class conflict carrying fresh state', async () => {
      const promise = cp.connectKbSource({ path: '/home/me/repo', expectedRev: 'stale' });
      const req = http.expectOne('/api/kb/source/connect');
      req.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
      const res = await promise;
      expect(res.ok).toBe('conflict');
      if (res.ok === 'conflict') expect(res.state?.rev).toBe('r9');
    });

    it('reindexKbSource / disconnectKbSource post the sourceId and handle a 409 conflict', async () => {
      const rP = cp.reindexKbSource('s1', '0');
      const rReq = http.expectOne('/api/kb/source/reindex');
      expect(rReq.request.body).toMatchObject({ sourceId: 's1', expectedRev: '0' });
      rReq.flush({ ok: true, state: { rev: 'r2' }, source: { id: 's1', label: 'repo', path: '/p', kind: 'codebase', status: 'indexed', external: false } });
      expect((await rP).ok).toBe(true);

      const dP = cp.disconnectKbSource('s1', 'stale');
      const dReq = http.expectOne('/api/kb/source/disconnect');
      expect(dReq.request.body).toMatchObject({ sourceId: 's1' });
      dReq.flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
      expect((await dP).ok).toBe('conflict');
    });
  });
});
