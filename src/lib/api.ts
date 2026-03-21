// ─── Cloudflare Workers API Client ──────────────────────────────────
// All business state lives on the server. No localStorage for business data.

import type {
  MerchantProfile,
  MerchantSearchResult,
  MerchantInvite,
  MerchantRelationship,
  MerchantDeal,
  MerchantApproval,
  MerchantMessage,
  MerchantNotification,
  AuditLog,
  Batch,
  Trade,
  P2PSnapshot,
  P2PHistoryPoint
} from '@/types/domain';
import { normalizeMarketId } from '@/lib/p2p-markets';

export interface PortfolioAnalytics {
  totalDeployed: number;
  activeDeployed: number;
  returnedCapital: number;
  realizedProfit: number;
  unsettledExposure: number;
  overdueDeals: number;
  activeRelationships: number;
  pendingApprovals: number;
  capitalByCounterparty: { name: string; deployed: number; returned: number; profit: number; roi: number }[];
  dealsByType: Record<string, number>;
  riskIndicators: { type: string; severity: 'high' | 'medium' | 'low'; message: string }[];
}

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  return '';
}

const API_BASE = resolveApiBase();

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: 'include', cache: 'no-store' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText, body);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export const auth = {
  signup: (email: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/signup', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ ok: boolean; user_id: string }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean }>('/api/auth/verify-email', {
      method: 'POST', body: JSON.stringify({ token }),
    }),
  resetPassword: (email: string) =>
    request<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }),
  session: () =>
    request<{ user_id: string; email: string } | null>('/api/auth/session'),
};

export const merchant = {
  getMyProfile: () =>
    request<{ profile: MerchantProfile | null }>('/api/merchant/profile/me'),

  ensureProfile: (data: {
    nickname: string;
    display_name: string;
    merchant_type?: string;
    region?: string;
    default_currency?: string;
    discoverability?: string;
    bio?: string;
  }) =>
    request<{ profile: MerchantProfile }>('/api/merchant/profile/ensure', {
      method: 'POST', body: JSON.stringify(data),
    }),
  search: (q: string) =>
    request<{ results: MerchantSearchResult[] }>(`/api/merchant/search?q=${encodeURIComponent(q)}`),

  checkNickname: (nickname: string) =>
    request<{ nickname: string; available: boolean }>(`/api/merchant/check-nickname?nickname=${encodeURIComponent(nickname)}`),
};

export const invites = {
  inbox: () => request<{ invites: MerchantInvite[] }>('/api/merchant/invites/inbox'),
  sent: () => request<{ invites: MerchantInvite[] }>('/api/merchant/invites/sent'),
  create: (data: Partial<MerchantInvite>) =>
    request<{ ok: boolean; invite: MerchantInvite }>('/api/merchant/invites', { method: 'POST', body: JSON.stringify(data) }),
  respond: (id: string, action: 'accept' | 'reject') =>
    request<{ ok: boolean; invite: MerchantInvite }>(`/api/merchant/invites/${id}/${action}`, { method: 'POST' }),
  withdraw: (id: string) =>
    request<{ ok: boolean; invite: MerchantInvite }>(`/api/merchant/invites/${id}/withdraw`, { method: 'POST' }),
};

export const relationships = {
  list: () => request<{ relationships: MerchantRelationship[] }>('/api/merchant/relationships'),
  detail: (id: string) => request<{ relationship: MerchantRelationship }>(`/api/merchant/relationships/${id}`),
};

