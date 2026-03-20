import type { MerchantProfile } from '@/types/domain';

export async function isDemoMode(): Promise<boolean> {
  return false;
}

export function getDemoMode(): boolean {
  return false;
}

export const DEMO_USER: null = null;

export const DEMO_PROFILE: MerchantProfile | null = null;
