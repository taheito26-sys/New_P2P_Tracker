// Demo mode: when no Cloudflare Workers backend is available,
// provide mock data so the UI can be explored.

import type { MerchantProfile } from '@/types/domain';

let _demoMode: boolean | null = null;

export async function isDemoMode(): Promise<boolean> {
  if (_demoMode !== null) return _demoMode;
  try {
    const res = await fetch('/api/auth/session', { method: 'GET' });
    const ct = res.headers.get('content-type') || '';
    // If the response is HTML (Vite fallback) or 404, no backend is running
    _demoMode = !res.ok || ct.includes('text/html');
  } catch {
    _demoMode = true;
  }
  return _demoMode;
}

export function getDemoMode(): boolean {
  return _demoMode ?? true;
}

export const DEMO_USER = {
  user_id: 'demo-user-001',
  email: 'demo@tracker.local',
  token: 'demo-token',
};

export const DEMO_PROFILE: MerchantProfile = {
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
};
