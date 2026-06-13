import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsService } from '../core/fs.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from '../core/platform-bridge';
import type { KbSource, ProjectState } from '../core/models';
import { settle } from '../testing/settle';
import { KbSourcesComponent } from './kb-sources.component';

const INDEXED: KbSource = {
  id: 's1',
  label: 'payments-api',
  path: '/home/me/git/payments-api',
  kind: 'codebase',
  status: 'indexed',
  fileCount: 142,
  method: 'filename',
  lastIndexedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  external: false,
};

function mount(sources: readonly KbSource[] = []): {
  fixture: ComponentFixture<KbSourcesComponent>;
  host: HTMLElement;
  http: HttpTestingController;
} {
  const fs = {
    roots: vi.fn().mockResolvedValue({ roots: [{ label: 'Home', path: '/home/me' }], recent: [] }),
    list: vi.fn().mockResolvedValue({ path: '/home/me', parent: null, entries: [], truncated: false }),
  };
  TestBed.configureTestingModule({
    imports: [KbSourcesComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
      { provide: FsService, useValue: fs },
    ],
  });
  const fixture = TestBed.createComponent(KbSourcesComponent);
  fixture.componentRef.setInput('sources', sources);
  fixture.componentRef.setInput('stateRev', 'r1');
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('KbSourcesComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows one quiet invite line when no source is connected (the one allowed empty-affordance)', () => {
    const { host } = mount([]);
    const empty = host.querySelector('[data-testid="kb-source-empty"]')!;
    expect(empty.textContent).toMatch(/Connect a codebase to make it searchable here/i);
  });

  it('connecting posts kb/source/connect with the chosen path + the guard, then lifts fresh state', async () => {
    const { fixture, host, http } = mount([]);
    let lifted: ProjectState | null = null;
    fixture.componentInstance.applied.subscribe((s) => (lifted = s));
    // Drive the picker's chosen output directly.
    fixture.componentInstance.onChosen('/home/me/git/payments-api');
    const req = http.expectOne('/api/kb/source/connect');
    expect(req.request.headers.get(WRITE_GUARD_HEADER)).toBe('1');
    expect(req.request.body).toMatchObject({ path: '/home/me/git/payments-api' });
    req.flush({ ok: true, state: { rev: 'r2' }, source: { ...INDEXED } });
    await settle(fixture);
    expect((lifted as unknown as ProjectState)?.rev).toBe('r2');
  });

  describe('a connected source row', () => {
    it('shows status, the honest "{n} files · filename" method, and a freshness marker', () => {
      const { host } = mount([INDEXED]);
      const row = host.querySelector('[data-testid="kb-source-row"]')!;
      expect(row.querySelector('[data-testid="kb-source-status"]')?.textContent).toContain('indexed');
      expect(row.querySelector('[data-testid="kb-source-method"]')?.textContent).toContain('142 files · filename');
      expect(row.querySelector('[data-testid="kb-source-freshness"]')?.textContent).toMatch(/indexed .*ago/i);
    });

    it('shows a stale — re-index marker when the projection reports the source stale', () => {
      const { host } = mount([{ ...INDEXED, stale: true }]);
      expect(host.querySelector('[data-testid="kb-source-freshness"]')?.textContent).toMatch(/stale — re-index/i);
    });

    it('Re-index posts kb/source/reindex', async () => {
      const { fixture, host, http } = mount([INDEXED]);
      (host.querySelector('[data-testid="kb-source-reindex"]') as HTMLButtonElement).click();
      const req = http.expectOne('/api/kb/source/reindex');
      expect(req.request.body).toMatchObject({ sourceId: 's1' });
      req.flush({ ok: true, state: { rev: 'r2' }, source: { ...INDEXED } });
      await settle(fixture);
    });

    it('Re-index is disabled while the source is indexing', () => {
      const { host } = mount([{ ...INDEXED, status: 'indexing' }]);
      expect((host.querySelector('[data-testid="kb-source-reindex"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('the ⋯ menu → Disconnect confirms then posts kb/source/disconnect', async () => {
      const { fixture, host, http } = mount([INDEXED]);
      (host.querySelector('[data-testid="kb-source-menu"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (host.querySelector('[data-testid="kb-source-disconnect"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="kb-source-disconnect-ok"]')?.textContent).toMatch(/Disconnect/i);
      (host.querySelector('[data-testid="kb-source-disconnect-ok"]') as HTMLButtonElement).click();
      const req = http.expectOne('/api/kb/source/disconnect');
      expect(req.request.body).toMatchObject({ sourceId: 's1' });
      req.flush({ ok: true, state: { rev: 'r2' } });
      await settle(fixture);
    });

    it('re-index 409 is a first-class conflict: lifts fresh state, no error', async () => {
      const { fixture, host, http } = mount([INDEXED]);
      let lifted: ProjectState | null = null;
      fixture.componentInstance.applied.subscribe((s) => (lifted = s));
      (host.querySelector('[data-testid="kb-source-reindex"]') as HTMLButtonElement).click();
      http.expectOne('/api/kb/source/reindex').flush({ ok: false, conflict: true, state: { rev: 'r9' } }, { status: 409, statusText: 'Conflict' });
      await settle(fixture);
      expect((lifted as unknown as ProjectState)?.rev).toBe('r9');
    });

    it('escapes a hostile source path/label (no script execution)', () => {
      const evil = '<img src=x onerror="window.__xssSrc=1">';
      const { host } = mount([{ ...INDEXED, label: evil, path: evil }]);
      expect([...host.querySelectorAll('img')].filter((el) => el.hasAttribute('onerror'))).toEqual([]);
      expect((window as unknown as Record<string, unknown>)['__xssSrc']).toBeUndefined();
      expect(host.textContent).toContain('<img');
    });
  });
});
