import { isSyntheticSandboxAccessAllowed } from '@/lib/governance';

export const DEMO_MODE_ENABLED = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
export const SANDBOX_DATA_ENABLED = import.meta.env.VITE_ENABLE_SANDBOX_DATA === 'true';

export function isDemoModeEnabled(): boolean {
  return false;
}

export function isSandboxDataEnabled(): boolean {
  return isSyntheticSandboxAccessAllowed({
    sandboxEnabled: SANDBOX_DATA_ENABLED,
    demoEnabled: DEMO_MODE_ENABLED,
  });
}
