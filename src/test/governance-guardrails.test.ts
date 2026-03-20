import { describe, expect, it } from 'vitest';
import { assertSyntheticSandboxAccess, isLocalDevelopmentHost, isSyntheticSandboxAccessAllowed, syntheticSandboxBlockMessage } from '@/lib/governance';
import { isDemoModeEnabled, isSandboxDataEnabled } from '@/lib/runtime-mode';

describe('governance guardrails', () => {
  it('keeps demo and sandbox runtime modes permanently disabled', () => {
    expect(isDemoModeEnabled()).toBe(false);
    expect(isSandboxDataEnabled()).toBe(false);
  });

  it('keeps synthetic sandbox access permanently disabled', () => {
    expect(isLocalDevelopmentHost()).toBe(false);
    expect(isSyntheticSandboxAccessAllowed()).toBe(false);
  });

  it('returns a permanent governance block message', () => {
    expect(syntheticSandboxBlockMessage('Synthetic tracker workspace data')).toMatch(/permanently disabled by governance policy/i);
  });

  it('always throws when synthetic access is requested', () => {
    expect(() => assertSyntheticSandboxAccess('Synthetic tracker workspace data')).toThrow(/permanently disabled by governance policy/i);
  });
});
