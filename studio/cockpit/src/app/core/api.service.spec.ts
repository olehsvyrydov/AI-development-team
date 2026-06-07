import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiService } from './api.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from './platform-bridge';
import type { ConnectResponse, ProjectListResponse } from './models';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
        ApiService,
      ],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  it('GET /api/projects returns the typed list', async () => {
    const promise = api.listProjects();
    const req = http.expectOne('/api/projects');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has(WRITE_GUARD_HEADER)).toBe(false);

    const body: ProjectListResponse = {
      ok: true,
      projects: [
        { id: 'aaaaaaaaaaaa', path: '/p', label: 'p', addedAt: 't', lastSeen: 't', status: 'connected' },
      ],
    };
    req.flush(body);
    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('aaaaaaaaaaaa');
  });

  it('POST /api/projects/connect sends the X-AIDT write-guard header and the folder path', async () => {
    const promise = api.connectProject('/Users/me/dev/payments-api');
    const req = http.expectOne('/api/projects/connect');

    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toEqual({ path: '/Users/me/dev/payments-api' });

    const body: ConnectResponse = {
      ok: true,
      created: true,
      project: { id: 'bbbbbbbbbbbb', path: '/Users/me/dev/payments-api', label: 'payments-api', addedAt: 't', lastSeen: 't', status: 'connected' },
      profile: { title: 'payments-api', description: 'VAT-aware billing.' },
      state: { preset: 'solo' },
    };
    req.flush(body);
    const result = await promise;
    expect(result.created).toBe(true);
    expect(result.view.record.id).toBe('bbbbbbbbbbbb');
    expect(result.view.profile?.title).toBe('payments-api');
  });

  it('GET /api/projects/:id returns the joined project view', async () => {
    const promise = api.getProject('cccccccccccc');
    const req = http.expectOne('/api/projects/cccccccccccc');
    expect(req.request.method).toBe('GET');
    req.flush({
      ok: true,
      project: { id: 'cccccccccccc', path: '/q', label: 'q', addedAt: 't', lastSeen: 't', status: 'connected' },
      profile: { title: 'Q', description: 'desc' },
      state: null,
    });
    const view = await promise;
    expect(view.record.label).toBe('q');
    expect(view.profile?.description).toBe('desc');
  });

  it('rejects when the hub reports ok:false', async () => {
    const promise = api.connectProject('/bad');
    const req = http.expectOne('/api/projects/connect');
    req.flush({ ok: false, error: 'path does not exist' });
    await expect(promise).rejects.toThrow('path does not exist');
  });

  it('rejects with the hub error text on a 403 guard rejection', async () => {
    const promise = api.connectProject('/x');
    const req = http.expectOne('/api/projects/connect');
    req.flush({ ok: false, error: 'missing X-AIDT header' }, { status: 403, statusText: 'Forbidden' });
    await expect(promise).rejects.toThrow('missing X-AIDT header');
  });

  afterEach(() => http.verify());
});

import { afterEach } from 'vitest';
