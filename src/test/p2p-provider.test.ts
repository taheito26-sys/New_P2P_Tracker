import { describe, expect, it, vi, beforeEach } from 'vitest';
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

function createBinanceRow(price: number, { min = 100, max = 5000, qty = 1000, nick = 'Trader', methods = ['Bank Transfer'] } = {}) {
  return {
    adv: {
      price: String(price),
      minSingleTransAmount: String(min),
      dynamicMaxSingleTransAmount: String(max),
      tradeMethods: methods.map((tradeMethodName) => ({ tradeMethodName })),
      tradableQuantity: String(qty),
    },
    advertiser: { nickName: nick },
  };
}

function mockBinanceFetch() {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const fiat = body.fiat;
    const tradeType = body.tradeType;

    const dataByRequest: Record<string, unknown[]> = {
      'QAR:BUY': [createBinanceRow(3.81), createBinanceRow(3.8), createBinanceRow(3.79)],
      'QAR:SELL': [createBinanceRow(3.73), createBinanceRow(3.74), createBinanceRow(3.75)],
      'AED:BUY': [createBinanceRow(3.68), createBinanceRow(3.67), createBinanceRow(3.66)],
      'AED:SELL': [createBinanceRow(3.6), createBinanceRow(3.61), createBinanceRow(3.62)],
      'EGP:BUY': [createBinanceRow(50.4), createBinanceRow(50.2), createBinanceRow(50.1)],
      'EGP:SELL': [createBinanceRow(49.5), createBinanceRow(49.6), createBinanceRow(49.7)],
    };

    return new Response(JSON.stringify({ data: dataByRequest[`${fiat}:${tradeType}`] ?? [] }), { status: 200 });
  });
}

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

describe('p2p provider live polling behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('polls Binance directly and stores market-specific histories independently', async () => {
    const env = createEnv();
    global.fetch = mockBinanceFetch() as any;

    await refreshP2PMarketSnapshot('qatar', env as any);
    await refreshP2PMarketSnapshot('uae', env as any);

    const qatarHistory = await getP2PHistory('qatar', env as any);
    const uaeHistory = await getP2PHistory('uae', env as any);
    expect(qatarHistory.every((point) => point.market === 'qatar')).toBe(true);
    expect(uaeHistory.every((point) => point.market === 'uae')).toBe(true);
    expect((global.fetch as any).mock.calls[0][1].body).toContain('"fiat":"QAR"');
    expect((global.fetch as any).mock.calls[2][1].body).toContain('"fiat":"AED"');
  });

  it('returns unavailable snapshots when Binance polling fails and no cache exists', async () => {
    const env = createEnv();
    global.fetch = vi.fn().mockRejectedValue(new Error('binance down')) as any;

    const snapshot = await getP2PSnapshotWithFallback('qatar', env as any);
    expect(snapshot.market).toBe('qatar');
    expect(snapshot.source).toBe('unavailable');
    expect(snapshot.status).toBe('unavailable');
    expect(snapshot.sellOffers).toEqual([]);
  });

  it('returns stale cache when Binance polling fails but cached live data exists', async () => {
    const env = createEnv();
    const kv = env.P2P_KV as unknown as MemoryKV;
    await kv.put('p2p:qatar:latest', JSON.stringify({ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: true, status: 'degraded', unavailableReason: null, ts: Date.now() - 20 * 60 * 1000, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    global.fetch = vi.fn().mockRejectedValue(new Error('binance down')) as any;

    const snapshot = await getP2PSnapshotWithFallback('qatar', env as any);
    expect(snapshot.market).toBe('qatar');
    expect(snapshot.source).toBe('live');
    expect(snapshot.stale).toBe(true);
  });

  it('scheduled refresh processes all three markets independently', async () => {
    const env = createEnv();
    const log = { info: vi.fn(), error: vi.fn() };
    global.fetch = mockBinanceFetch() as any;

    await scheduledRefreshAllMarkets(env as any, log);
    expect(log.info).toHaveBeenCalledTimes(3);
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe('worker market-aware routes', () => {
  it('returns market-specific latest/history results and rejects unknown markets', async () => {
    const env = createEnv();
    global.fetch = mockBinanceFetch() as any;

    const latestRes = await worker.fetch(new Request('https://example.com/api/latest?market=qar'), env as any, {} as ExecutionContext);
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.market).toBe('qatar');
    expect(latest.source).toBe('live');

    const historyRes = await worker.fetch(new Request('https://example.com/api/history?market=uae'), env as any, {} as ExecutionContext);
    expect(historyRes.status).toBe(200);
    const history = await historyRes.json();
    expect(Array.isArray(history)).toBe(true);

    const invalidRes = await worker.fetch(new Request('https://example.com/api/latest?market=invalid'), env as any, {} as ExecutionContext);
    expect(invalidRes.status).toBe(400);
  });
});

describe('p2p provider qatar KV compatibility', () => {
  it('reads qatar snapshots and history from scoped keys first', async () => {
    const env = createEnv();
    const kv = env.P2P_KV as unknown as MemoryKV;
    await kv.put('p2p:qatar:latest', JSON.stringify({ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', unavailableReason: null, ts: 1, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    await kv.put('p2p:qatar:history', JSON.stringify([{ market: 'qatar', source: 'live', fetchedAt: '2026-03-21T00:00:00.000Z', stale: false, status: 'ok', ts: 1, sellAvg: 3.8, buyAvg: 3.7, spread: 0.11, spreadPct: 2 }]));

    const snapshot = await getP2PSnapshot('qatar', env as any);
    const history = await getP2PHistory('qatar', env as any);

    expect(snapshot.source).toBe('live');
    expect(snapshot.sellAvg).toBe(3.8);
    expect(history).toHaveLength(1);
    expect(history[0].market).toBe('qatar');
  });

  it('normalizes legacy qatar flat-key snapshots from the source worker', async () => {
    const env = createEnv();
    const kv = env.P2P_KV as unknown as MemoryKV;
    const freshTs = Date.now();
    await kv.put('p2p:latest', JSON.stringify({ ts: freshTs, sellAvg: 3.8, buyAvg: 3.7, bestSell: 3.81, bestBuy: 3.69, sellDepth: 10, buyDepth: 10, spread: 0.11, spreadPct: 2, sellOffers: [], buyOffers: [] }));
    await kv.put('p2p:history', JSON.stringify([{ ts: freshTs, sellAvg: 3.8, buyAvg: 3.7, spread: 0.11, spreadPct: 2 }]));

    const snapshot = await getP2PSnapshot('qatar', env as any);
    const history = await getP2PHistory('qatar', env as any);

    expect(snapshot.market).toBe('qatar');
    expect(snapshot.source).toBe('live');
    expect(snapshot.stale).toBe(false);
    expect(history[0].market).toBe('qatar');
    expect(history[0].source).toBe('live');
  });
});
