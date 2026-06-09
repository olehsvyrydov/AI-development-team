import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, type ConnectResult } from './api.service';
import { ProjectsStore } from './projects.store';
import type { ProjectRecord, ProjectView } from './models';

function record(id: string, label = id, needsYou?: number): ProjectRecord {
  const base: ProjectRecord = { id, path: `/p/${label}`, label, addedAt: 't', lastSeen: 't', status: 'connected' };
  return needsYou === undefined ? base : { ...base, taskSummary: { open: 9, needsYou } };
}

function view(id: string, title: string, description: string): ProjectView {
  return { record: record(id, title), profile: { title, description }, state: null };
}

describe('ProjectsStore', () => {
  let api: {
    listProjects: ReturnType<typeof vi.fn>;
    connectProject: ReturnType<typeof vi.fn>;
    getProject: ReturnType<typeof vi.fn>;
  };

  function makeStore(): ProjectsStore {
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }, ProjectsStore],
    });
    return TestBed.inject(ProjectsStore);
  }

  beforeEach(() => {
    api = {
      listProjects: vi.fn().mockResolvedValue([]),
      connectProject: vi.fn(),
      getProject: vi.fn(),
    };
  });

  it('starts empty and reports the empty state once a load resolves with no projects', async () => {
    const store = makeStore();
    expect(store.isEmpty()).toBe(false); // not yet loaded → not "empty", just unknown
    await store.load();
    expect(store.projects()).toEqual([]);
    expect(store.isEmpty()).toBe(true);
    expect(store.loaded()).toBe(true);
  });

  it('loads connected projects into the view list', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'one'), record('bbbbbbbbbbbb', 'two')]);
    const store = makeStore();
    await store.load();
    expect(store.projects().map((v) => v.record.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(store.isEmpty()).toBe(false);
  });

  it('drives connect through analyzing → ready and prepends the new project', async () => {
    const store = makeStore();
    await store.load();

    let resolveConnect!: (r: ConnectResult) => void;
    api.connectProject.mockReturnValue(new Promise<ConnectResult>((r) => (resolveConnect = r)));

    const pending = store.connect('/Users/me/dev/payments-api');
    expect(store.connectStatus()).toBe('analyzing');

    resolveConnect({ created: true, view: view('cccccccccccc', 'payments-api', 'VAT-aware billing.') });
    await pending;

    expect(store.connectStatus()).toBe('ready');
    expect(store.projects()[0].record.id).toBe('cccccccccccc');
    expect(api.connectProject).toHaveBeenCalledWith('/Users/me/dev/payments-api');
  });

  it('does not duplicate a project that was already connected (re-connect updates in place)', async () => {
    api.listProjects.mockResolvedValue([record('cccccccccccc', 'payments-api')]);
    const store = makeStore();
    await store.load();
    expect(store.projects()).toHaveLength(1);

    api.connectProject.mockResolvedValue({
      created: false,
      view: view('cccccccccccc', 'payments-api', 'updated desc'),
    });
    await store.connect('/p/payments-api');

    expect(store.projects()).toHaveLength(1);
    expect(store.projects()[0].profile?.description).toBe('updated desc');
  });

  it('captures the hub error text into the error state on a failed connect', async () => {
    const store = makeStore();
    await store.load();
    api.connectProject.mockRejectedValue(new Error('path does not exist'));

    await store.connect('/nope');

    expect(store.connectStatus()).toBe('error');
    expect(store.connectError()).toBe('path does not exist');
    expect(store.projects()).toHaveLength(0);
  });

  it('lists projects waiting on the human, descending by need, omitting the all-clear ones', async () => {
    api.listProjects.mockResolvedValue([
      record('aaaaaaaaaaaa', 'a', 1),
      record('bbbbbbbbbbbb', 'b', 3),
      record('cccccccccccc', 'c', 0),
      record('dddddddddddd', 'd'), // no summary → absent
    ]);
    const store = makeStore();
    await store.load();
    expect(store.waiting().map((w) => w.name)).toEqual(['b', 'a']);
    expect(store.waiting().map((w) => w.needsYou)).toEqual([3, 1]);
    expect(store.totalNeedsYou()).toBe(4);
  });

  it('reports no waiting projects when nothing needs the human (absent-not-zero)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'a', 0), record('bbbbbbbbbbbb', 'b')]);
    const store = makeStore();
    await store.load();
    expect(store.waiting()).toEqual([]);
    expect(store.totalNeedsYou()).toBe(0);
  });

  it('resets the connect flow back to idle', async () => {
    const store = makeStore();
    api.connectProject.mockRejectedValue(new Error('boom'));
    await store.connect('/x');
    expect(store.connectStatus()).toBe('error');
    store.resetConnect();
    expect(store.connectStatus()).toBe('idle');
    expect(store.connectError()).toBeNull();
  });
});
