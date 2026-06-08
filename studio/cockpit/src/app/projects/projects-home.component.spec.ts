import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, type ConnectResult } from '../core/api.service';
import { FsService } from '../core/fs.service';
import { ProjectsHomeComponent } from './projects-home.component';
import { settle } from '../testing/settle';
import type { ProjectRecord } from '../core/models';

function record(id: string, label: string, over: Partial<ProjectRecord> = {}): ProjectRecord {
  return { id, path: `/p/${label}`, label, addedAt: 't', lastSeen: 't', status: 'connected', ...over };
}

describe('ProjectsHomeComponent', () => {
  let api: {
    listProjects: ReturnType<typeof vi.fn>;
    connectProject: ReturnType<typeof vi.fn>;
    getProject: ReturnType<typeof vi.fn>;
  };
  let fs: { roots: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> };

  async function mount(): Promise<ComponentFixture<ProjectsHomeComponent>> {
    TestBed.configureTestingModule({
      imports: [ProjectsHomeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: FsService, useValue: fs },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsHomeComponent);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  /** Drive the folder picker: open the dialog, select the first folder row, confirm Connect. */
  async function pickAndConnect(fixture: ComponentFixture<ProjectsHomeComponent>): Promise<void> {
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!.click();
    await settle(fixture);
    const row = host.querySelector<HTMLElement>('[data-testid="fs-row"]')!;
    row.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!.click();
    await settle(fixture);
  }

  beforeEach(() => {
    api = {
      listProjects: vi.fn().mockResolvedValue([]),
      connectProject: vi.fn(),
      getProject: vi.fn(),
    };
    fs = {
      roots: vi.fn().mockResolvedValue({ roots: [{ label: 'Home', path: '/home/me' }], recent: [] }),
      list: vi.fn().mockResolvedValue({
        path: '/home/me',
        parent: null,
        entries: [{ name: 'payments-api', type: 'dir', hasProject: false }],
        truncated: false,
      }),
    };
  });

  it('shows the first-run empty state with the product name and the approved anchor line', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="empty-state"]')).toBeTruthy();
    const text = host.textContent ?? '';
    expect(text).toContain('DART');
    expect(text).toContain(
      "A full AI dev team — and a process it can't skip — for the code already on your machine.",
    );
    // The dead-end copy is gone.
    expect(text).not.toContain('No projects yet');
  });

  it('first-run state renders the 3-step "how it works" with the approved step labels', async () => {
    const fixture = await mount();
    const steps = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="empty-step"]');
    expect(steps).toHaveLength(3);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Connect a folder');
    expect(text).toContain('DART reads it');
    expect(text).toContain('The team gets to work');
    expect(text).toContain('Nothing is uploaded');
  });

  it('first-run state renders the trust strip of honest chips', async () => {
    const fixture = await mount();
    const chips = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="trust-chip"]');
    expect(chips.length).toBeGreaterThanOrEqual(3);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Local-first');
    expect(text).toContain('Open-source (MIT)');
  });

  it('first-run secondary CTA reads the docs (no sample project, no signup)', async () => {
    const fixture = await mount();
    const docs = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="read-docs"]');
    expect(docs?.textContent).toContain('Read the docs');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/free trial|get started for free|sign up/i);
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

  it('connects a folder via the picker: posts the chosen path, shows analyzing, then the new card appears', async () => {
    const fixture = await mount();
    let resolveConnect!: (r: ConnectResult) => void;
    api.connectProject.mockReturnValue(new Promise<ConnectResult>((r) => (resolveConnect = r)));

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!.click();
    await settle(fixture);
    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!.click();
    await settle(fixture);

    expect(host.querySelector('[data-testid="connect-analyzing"]')).toBeTruthy();
    expect(api.connectProject).toHaveBeenCalledWith('/home/me/payments-api');

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
    await pickAndConnect(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="connect-error"]')?.textContent).toContain('path does not exist');
  });

  it('shows the global needs-you strip summing across projects when any are > 0', async () => {
    api.listProjects.mockResolvedValue([
      record('aaaaaaaaaaaa', 'a', { taskSummary: { open: 5, needsYou: 2 } }),
      record('bbbbbbbbbbbb', 'b', { taskSummary: { open: 3, needsYou: 1 } }),
    ]);
    const fixture = await mount();
    const strip = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="needs-you-strip"]');
    expect(strip).toBeTruthy();
    expect(strip!.textContent).toContain('3 need you');
    expect(strip!.textContent).toContain('2 projects');
  });

  it('omits the global needs-you signal when the cross-project sum is 0 (absent-not-zero)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'a', { taskSummary: { open: 5, needsYou: 0 } })]);
    const fixture = await mount();
    const strip = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="needs-you-strip"]');
    // The strip still shows the projects count, but no "need you" signal.
    expect(strip?.textContent ?? '').not.toContain('need you');
  });
});
