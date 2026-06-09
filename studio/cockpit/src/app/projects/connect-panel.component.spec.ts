import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectPanelComponent, type ConnectOutcome } from './connect-panel.component';
import { FsService } from '../core/fs.service';
import { settle } from '../testing/settle';

function makeFs() {
  return {
    roots: vi.fn().mockResolvedValue({ roots: [{ label: 'Home', path: '/home/me' }], recent: [] }),
    list: vi.fn().mockResolvedValue({
      path: '/home/me',
      parent: null,
      entries: [{ name: 'payments-api', type: 'dir', hasProject: false }],
      truncated: false,
    }),
  };
}

async function mount(over: Partial<{ status: string; error: string | null; outcome: ConnectOutcome | null }> = {}) {
  TestBed.configureTestingModule({
    imports: [ConnectPanelComponent],
    providers: [{ provide: FsService, useValue: makeFs() }],
  });
  const fixture = TestBed.createComponent(ConnectPanelComponent);
  fixture.componentRef.setInput('status', over.status ?? 'idle');
  fixture.componentRef.setInput('error', over.error ?? null);
  if ('outcome' in over) fixture.componentRef.setInput('outcome', over.outcome ?? null);
  fixture.detectChanges();
  await settle(fixture);
  return fixture as ComponentFixture<ConnectPanelComponent>;
}

describe('ConnectPanelComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('shows the "Add a project" cell with a Choose-a-folder button (no free-text path field)', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="open-picker"]')).toBeTruthy();
    expect(host.textContent).toContain('Add a project');
    expect(host.querySelector('[data-testid="connect-path"]')).toBeNull();
  });

  it('uses the approved add-project cell body copy in the idle state', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Point DART at another folder on this machine');
  });

  it('opens the folder-picker dialog when the button is clicked', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!.click();
    await settle(fixture);
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('emits connect with the chosen path and closes the dialog', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const connect = vi.fn();
    fixture.componentInstance.connect.subscribe(connect);

    host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!.click();
    await settle(fixture);
    host.querySelector<HTMLElement>('[data-testid="fs-row"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="picker-connect"]')!.click();
    await settle(fixture);

    expect(connect).toHaveBeenCalledWith('/home/me/payments-api');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('returns focus to the opener button when the dialog is closed with Escape', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const opener = host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!;

    opener.focus();
    opener.click();
    await settle(fixture);
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).toBeTruthy();

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.ownerDocument.activeElement).toBe(
      host.querySelector('[data-testid="open-picker"]'),
    );
  });

  it('returns focus to the opener button when the dialog is cancelled', async () => {
    const fixture = await mount();
    const host = fixture.nativeElement as HTMLElement;
    const opener = host.querySelector<HTMLButtonElement>('[data-testid="open-picker"]')!;

    opener.focus();
    opener.click();
    await settle(fixture);
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();

    host.querySelector<HTMLButtonElement>('[data-testid="picker-cancel"]')!.click();
    await settle(fixture);

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.ownerDocument.activeElement).toBe(
      host.querySelector('[data-testid="open-picker"]'),
    );
  });

  it('shows the analysing state while a connect is in flight', async () => {
    const fixture = await mount({ status: 'analyzing' });
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="connect-analyzing"]')).toBeTruthy();
  });

  it('shows the Initialised outcome when connect created a fresh profile', async () => {
    const init = await mount({
      status: 'ready',
      outcome: { created: true, source: 'analysis', title: 'payments-api', tickets: 0, docs: 8 },
    });
    expect((init.nativeElement as HTMLElement).textContent).toContain('Initialised');
  });

  it('shows the Adopted outcome with the ticket/doc counts when an existing project is found', async () => {
    const adopt = await mount({
      status: 'ready',
      outcome: { created: false, source: 'artefacts', title: 'ai-dev-team', tickets: 12, docs: 8 },
    });
    const text = (adopt.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Adopted — found existing project');
    expect(text).toContain('12 tickets');
    expect(text).toContain('8 docs');
  });

  it('shows the hub error in the error state with a retry', async () => {
    const fixture = await mount({ status: 'error', error: 'path does not exist' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="connect-error"]')?.textContent).toContain('path does not exist');
  });
});
