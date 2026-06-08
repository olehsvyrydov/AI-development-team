import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsService } from './fs.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from './platform-bridge';
import type { FsListResponse, FsRootsResponse } from './models';

describe('FsService', () => {
  let fs: FsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
        FsService,
      ],
    });
    fs = TestBed.inject(FsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /api/fs/roots carries the X-AIDT guard header (the surface is guarded even on read)', async () => {
    const promise = fs.roots();
    const req = http.expectOne('/api/fs/roots');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');

    const body: FsRootsResponse = {
      ok: true,
      roots: [{ label: 'Home', path: '/home/me' }],
      recent: [{ label: 'ai-dev-team', path: '/home/me/git/ai-dev-team' }],
    };
    req.flush(body);
    const result = await promise;
    expect(result.roots[0].path).toBe('/home/me');
    expect(result.recent[0].label).toBe('ai-dev-team');
  });

  it('GET /api/fs/list sends the path query AND the X-AIDT guard header, returns a normalised listing', async () => {
    const promise = fs.list('/home/me/git');
    const req = http.expectOne((r) => r.url === '/api/fs/list');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('path')).toBe('/home/me/git');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');

    const body: FsListResponse = {
      ok: true,
      path: '/home/me/git',
      parent: '/home/me',
      entries: [
        { name: 'ai-dev-team', type: 'dir', hasProject: true },
        { name: 'scratch', type: 'dir', hasProject: false },
      ],
    };
    req.flush(body);
    const result = await promise;
    expect(result.path).toBe('/home/me/git');
    expect(result.parent).toBe('/home/me');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].hasProject).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('list() with no path omits the param so the hub opens at Home', async () => {
    const promise = fs.list();
    const req = http.expectOne((r) => r.url === '/api/fs/list');
    expect(req.request.params.has('path')).toBe(false);
    req.flush({ ok: true, path: '/home/me', parent: null, entries: [] } satisfies FsListResponse);
    const result = await promise;
    expect(result.parent).toBeNull();
  });

  it('rejects with the hub error text when a listing is refused (e.g. outside Home)', async () => {
    const promise = fs.list('/etc');
    const req = http.expectOne((r) => r.url === '/api/fs/list');
    req.flush({ ok: false, error: 'path escapes the allowed root' }, { status: 403, statusText: 'Forbidden' });
    await expect(promise).rejects.toThrow('path escapes the allowed root');
  });
});