export const deals = {
  list: (relationshipId: string) => request<{ deals: MerchantDeal[] }>(`/api/merchant/deals?relationship_id=${relationshipId}`),
  create: (data: Partial<MerchantDeal>) => request<{ ok: boolean; deal: MerchantDeal }>('/api/merchant/deals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MerchantDeal>) => request<{ ok: boolean; deal: MerchantDeal }>(`/api/merchant/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<{ ok: boolean; deleted: string }>(`/api/merchant/deals/${id}`, { method: 'DELETE' }),
};

export const approvals = {
  inbox: () => request<{ approvals: MerchantApproval[] }>('/api/merchant/approvals/inbox'),
  mine: () => request<{ approvals: MerchantApproval[] }>('/api/merchant/approvals/mine'),
  review: (id: string, status: 'approved' | 'rejected', resolution_note?: string) =>
    request<{ ok: boolean; approval: MerchantApproval }>(`/api/merchant/approvals/${id}/review`, { method: 'POST', body: JSON.stringify({ status, resolution_note }) }),
};

export const messages = {
  list: (relationshipId: string) => request<{ messages: MerchantMessage[] }>(`/api/merchant/messages?relationship_id=${relationshipId}`),
  send: (data: Partial<MerchantMessage>) => request<{ ok: boolean; message: MerchantMessage }>('/api/merchant/messages', { method: 'POST', body: JSON.stringify(data) }),
  markRead: (id: string) => request<{ ok: boolean }>(`/api/merchant/messages/${id}/read`, { method: 'POST' }),
};

export const audit = {
  relationship: (relationshipId: string) =>
    request<{ logs: AuditLog[] }>(`/api/merchant/audit/relationship/${relationshipId}`),

  activity: () =>
    request<{ logs: AuditLog[] }>('/api/merchant/audit/activity'),
};

export const notifications = {
  list: (limit = 50, unread = false) =>
    request<{ notifications: MerchantNotification[] }>(
      `/api/merchant/notifications?limit=${limit}${unread ? '&unread=true' : ''}`
    ),

  count: () =>
    request<{ unread: number }>('/api/merchant/notifications/count'),

  markRead: (id: string) =>
    request<{ ok: boolean }>(`/api/merchant/notifications/${id}/read`, { method: 'POST' }),

  markAllRead: () =>
    request<{ ok: boolean }>('/api/merchant/notifications/read-all', { method: 'POST' }),
};

export const trading = {
  getBatches: (assetSymbol?: string) =>
    request<{ batches: Batch[] }>(
      assetSymbol ? `/api/batches?asset_symbol=${assetSymbol}` : '/api/batches'
    ),

  createBatch: (data: Omit<Batch, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
    request<{ ok: boolean; batch: Batch }>('/api/batches', {
      method: 'POST', body: JSON.stringify(data),
    }),

  updateBatch: (id: string, data: Partial<Batch>) =>
    request<{ ok: boolean; batch: Batch }>(`/api/batches/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  deleteBatch: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/batches/${id}`, { method: 'DELETE' }),

  getTrades: () =>
    request<{ trades: Trade[] }>('/api/trades'),

  createTrade: (data: Omit<Trade, 'id' | 'user_id' | 'created_at' | 'updated_at'>) =>
    request<{ ok: boolean; trade: Trade }>('/api/trades', {
      method: 'POST', body: JSON.stringify(data),
    }),

  updateTrade: (id: string, data: Partial<Trade>) =>
    request<{ ok: boolean; trade: Trade }>(`/api/trades/${id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  voidTrade: (id: string) =>
    request<{ ok: boolean }>(`/api/trades/${id}/void`, { method: 'PATCH' }),

  deleteTrade: (id: string) =>
    request<{ ok: boolean; deleted: string }>(`/api/trades/${id}`, { method: 'DELETE' }),
};

export const p2p = {
  status: () =>
    request<{ ok: boolean; lastUpdate: string }>('/api/status'),

  latest: (market?: string) => {
    const canonicalMarket = normalizeMarketId(market);
    return request<P2PSnapshot>(`/api/latest?market=${encodeURIComponent(canonicalMarket)}`);
  },

  history: (market?: string) => {
    const canonicalMarket = normalizeMarketId(market);
    return request<P2PHistoryPoint[]>(`/api/history?market=${encodeURIComponent(canonicalMarket)}`);
  },
};

export const analytics = {
  get: () =>
    request<PortfolioAnalytics>('/api/analytics'),
};

export const poll = {
  changes: (since: string) =>
    request<{ invites: MerchantInvite[]; messages: MerchantMessage[] }>(
      `/api/merchant/poll?since=${encodeURIComponent(since)}`
    ),
};
