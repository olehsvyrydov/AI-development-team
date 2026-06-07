import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, type ConnectResult } from '../core/api.service';
import { ProjectsHomeComponent } from './projects-home.component';
import { settle } from '../testing/settle';
import type { ProjectRecord } from '../core/models';

function record(id: string, label: string): ProjectRecord {
  return { id, path: `/p/${label}`, label, addedAt: 't', lastSeen: 't', status: 'connected' };
}

describe('ProjectsHomeComponent', () => {
  let api: {
    listProjects: ReturnType<typeof vi.fn>;
    connectProject: ReturnType<typeof vi.fn>;
    getProject: ReturnType<typeof vi.fn>;
  };

  async function mount(): Promise<ComponentFixture<ProjectsHomeComponent>> {
    TestBed.configureTestingModule({
      imports: [ProjectsHomeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsHomeComponent);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  beforeEach(() => {
    api = {
      listProjects: vi.fn().mockResolvedValue([]),
      connectProject: vi.fn(),
      getProject: vi.fn(),
    };
  });

  it('shows the empty state when no projects are connected', async () => {
    const fixture = await mount();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No projects yet');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="empty-state"]')).toBeTruthy();
  });

  it('renders a card per connected project with its title', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api'), record('bbbbbbbbbbbb', 'site')]);
    const fixture = await mount();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="project-card"]');
    expect(cards).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('payments-api');
  });

  it('renders an UNTRUSTED title/description as escaped text, never as live markup (XSS guard)', async () => {
    const evil = '<img src=x onerror="window.__xss=1">';
    api.listProjects.mockResolvedValue([record('cccccccccccc', 'evil')]);
    api.getProject.mockResolvedValue({
      record: record('cccccccccccc', 'evil'),
      profile: { title: evil, description: `desc ${evil}` },
      state: null,
    });
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    // The injected <img> must NOT exist as a real element anywhere in the card grid.
    expect(host.querySelector('img[src="x"]')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__xss']).toBeUndefined();
    // The raw angle brackets survive as text (interpolation escaped them).
    expect(host.textContent).toContain('<img');
  });

  it('connects a folder: posts the path, shows analyzing, then the new card appears', async () => {
    const fixture = await mount();
    let resolveConnect!: (r: ConnectResult) => void;
    api.connectProject.mockReturnValue(new Promise<ConnectResult>((r) => (resolveConnect = r)));

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('[data-testid="connect-path"]')!;
    input.value = '/Users/me/dev/payments-api';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('[data-testid="connect-submit"]')!.click();
    await settle(fixture);

    expect(host.querySelector('[data-testid="connect-analyzing"]')).toBeTruthy();
    expect(api.connectProject).toHaveBeenCalledWith('/Users/me/dev/payments-api');

    api.getProject.mockResolvedValue({
      record: record('dddddddddddd', 'payments-api'),
      profile: { title: 'payments-api', description: 'VAT-aware billing.' },
      state: null,
    });
    resolveConnect({
      created: true,
      view: { record: record('dddddddddddd', 'payments-api'), profile: { title: 'payments-api', description: 'VAT-aware billing.' }, state: null },
    });
    await settle(fixture);

    expect(host.textContent).toContain('payments-api');
    expect(host.querySelector('[data-testid="project-card"]')).toBeTruthy();
  });

  it('surfaces the hub error when a connect fails', async () => {
    const fixture = await mount();
    api.connectProject.mockRejectedValue(new Error('path does not exist'));
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('[data-testid="connect-path"]')!;
    input.value = '/nope';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="connect-submit"]')!.click();
    await settle(fixture);

    expect(host.querySelector('[data-testid="connect-error"]')?.textContent).toContain('path does not exist');
  });
});
