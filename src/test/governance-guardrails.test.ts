import { beforeEach, describe, expect, it, vi } from 'vitest';

const originalWindow = globalThis.window;

function setWindowHost(hostname: string) {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { hostname },
    },
    configurable: true,
    writable: true,
  });
}

describe('governance guardrails', () => {
  beforeEach(() => {
    vi.resetModules();
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    }
  });

  it('blocks sandbox data by default when flags are absent', async () => {
    setWindowHost('localhost');
    vi.stubEnv('VITE_ENABLE_DEMO_MODE', undefined);
    vi.stubEnv('VITE_ENABLE_SANDBOX_DATA', undefined);

    const runtime = await import('@/lib/runtime-mode');
    expect(runtime.isDemoModeEnabled()).toBe(false);
    expect(runtime.isSandboxDataEnabled()).toBe(false);
  });

  it('allows synthetic sandbox access only with both flags on localhost', async () => {
    setWindowHost('localhost');
    vi.stubEnv('VITE_ENABLE_DEMO_MODE', 'true');
    vi.stubEnv('VITE_ENABLE_SANDBOX_DATA', 'true');

    const runtime = await import('@/lib/runtime-mode');
    expect(runtime.isSandboxDataEnabled()).toBe(true);
  });

  it('blocks synthetic sandbox access on non-local hosts even when flags are enabled', async () => {
    setWindowHost('tracker.example.com');
    vi.stubEnv('VITE_ENABLE_DEMO_MODE', 'true');
    vi.stubEnv('VITE_ENABLE_SANDBOX_DATA', 'true');

    const runtime = await import('@/lib/runtime-mode');
    expect(runtime.isSandboxDataEnabled()).toBe(false);
  });

  it('prevents tracker and p2p synthetic generators outside the governed sandbox path', async () => {
    setWindowHost('localhost');
    vi.stubEnv('VITE_ENABLE_DEMO_MODE', 'false');
    vi.stubEnv('VITE_ENABLE_SANDBOX_DATA', 'true');

    const { createDemoState } = await import('@/lib/tracker-demo-data');
    const { generateP2PHistory } = await import('@/lib/p2p-demo-data');

    expect(() => createDemoState()).toThrow(/disabled by governance policy/i);
    expect(() => generateP2PHistory()).toThrow(/disabled by governance policy/i);
  });
});
