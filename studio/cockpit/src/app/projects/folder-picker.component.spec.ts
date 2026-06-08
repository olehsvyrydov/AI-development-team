import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderPickerComponent } from './folder-picker.component';
import { FsService } from '../core/fs.service';
import { settle } from '../testing/settle';

function makeFs() {
  return {
    roots: vi.fn().mockResolvedValue({
      roots: [{ label: 'Home', path: '/home/me' }],
      recent: [{ label: 'ai-dev-team', path: '/home/me/git/ai-dev-team' }],
    }),
    list: vi.fn().mockResolvedValue({
      path: '/home/me',
      parent: null,
      entries: [
        { name: 'payments-api', type: 'dir', hasProject: false },
        { name: 'ai-dev-team', type: 'dir', hasProject: true },
      ],
      truncated: false,
    }),
  };
}

async function mount(fs: ReturnType<typeof makeFs>): Promise<ComponentFixture<FolderPickerComponent>> {
  TestBed.configureTestingModule({
    imports: [FolderPickerComponent],
    providers: [{ provide: FsService, useValue: fs }],
  });
  const fixture = TestBed.createComponent(FolderPickerComponent);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('FolderPickerComponent', () => {
  let fs: ReturnType<typeof makeFs>;
  beforeEach(() => {
    fs = makeFs();
  });

  it('opens as a modal dialog and loads the roots + the Home listing', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(fs.roots).toHaveBeenCalled();
    expect(fs.list).toHaveBeenCalled();
  });

  it('renders a listbox of folder rows, with a "has project" marker where applicable', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const listbox = host.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    const rows = host.querySelectorAll('[data-testid="fs-row"]');
    expect(rows).toHaveLength(2);
    expect(host.textContent).toContain('payments-api');
    expect(host.querySelector('[data-testid="has-project"]')).toBeTruthy();
  });

  it('ships the approved reassurance subtitle and footer verbatim', async () => {
    const fixture = await mount(fs);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('DART reads this folder on your machine to understand the project. Nothing is uploaded.');
    expect(text).toContain('Read-only analysis. DART never writes outside this folder.');
  });

  it('defaults the selection to the current directory so Connect is enabled on open', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const connect = host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!;
    expect(connect.disabled).toBe(false);
    expect(host.querySelector('[data-testid="selected-path"]')!.textContent).toContain('Selected: /home/me');
  });

  it('connects the current directory when the user navigates in and clicks Connect (no child selected)', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!.click();
    expect(chosen).toHaveBeenCalledWith('/home/me');
  });

  it('re-defaults the selection to the new current directory after drilling in', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    fs.list.mockResolvedValueOnce({
      path: '/home/me/payments-api',
      parent: '/home/me',
      entries: [{ name: 'src', type: 'dir', hasProject: false }],
      truncated: false,
    });
    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const connect = host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!;
    expect(connect.disabled).toBe(false);
    expect(host.querySelector('[data-testid="selected-path"]')!.textContent).toContain('Selected: /home/me/payments-api');
  });

  it('selects a child folder on single-click, echoes it, and keeps Connect enabled', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const connect = host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!;

    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.click();
    fixture.detectChanges();

    const selected = host.querySelector<HTMLElement>('[data-testid="fs-row"]')!;
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[data-testid="selected-path"]')!.textContent).toContain('/home/me/payments-api');
    expect(connect.disabled).toBe(false);
  });

  it('emits the chosen path on Connect', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!.click();

    expect(chosen).toHaveBeenCalledWith('/home/me/payments-api');
  });

  it('drills into a folder on double-click, listing its children and updating the breadcrumb', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    fs.list.mockResolvedValueOnce({
      path: '/home/me/payments-api',
      parent: '/home/me',
      entries: [{ name: 'src', type: 'dir', hasProject: false }],
      truncated: false,
    });
    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    expect(fs.list).toHaveBeenLastCalledWith('/home/me/payments-api');
    expect(host.textContent).toContain('src');
  });

  it('shows an inline alert when a listing is refused, without crashing the dialog', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    fs.list.mockRejectedValueOnce(new Error("couldn't read this folder"));
    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle(fixture);

    const alert = host.querySelector('[data-testid="fs-error"]');
    expect(alert).toBeTruthy();
    expect(alert!.textContent).toContain("couldn't read this folder");
    // The dialog is still present.
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('closes on Escape and emits cancel', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    host.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(cancelled).toHaveBeenCalled();
  });

  it('renders the breadcrumb root once, without a doubled separator before home', async () => {
    const fixture = await mount(fs);
    const host = fixture.nativeElement as HTMLElement;
    const crumbs = host.querySelector('[aria-label="Current path"]')!;
    const labels = [...crumbs.querySelectorAll('.crumb')].map((c) => c.textContent?.trim());
    // The root segment is the first crumb; "home" must not be preceded by an empty root label.
    expect(labels[0]).not.toBe('/');
    expect(labels).toEqual(['home', 'me']);
  });

  it('navigates up via the Up control when a parent exists', async () => {
    const fs2 = makeFs();
    fs2.list = vi
      .fn()
      .mockResolvedValueOnce({
        path: '/home/me/git',
        parent: '/home/me',
        entries: [{ name: 'ai-dev-team', type: 'dir', hasProject: true }],
        truncated: false,
      })
      .mockResolvedValueOnce({
        path: '/home/me',
        parent: null,
        entries: [{ name: 'git', type: 'dir', hasProject: false }],
        truncated: false,
      });
    const fixture = await mount(fs2);
    const host = fixture.nativeElement as HTMLElement;

    const up = host.querySelector<HTMLButtonElement>('[data-testid="fs-up"]')!;
    expect(up.disabled).toBe(false);
    up.click();
    await settle(fixture);
    expect(fs2.list).toHaveBeenLastCalledWith('/home/me');
  });
});
