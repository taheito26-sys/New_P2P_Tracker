export const DEMO_MODE_ENABLED = import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
export const SANDBOX_DATA_ENABLED = false;

export function isDemoModeEnabled(): boolean {
  return DEMO_MODE_ENABLED;
}

export function isSandboxDataEnabled(): boolean {
  return SANDBOX_DATA_ENABLED;
}
