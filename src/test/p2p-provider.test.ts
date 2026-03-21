import { describe, expect, it, vi } from 'vitest';
import { getP2PHistory, getP2PSnapshot, getP2PSnapshotWithFallback, normalizeMarketId, refreshP2PMarketSnapshot, scheduledRefreshAllMarkets } from '../../server/p2p-provider';
import { worker } from '../../server/index';

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string, type?: 'json') {
    const value = this.store.get(key) ?? null;
    if (value == null) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

const createEnv = (overrides: Record<string, unknown> = {}) => ({
  DB: {} as D1Database,
  P2P_KV: new MemoryKV() as unknown as KVNamespace,
  APP_ENV: 'development',
  ...overrides,
});

describe('p2p provider market normalization', () => {
  it('maps canonical ids and aliases', () => {
    expect(normalizeMarketId('qatar')).toBe('qatar');
    expect(normalizeMarketId('qar')).toBe('qatar');
    expect(normalizeMarketId('uae')).toBe('uae');
    expect(normalizeMarketId('egypt')).toBe('egypt');
    expect(normalizeMarketId('egy')).toBe('egypt');
  });

  it('rejects invalid market ids', () => {
    expect(() => normalizeMarketId('invalid')).toThrow(/unsupported market/i);
  });
});

describe('p2p provider storage and fallback isolation', () => {
  it('stores and retrieves market-specific snapshots and histories independently', async () => {
    const env = createEnv();

    const qatar = await refreshP2PMarketSnapshot('qatar', env as any);
    const uae = await refreshP2PMarketSnapshot('uae', env as any);
    const egypt = await refreshP2PMarketSnapshot('egypt', env as any);

    expect(qatar.snapshot.market).toBe('qatar');
    expect(uae.snapshot.market).toBe('uae');
    expect(egypt.snapshot.market).toBe('egypt');

    const qatarHistory = await getP2PHistory('qatar', env as any);
    const uaeHistory = await getP2PHistory('uae', env as any);
    expect(qatarHistory.every((point) => point.market === 'qatar')).toBe(true);
    expect(uaeHistory.every((point) => point.market === 'uae')).toBe(true);
    expect(JSON.stringify(qatarHistory)).not.toBe(JSON.stringify(uaeHistory));
  });

  it('production mode does not use synthetic data', async () => {
    const env = createEnv({ APP_ENV: 'production' });
    await expect(getP2PSnapshot('qatar', env as any)).rejects.toThrow(/not configured/i);
  });

  it('stale fallback remains within the same market only', async () => {
    const env = createEnv({ APP_ENV: 'production', P2P_LIVE_PROVIDER_URL: 'https://provider.example/p2p' });
    const kv = env.P2P_KV as unknown as MemoryKV;
    await kv.put('p2p:qatar:latest', JSON.stringify({ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', ts: 1, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    global.fetch = vi.fn().mockRejectedValue(new Error('upstream failed')) as any;

    const snapshot = await getP2PSnapshotWithFallback('qatar', env as any);
    expect(snapshot.market).toBe('qatar');
    expect(snapshot.stale).toBe(true);
    await expect(getP2PSnapshotWithFallback('uae', env as any)).rejects.toThrow(/upstream failed/i);
  });

  it('scheduled refresh processes all three markets independently', async () => {
    const env = createEnv();
    const log = { info: vi.fn(), error: vi.fn() };
    await scheduledRefreshAllMarkets(env as any, log);
    expect(log.info).toHaveBeenCalledTimes(3);
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe('worker market-aware routes', () => {
  it('returns market-specific latest/history results and rejects unknown markets', async () => {
    const env = createEnv();
    await refreshP2PMarketSnapshot('qatar', env as any);
    await refreshP2PMarketSnapshot('uae', env as any);

    const latestRes = await worker.fetch(new Request('https://example.com/api/latest?market=qar'), env as any, {} as ExecutionContext);
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.market).toBe('qatar');

    const historyRes = await worker.fetch(new Request('https://example.com/api/history?market=uae'), env as any, {} as ExecutionContext);
    expect(historyRes.status).toBe(200);
    const history = await historyRes.json();
    expect(history.every((point: any) => point.market === 'uae')).toBe(true);

    const invalidRes = await worker.fetch(new Request('https://example.com/api/latest?market=invalid'), env as any, {} as ExecutionContext);
    expect(invalidRes.status).toBe(400);
  });
});
