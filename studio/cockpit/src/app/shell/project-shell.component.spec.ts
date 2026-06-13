import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { BrowserPlatformBridge, PLATFORM_BRIDGE } from '../core/platform-bridge';
import { EVENT_SOURCE_FACTORY, ProjectEventsService } from '../core/events.service';
import { ControlPlaneService } from '../core/control-plane.service';
import { ProjectShellComponent } from './project-shell.component';
import { settle } from '../testing/settle';
import type { ProjectView } from '../core/models';

function view(profile: ProjectView['profile'], state: ProjectView['state'] = { preset: 'solo' }): ProjectView {
  return {
    record: { id: 'aaaaaaaaaaaa', path: '/p', label: 'lbl', addedAt: 't', lastSeen: 't', status: 'connected' },
    profile,
    state,
  };
}

const RICH_STATE: ProjectView['state'] = {
  preset: 'full',
  taskSummary: { total: 14, byStatus: { in_progress: 8, waiting: 0, needsYou: 2, blocked: 1, done: 3 } },
  workflowView: {
    activeTrack: 'full',
    stages: [
      { stage: 'vision', owner: '/po', gate: null },
      { stage: 'architecture', owner: '/arch', gate: { name: 'ARCH_APPROVED', refusal: 'hard' } },
      { stage: 'design', owner: '/ui', gate: { name: 'DESIGN_APPROVED', refusal: 'soft' } },
    ],
  },
  knowledge: {
    method: 'local-embeddings',
    stack: ['java'],
    counts: { project: 8, common: 0 },
    docs: [{ name: 'code-rules', scope: 'project', stack: ['java'], kind: 'rule', index: 'indexed' }],
  },
};

