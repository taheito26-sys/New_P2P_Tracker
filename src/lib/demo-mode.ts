import type { MerchantProfile } from '@/types/domain';
import { isDemoModeEnabled } from '@/lib/runtime-mode';

let _demoMode: boolean | null = null;

export async function isDemoMode(): Promise<boolean> {
  if (_demoMode !== null) return _demoMode;
  _demoMode = isDemoModeEnabled();
  return _demoMode;
}

export function getDemoMode(): boolean {
  return _demoMode ?? isDemoModeEnabled();
}

export const DEMO_USER = isDemoModeEnabled() ? {
  user_id: 'demo-user-001',
  email: 'demo@tracker.local',
  token: 'demo-token',
} : null;

export const DEMO_PROFILE: MerchantProfile | null = DEMO_USER ? {
  id: 'demo-merchant-001',
  owner_user_id: DEMO_USER.user_id,
  merchant_id: 'MRC-00000001',
  nickname: 'demo_trader',
  display_name: 'Demo Trader',
  merchant_type: 'independent',
  region: 'MENA',
  default_currency: 'USDT',
  discoverability: 'public',
  bio: 'Demo account for exploring the platform',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} : null;
