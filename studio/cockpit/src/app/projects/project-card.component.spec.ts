import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ProjectCardComponent } from './project-card.component';
import type { ProjectView } from '../core/models';

function view(over: Partial<ProjectView['profile']> = {}): ProjectView {
  return {
    record: { id: 'aaaaaaaaaaaa', path: '/p', label: 'fallback-label', addedAt: 't', lastSeen: '2026-06-01T00:00:00.000Z', status: 'connected' },
    profile: { title: 'payments-api', description: 'VAT-aware billing service.', ...over },
    state: null,
  };
}

async function mount(v: ProjectView): Promise<ComponentFixture<ProjectCardComponent>> {
  TestBed.configureTestingModule({
    imports: [ProjectCardComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(ProjectCardComponent);
  fixture.componentRef.setInput('view', v);
  fixture.detectChanges();
  return fixture;
}

describe('ProjectCardComponent', () => {
  it('shows the title, description and a status indicator', async () => {
    const fixture = await mount(view());
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('payments-api');
    expect(host.textContent).toContain('VAT-aware billing service.');
    expect(host.querySelector('[data-testid="status"]')).toBeTruthy();
  });

  it('falls back to the registry label when no profile title is present', async () => {
    const fixture = await mount({ ...view(), profile: null });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('fallback-label');
  });

  it('links into the project shell by id', async () => {
    const fixture = await mount(view());
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[data-testid="project-card"]')!;
    expect(link.getAttribute('href')).toContain('/projects/aaaaaaaaaaaa');
  });

  it('exposes an accessible name for the card link', async () => {
    const fixture = await mount(view());
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[data-testid="project-card"]')!;
    expect(link.getAttribute('aria-label')).toContain('payments-api');
  });
});
