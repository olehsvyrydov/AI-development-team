import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, type ConnectResult } from '../core/api.service';
import { FsService } from '../core/fs.service';
import { ProjectEventsService } from '../core/events.service';
import { ROLLUP_ANNOUNCE_DEBOUNCE_MS } from '../core/rollup.store';
import { ProjectsHomeComponent } from './projects-home.component';
import { settle } from '../testing/settle';
import type { ProjectRecord, RollupFrame, RollupProjectEntry } from '../core/models';

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
  let rollupFrames: Subject<RollupFrame>;

  function entry(over: Partial<RollupProjectEntry> = {}): RollupProjectEntry {
    return { id: 'a', label: 'a', status: 'connected', open: 0, needsYou: 0, stateChangedAt: Date.now(), live: true, ...over };
  }
  function frame(projects: RollupProjectEntry[]): RollupFrame {
    return {
      totalOpen: projects.reduce((s, p) => s + p.open, 0),
      totalNeedsYou: projects.reduce((s, p) => s + p.needsYou, 0),
      projects,
    };
  }

  async function mount(): Promise<ComponentFixture<ProjectsHomeComponent>> {
    TestBed.configureTestingModule({
      imports: [ProjectsHomeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: FsService, useValue: fs },
        { provide: ProjectEventsService, useValue: { connectRollup: () => rollupFrames.asObservable() } },
        { provide: ROLLUP_ANNOUNCE_DEBOUNCE_MS, useValue: 5 },
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
    rollupFrames = new Subject<RollupFrame>();
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

  it('renders a dedicated cockpit strip routing to each waiting project when the sum is > 0', async () => {
    api.listProjects.mockResolvedValue([
      record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } }),
      record('bbbbbbbbbbbb', 'data-pipeline', { taskSummary: { open: 3, needsYou: 1 } }),
      record('cccccccccccc', 'marketing-site', { taskSummary: { open: 4, needsYou: 0 } }),
    ]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const cockpit = host.querySelector('[data-testid="cockpit-strip"]');
    expect(cockpit).toBeTruthy();
    // Sums across projects and names how many projects are waiting.
    expect(cockpit!.textContent).toContain('3');
    expect(cockpit!.textContent).toContain('2 projects');
    // One router-link chip per project with needsYou > 0, ordered by descending need; the
    // all-clear project contributes no chip (absent-not-zero).
    const chips = cockpit!.querySelectorAll<HTMLAnchorElement>('[data-testid="cockpit-chip"]');
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute('href')).toContain('/projects/aaaaaaaaaaaa');
    expect(chips[0].textContent).toContain('payments-api');
    expect(chips[0].textContent).toContain('2');
    expect(chips[1].textContent).toContain('data-pipeline');
    // The all-clear project must not appear as a waiting chip.
    expect(cockpit!.textContent).not.toContain('marketing-site');
  });

  it('routes the only announcing live region to a dedicated sr-only total announcer, never the chips', async () => {
    api.listProjects.mockResolvedValue([
      record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } }),
      record('bbbbbbbbbbbb', 'data-pipeline', { taskSummary: { open: 3, needsYou: 1 } }),
    ]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    // There is exactly ONE announcing live region, and it is the dedicated sr-only announcer.
    const liveRegions = host.querySelectorAll('[aria-live]');
    expect(liveRegions).toHaveLength(1);
    const announcer = host.querySelector('[data-testid="rollup-announcer"]')!;
    expect(announcer.getAttribute('aria-live')).toBe('polite');
    expect(announcer.getAttribute('aria-atomic')).toBe('true');
    // The announcer never wraps the focusable chips.
    expect(announcer.querySelector('a')).toBeNull();
    // The chips still render in the band, just outside any announced region.
    expect(host.querySelectorAll('[data-testid="cockpit-chip"]')).toHaveLength(2);
  });

  it('does not render the cockpit strip at all when nothing needs you (absent-not-zero)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'a', { taskSummary: { open: 5, needsYou: 0 } })]);
    const fixture = await mount();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="cockpit-strip"]')).toBeNull();
  });

  it('escapes an untrusted project name in the cockpit strip chip (never live markup)', async () => {
    const evil = '<img src=x onerror="window.__xss2=1">';
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', evil, { taskSummary: { open: 1, needsYou: 1 } })]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="cockpit-strip"] img[src="x"]')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__xss2']).toBeUndefined();
  });

  it('shows the populated header one-liner that frames the roster (not just a bare title)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api')]);
    const fixture = await mount();
    const sub = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="home-subhead"]');
    expect(sub).toBeTruthy();
    expect(sub!.textContent).toMatch(/AI (dev )?team/i);
  });

  it('gates the grid stagger-enter motion behind a reduced-motion check (data-motion attribute)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api')]);
    const fixture = await mount();
    const grid = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="home-grid"]')!;
    // The grid exposes a single motion gate; the keyframes are zeroed in one place by the
    // reduced-motion media query, so the attribute is the only thing tests need to assert.
    expect(grid.getAttribute('data-motion')).toMatch(/^(on|off)$/);
  });

  it('labels the rollup as a NEEDS YOU band over the existing chip strip', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } })]);
    const fixture = await mount();
    const band = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="cockpit-strip"]')!;
    expect(band.textContent?.toUpperCase()).toContain('NEEDS YOU');
  });

  it('reflects a live rollup frame in the strip total and band lead without a reload', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } })]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', label: 'payments-api', open: 9, needsYou: 7 })]));
    await settle(fixture);

    expect(host.querySelector('[data-testid="global-needs-you"]')!.textContent).toContain('7');
    expect(host.querySelector('[data-testid="cockpit-strip"]')!.textContent).toContain('7');
  });

  it('updates the matching card freshness from a live frame (live state with a ringed dot)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } })]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', label: 'payments-api', open: 5, needsYou: 2, stateChangedAt: Date.now() })]));
    await settle(fixture);

    const fresh = host.querySelector('[data-testid="project-card"] [data-testid="freshness"]')!;
    expect(fresh.getAttribute('data-state')).toBe('live');
  });

  it('shows the dedicated announcer empty on first paint (no first-paint / no-op announce)', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } })]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', needsYou: 5 })]));
    await settle(fixture);
    // The first frame is the page state the user landed on — it is NOT announced.
    expect(host.querySelector('[data-testid="rollup-announcer"]')!.textContent?.trim()).toBe('');
  });

  it('announces a net total change once (debounced) in the dedicated polite region', async () => {
    api.listProjects.mockResolvedValue([record('aaaaaaaaaaaa', 'payments-api', { taskSummary: { open: 5, needsYou: 2 } })]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', needsYou: 2 })]));
    await settle(fixture);
    // A burst of pushes settles to one announcement of the final value.
    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', needsYou: 4 })]));
    rollupFrames.next(frame([entry({ id: 'aaaaaaaaaaaa', needsYou: 6 })]));
    await settle(fixture);

    const announcer = host.querySelector('[data-testid="rollup-announcer"]')!;
    expect(announcer.textContent).toContain('6');
    expect(announcer.textContent).toMatch(/need you/i);
  });

  it('does NOT re-sort the card grid when a live frame arrives (spatial stability)', async () => {
    api.listProjects.mockResolvedValue([
      record('aaaaaaaaaaaa', 'alpha', { taskSummary: { open: 1, needsYou: 1 } }),
      record('bbbbbbbbbbbb', 'bravo', { taskSummary: { open: 1, needsYou: 1 } }),
    ]);
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const order = () =>
      Array.from(host.querySelectorAll('[data-testid="project-card"]')).map((c) => c.getAttribute('href'));
    const before = order();

    // A frame that would re-rank by needsYou must NOT move the cards.
    rollupFrames.next(
      frame([
        entry({ id: 'aaaaaaaaaaaa', label: 'alpha', needsYou: 1 }),
        entry({ id: 'bbbbbbbbbbbb', label: 'bravo', needsYou: 9 }),
      ]),
    );
    await settle(fixture);

    expect(order()).toEqual(before);
  });
});
