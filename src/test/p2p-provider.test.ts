import { describe, expect, it, vi } from 'vitest';
import { getP2PHistory, getP2PSnapshot, getP2PSnapshotWithFallback, normalizeMarketId, refreshP2PMarketSnapshot, scheduledRefreshAllMarkets } from '../../server/p2p-provider';
import { getP2PMarketConfig } from '@/lib/p2p-markets';
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
  APP_ENV: 'production',
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

  it('configures Binance fiat ids for all supported markets', () => {
    expect(getP2PMarketConfig('qatar').binanceFiat).toBe('QAR');
    expect(getP2PMarketConfig('uae').binanceFiat).toBe('AED');
    expect(getP2PMarketConfig('egypt').binanceFiat).toBe('EGP');
    expect(getP2PMarketConfig('aed').market).toBe('uae');
    expect(getP2PMarketConfig('egp').market).toBe('egypt');
  });
});

describe('p2p provider real-data-only behavior', () => {
  it('returns unavailable snapshots instead of synthetic data when no live provider is configured', async () => {
    const env = createEnv();
    const snapshot = await getP2PSnapshot('qatar', env as any);
    const history = await getP2PHistory('qatar', env as any);

    expect(snapshot.market).toBe('qatar');
    expect(snapshot.source).toBe('unavailable');
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.sellOffers).toEqual([]);
    expect(history).toEqual([]);
  });

  it('stores and retrieves market-specific histories independently for live data only', async () => {
    const env = createEnv({ P2P_LIVE_PROVIDER_URL: 'https://provider.example/p2p' });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ts: 1, sellAvg: 3.81, buyAvg: 3.74, bestSell: 3.82, bestBuy: 3.73, sellDepth: 100, buyDepth: 80, spread: 0.08, spreadPct: 2.1, sellOffers: [], buyOffers: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ts: 2, sellAvg: 3.67, buyAvg: 3.61, bestSell: 3.68, bestBuy: 3.6, sellDepth: 90, buyDepth: 70, spread: 0.06, spreadPct: 1.7, sellOffers: [], buyOffers: [] }), { status: 200 })) as any;

    await refreshP2PMarketSnapshot('qatar', env as any);
    await refreshP2PMarketSnapshot('uae', env as any);

    const qatarHistory = await getP2PHistory('qatar', env as any);
    const uaeHistory = await getP2PHistory('uae', env as any);
    expect(qatarHistory.every((point) => point.market === 'qatar')).toBe(true);
    expect(uaeHistory.every((point) => point.market === 'uae')).toBe(true);
  });

  it('accepts upstream cache/fresh sources because the provider normalizes them to live', async () => {
    const env = createEnv({ P2P_LIVE_PROVIDER_URL: 'https://provider.example/p2p' });
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: 'cache', ts: 1, sellAvg: 3.81, buyAvg: 3.74, bestSell: 3.82, bestBuy: 3.73, sellDepth: 100, buyDepth: 80, spread: 0.08, spreadPct: 2.1, sellOffers: [], buyOffers: [], history: [], dayStats: null, ageMs: 1000 }), { status: 200 })) as any;

    const snapshot = await getP2PSnapshotWithFallback('qatar', env as any);
    expect(snapshot.source).toBe('live');
    expect(snapshot.status).toBe('ok');
    expect(snapshot.sellAvg).toBe(3.81);
  });

  it('stale fallback remains within the same market only', async () => {
    const env = createEnv({ P2P_LIVE_PROVIDER_URL: 'https://provider.example/p2p' });
    const kv = env.P2P_KV as unknown as MemoryKV;
    await kv.put('p2p:latest', JSON.stringify({ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', unavailableReason: null, ts: 1, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    global.fetch = vi.fn().mockRejectedValue(new Error('upstream failed')) as any;

    const snapshot = await getP2PSnapshotWithFallback('qatar', env as any);
    expect(snapshot.market).toBe('qatar');
    expect(snapshot.stale).toBe(true);
    const uaeSnapshot = await getP2PSnapshotWithFallback('uae', env as any);
    expect(uaeSnapshot.market).toBe('uae');
    expect(uaeSnapshot.source).toBe('unavailable');
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

    const latestRes = await worker.fetch(new Request('https://example.com/api/latest?market=qar'), env as any, {} as ExecutionContext);
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.market).toBe('qatar');
    expect(latest.source).toBe('unavailable');

    const historyRes = await worker.fetch(new Request('https://example.com/api/history?market=uae'), env as any, {} as ExecutionContext);
    expect(historyRes.status).toBe(200);
    const history = await historyRes.json();
    expect(history).toEqual([]);

    const invalidRes = await worker.fetch(new Request('https://example.com/api/latest?market=invalid'), env as any, {} as ExecutionContext);
    expect(invalidRes.status).toBe(400);
  });
});


describe('p2p provider qatar KV compatibility', () => {
  it('reads qatar snapshots and history from flat upstream KV keys', async () => {
    const env = createEnv();
    const kv = env.P2P_KV as unknown as MemoryKV;
    await kv.put('p2p:latest', JSON.stringify({ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', unavailableReason: null, ts: 1, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    await kv.put('p2p:history', JSON.stringify([{ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', ts: 1, sellAvg: 3.8, buyAvg: 3.7, spread: 0.11, spreadPct: 2 }]));

    const snapshot = await getP2PSnapshot('qatar', env as any);
    const history = await getP2PHistory('qatar', env as any);

    expect(snapshot.source).toBe('live');
    expect(snapshot.sellAvg).toBe(3.8);
    expect(history).toHaveLength(1);
    expect(history[0].market).toBe('qatar');
  });
});
