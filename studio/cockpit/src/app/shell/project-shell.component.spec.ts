import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../core/api.service';
import { ProjectShellComponent } from './project-shell.component';
import { settle } from '../testing/settle';
import type { ProjectView } from '../core/models';

function view(profile: ProjectView['profile']): ProjectView {
  return {
    record: { id: 'aaaaaaaaaaaa', path: '/p', label: 'lbl', addedAt: 't', lastSeen: 't', status: 'connected' },
    profile,
    state: { preset: 'solo' },
  };
}

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

  it('loads the project by route id and shows its title and description', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(api.getProject).toHaveBeenCalledWith('aaaaaaaaaaaa');
    expect(host.textContent).toContain('payments-api');
    expect(host.textContent).toContain('VAT-aware billing.');
  });

  it('renders placeholders for the Workflow / Tasks / Base panels (later tickets)', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="panel-workflow"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="panel-tasks"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="panel-base"]')).toBeTruthy();
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
    expect(host.querySelector('svg')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__xssShell']).toBeUndefined();
    expect(host.textContent).toContain('<svg');
  });

  it('shows an error when the project cannot be loaded', async () => {
    api.getProject.mockRejectedValue(new Error('unknown project'));
    const fixture = await mount('zzzzzzzzzzzz');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="shell-error"]')?.textContent).toContain('unknown project');
  });
});
