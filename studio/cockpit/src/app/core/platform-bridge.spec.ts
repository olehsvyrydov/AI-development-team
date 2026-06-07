import { describe, expect, it } from 'vitest';
import { BrowserPlatformBridge, PLATFORM_BRIDGE, WRITE_GUARD_HEADER } from './platform-bridge';

describe('BrowserPlatformBridge', () => {
  it('resolves API paths against a same-origin relative base by default', () => {
    const bridge = new BrowserPlatformBridge();
    expect(bridge.apiUrl('/api/projects')).toBe('/api/projects');
    expect(bridge.apiUrl('api/projects')).toBe('/api/projects');
  });

  it('honours an explicit base URL (so an IDE/Tauri host can point elsewhere) without double slashes', () => {
    const bridge = new BrowserPlatformBridge('http://127.0.0.1:4477');
    expect(bridge.apiUrl('/api/projects')).toBe('http://127.0.0.1:4477/api/projects');
    expect(bridge.apiUrl('api/projects')).toBe('http://127.0.0.1:4477/api/projects');
  });

  it('strips a trailing slash from the configured base', () => {
    const bridge = new BrowserPlatformBridge('http://127.0.0.1:4477/');
    expect(bridge.apiUrl('/api/projects/connect')).toBe('http://127.0.0.1:4477/api/projects/connect');
  });

  it('exposes the write-guard header the hub requires on mutations', () => {
    const bridge = new BrowserPlatformBridge();
    expect(bridge.writeHeaders()).toEqual({ [WRITE_GUARD_HEADER]: '1' });
  });

  it('publishes a stable injection token for host swapping', () => {
    expect(PLATFORM_BRIDGE.toString()).toContain('PlatformBridge');
  });
});