describe('ProjectShellComponent', () => {
  let api: { getProject: ReturnType<typeof vi.fn> };

  async function mount(id = 'aaaaaaaaaaaa'): Promise<ComponentFixture<ProjectShellComponent>> {
    TestBed.configureTestingModule({
      imports: [ProjectShellComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: PLATFORM_BRIDGE, useValue: new BrowserPlatformBridge() },
        {
          provide: EVENT_SOURCE_FACTORY,
          useValue: () => ({ addEventListener() {}, close() {} }),
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectShellComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  beforeEach(() => {
    api = { getProject: vi.fn().mockResolvedValue(view({ title: 'payments-api', description: 'VAT-aware billing.' })) };
  });

  it('scopes the control plane to the route project id so every mutation targets the viewed project', async () => {
    const setProject = vi.spyOn(ControlPlaneService.prototype, 'setProject');
    await mount('abcdef123456');
    expect(setProject).toHaveBeenCalledWith('abcdef123456');
  });

  it('subscribes to the viewed project live stream with ?project=<route id>', async () => {
    const connect = vi.spyOn(ProjectEventsService.prototype, 'connect');
    await mount('abcdef123456');
    expect(connect).toHaveBeenCalledWith('abcdef123456');
  });

  it('loads the project by route id and shows its title and description', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(api.getProject).toHaveBeenCalledWith('aaaaaaaaaaaa');
    expect(host.textContent).toContain('payments-api');
    expect(host.textContent).toContain('VAT-aware billing.');
  });

  it('renders the Workflow / Tasks / Base panels', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="panel-workflow"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="panel-tasks"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="panel-base"]')).toBeTruthy();
  });

  it('shows the FULL description in its own block, untruncated (no single-line ellipsis clamp)', async () => {
    const long =
      'A VAT-aware billing and invoicing service for UK merchants. It generates compliant ' +
      'invoices, handles refunds, and reconciles payments against orders across many lines of prose.';
    api.getProject.mockResolvedValue(view({ title: 'payments-api', description: long }));
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const block = host.querySelector<HTMLElement>('[data-testid="shell-description"]')!;
    expect(block).toBeTruthy();
    expect(block.textContent).toContain(long);
    // The description lives in its own full-width block, not the truncated header line.
    expect(getComputedStyle(block).whiteSpace).not.toBe('nowrap');
  });

  it('drives the panels from the project state (counts, workflow stages, base method)', async () => {
    api.getProject.mockResolvedValue(view({ title: 'payments-api', description: 'd' }, RICH_STATE));
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="panel-tasks"]')?.textContent).toContain('14');
    expect(host.querySelector('[data-testid="panel-workflow"]')?.textContent).toContain('/arch');
    expect(host.querySelector('[data-testid="panel-base"]')?.textContent).toContain('Indexed via: local embeddings (semantic)');
  });

  it('does not hard-cap the work surface at 76rem so wide monitors fill the available width', async () => {
    const fixture = await mount();
    const body = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.shell-body')!;
    const maxWidth = getComputedStyle(body).maxWidth;
    // The old fixed ~1216px box (76rem) is gone: either unconstrained, or a generous cap well above it.
    if (maxWidth && maxWidth !== 'none') {
      const value = parseFloat(maxWidth);
      const remThreshold = /rem\s*$/.test(maxWidth) ? 76 : 76 * 16;
      expect(Number.isNaN(value) ? Infinity : value).toBeGreaterThan(remThreshold);
    }
  });

  it('renders the live connection dot in the header', async () => {
    const fixture = await mount();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="shell-conn"]')).toBeTruthy();
  });

  it('isolates a panel failure: one panel erroring still renders the other two', async () => {
    // Make ONLY the Tasks derivation throw (a getter that blows up); Workflow + Base must survive.
    const broken: ProjectView['state'] = { ...RICH_STATE };
    Object.defineProperty(broken, 'taskSummary', {
      enumerable: true,
      get() {
        throw new Error('bad summary');
      },
    });
    api.getProject.mockResolvedValue(view({ title: 'p', description: 'd' }, broken));
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="panel-tasks-error"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="panel-workflow"]')?.textContent).toContain('/arch');
    expect(host.querySelector('[data-testid="panel-base"]')?.textContent).toContain('docs');
  });

  it('offers a way back to the launcher', async () => {
    const fixture = await mount();
    const back = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('[data-testid="back-to-projects"]')!;
    expect(back.getAttribute('href')).toBe('/');
  });

  it('escapes an untrusted title/description rather than injecting markup (XSS guard)', async () => {
    const evil = '<svg onload="window.__xssShell=1">';
    api.getProject.mockResolvedValue(view({ title: evil, description: `d ${evil}` }));
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    // The header renders a decorative inline-SVG glyph, so an svg element legitimately exists.
    // The XSS guard is that NO svg parsed from the untrusted payload reaches the DOM: none carries
    // the injected handler, and the side-effect never runs.
    const injected = [...host.querySelectorAll('svg')].filter((el) => el.hasAttribute('onload'));
    expect(injected).toEqual([]);
    expect((window as unknown as Record<string, unknown>)['__xssShell']).toBeUndefined();
    expect(host.textContent).toContain('<svg');
  });

  it('shows an error when the project cannot be loaded', async () => {
    api.getProject.mockRejectedValue(new Error('unknown project'));
    const fixture = await mount('zzzzzzzzzzzz');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="shell-error"]')?.textContent).toContain('unknown project');
  });

  it('opens the in-shell tasks board from the Tasks panel and can return to the panels', async () => {
    api.getProject.mockResolvedValue(
      view({ title: 'p', description: 'd' }, {
        ...RICH_STATE,
        rev: 'r1',
        tracks: { full: ['vision', 'architecture', 'design', 'done'] },
        gateDefs: [{ name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' }],
        tickets: [{ id: 'ADT-9', title: 'Board task', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/be', gates: [], comments: [] }],
      }),
    );
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-testid="tasks-open-board"]')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeTruthy();
    // The board opens on its default worklist view (one populated stage → not the pipeline); the
    // ticket renders as a card regardless of view mode.
    expect(host.querySelector('[data-testid="card-ADT-9"]')?.textContent).toContain('ADT-9');

    host.querySelector<HTMLButtonElement>('[data-testid="board-back"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeNull();
    expect(host.querySelector('[data-testid="panel-tasks"]')).toBeTruthy();
  });

  it('Edit workflow opens the board with the pipeline armed for editing (the one control plane), and returns to the panels', async () => {
    api.getProject.mockResolvedValue(
      view({ title: 'p', description: 'd' }, {
        ...RICH_STATE,
        rev: 'r1',
        tracks: { full: ['vision', 'architecture', 'design', 'done'] },
        gateDefs: [{ name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch', trigger: ['change-class'] }],
        tickets: [
          { id: 'V-1', title: 'Visioning', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/po', gates: [], comments: [] },
          { id: 'A-1', title: 'Architecting', status: 'in_progress', stage: 'architecture', track: 'full', assignee: '/arch', gates: [], comments: [] },
        ],
      }),
    );
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    // The standalone builder destination is retired — there is no separate builder view.
    expect(host.querySelector('[data-testid="workflow-builder-view"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-testid="workflow-full-link"]')!.click();
    fixture.detectChanges();
    await settle(fixture);

    // Editing now happens IN PLACE on the pipeline chain: the board opens armed in edit-mode.
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="pipeline-chain"]')?.getAttribute('data-mode')).toBe('edit');
    expect(host.querySelector('[data-testid="pipeline-overlay-banner"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="stage-grip-architecture"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="board-back"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeNull();
    expect(host.querySelector('[data-testid="panel-workflow"]')).toBeTruthy();
  });

  it('opens the dedicated Knowledge page from the panel Manage footer and can return to the panels', async () => {
    api.getProject.mockResolvedValue(
      view({ title: 'p', description: 'd' }, {
        ...RICH_STATE,
        rev: 'r1',
        knowledge: {
          method: 'filename-only',
          stack: ['java'],
          counts: { project: 1, common: 0 },
          docs: [{ name: 'code-rules', file: 'docs/code-rules.md', rev: 'm:1', scope: 'project', stack: ['java'], kind: 'rule', index: 'indexed', provenance: 'you' }],
        },
      }),
    );
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="knowledge-page-view"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-testid="base-manage"]')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(host.querySelector('[data-testid="knowledge-page-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="kb-doc-list"]')?.textContent).toContain('code-rules');

    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-back"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="knowledge-page-view"]')).toBeNull();
    expect(host.querySelector('[data-testid="panel-base"]')).toBeTruthy();
  });

  it('the Knowledge page is mutually exclusive with the board', async () => {
    api.getProject.mockResolvedValue(
      view({ title: 'p', description: 'd' }, {
        ...RICH_STATE,
        rev: 'r1',
        tracks: { full: ['vision', 'architecture', 'design', 'done'] },
        gateDefs: [{ name: 'ARCH_APPROVED', refusal: 'hard', owner: '/arch' }],
        tickets: [{ id: 'ADT-9', title: 'Board task', status: 'in_progress', stage: 'vision', track: 'full', assignee: '/be', gates: [], comments: [] }],
        knowledge: { method: 'filename-only', stack: ['java'], counts: { project: 1, common: 0 }, docs: [{ name: 'code-rules', scope: 'project', index: 'indexed' }] },
      }),
    );
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;

    // Open the board, then open Knowledge: the board must close (one view at a time).
    host.querySelector<HTMLButtonElement>('[data-testid="tasks-open-board"]')!.click();
    fixture.detectChanges();
    await settle(fixture);
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="knowledge-back"]'); // not present yet
    fixture.componentInstance.openKnowledge();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="knowledge-page-view"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeNull();

    // Opening the board again closes Knowledge.
    fixture.componentInstance.openBoard();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="knowledge-page-view"]')).toBeNull();
    expect(host.querySelector('[data-testid="tasks-board-view"]')).toBeTruthy();
  });
});
