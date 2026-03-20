export const DEMO_MODE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
export const SANDBOX_DATA_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_SANDBOX_DATA === 'true';

export function isDemoModeEnabled(): boolean {
  return DEMO_MODE_ENABLED;
}

export function isSandboxDataEnabled(): boolean {
  return SANDBOX_DATA_ENABLED;
}
