import type { P2PHistoryPoint, P2PSnapshot } from '../src/types/domain';
import { P2P_MARKETS, normalizeMarketId, type P2PMarket } from '../src/lib/p2p-markets';

type ProviderEnv = {
  P2P_KV: KVNamespace;
  APP_ENV?: string;
  P2P_LIVE_PROVIDER_URL?: string;
  P2P_LIVE_PROVIDER_TOKEN?: string;
};

const TRACKER_HISTORY_LIMIT = 24 * 12 * 15;
const LIVE_TIMEOUT_MS = 3500;
const LIVE_MAX_RETRIES = 2;
const LIVE_BACKOFF_MS = 250;

function kvKey(market: P2PMarket, kind: 'latest' | 'history'): string {
  return `p2p:${market}:${kind}`;
}

function isProductionEnv(env: ProviderEnv): boolean {
  return (env.APP_ENV || 'production').trim().toLowerCase() === 'production';
}

function hasLiveProvider(env: ProviderEnv): boolean {
  return Boolean(env.P2P_LIVE_PROVIDER_URL);
}

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const MARKET_CONFIG: Record<P2PMarket, { baseSell: number; spread: number; currencyMethods: string[]; names: string[] }> = {
  qatar: {
    baseSell: 3.79,
    spread: 0.06,
    currencyMethods: ['QNB', 'QIB', 'Bank Transfer', 'CB Pay', 'Cash'],
    names: ['DohaDesk', 'QatarFlow', 'CapitalLink', 'QatarOTC', 'MENA-X'],
  },
  uae: {
    baseSell: 3.68,
    spread: 0.05,
    currencyMethods: ['Emirates NBD', 'FAB', 'DIB', 'Bank Transfer', 'Cash'],
    names: ['DubaiOTC', 'AbuDhabiDesk', 'GulfBridge', 'DXBTrader', 'EmiratesFlow'],
  },
  egypt: {
    baseSell: 49.6,
    spread: 1.1,
    currencyMethods: ['InstaPay', 'Banque Misr', 'CIB', 'Vodafone Cash', 'Bank Transfer'],
    names: ['CairoOTC', 'NileFlow', 'AlexDesk', 'GizaTrader', 'MasrLink'],
  },
};

function generateOffers(seed: number, side: 'sell' | 'buy', basePrice: number, market: P2PMarket) {
  const rng = createSeededRandom(seed);
  const config = MARKET_CONFIG[market];
  return Array.from({ length: 10 }, (_, index) => {
    const spreadFactor = market === 'egypt' ? 0.7 : 0.03;
    const offset = rng() * spreadFactor;
    const price = side === 'sell' ? basePrice + offset : Math.max(0, basePrice - offset);
    return {
      price: Math.round(price * 100) / 100,
      min: Math.round((100 + rng() * 5000) / 10) * 10,
      max: Math.round((3000 + rng() * 75000) / 100) * 100,
      nick: `${config.names[index % config.names.length]}-${index + 1}`,
      methods: [config.currencyMethods[index % config.currencyMethods.length]],
      available: Math.round((500 + rng() * 10000) * 100) / 100,
    };
  }).sort((a, b) => side === 'sell' ? b.price - a.price : a.price - b.price);
}

function buildSyntheticSnapshot(now: number, market: P2PMarket): P2PSnapshot {
  const bucket = Math.floor(now / (5 * 60 * 1000));
  const rng = createSeededRandom(bucket + market.charCodeAt(0));
  const config = MARKET_CONFIG[market];
  const sellBase = config.baseSell + Math.sin(bucket / 18) * (market === 'egypt' ? 0.25 : 0.03) + (rng() - 0.5) * (market === 'egypt' ? 0.2 : 0.02);
  const buyBase = sellBase - config.spread - rng() * (market === 'egypt' ? 0.4 : 0.02);
  const sellOffers = generateOffers(bucket, 'sell', sellBase, market);
  const buyOffers = generateOffers(bucket + 7, 'buy', buyBase, market);
  const topSell = sellOffers.slice(0, 5);
  const topBuy = buyOffers.slice(0, 5);
  const sellAvg = topSell.reduce((sum, offer) => sum + offer.price, 0) / topSell.length;
  const buyAvg = topBuy.reduce((sum, offer) => sum + offer.price, 0) / topBuy.length;
  const spread = sellAvg - buyAvg;
  const fetchedAt = new Date(now).toISOString();

  return {
    market,
    source: 'synthetic',
    fetchedAt,
    stale: false,
    status: 'ok',
    latencyMs: 0,
    retryCount: 0,
    ts: now,
    sellAvg: Math.round(sellAvg * 1000) / 1000,
    buyAvg: Math.round(buyAvg * 1000) / 1000,
    bestSell: sellOffers[0]?.price ?? null,
    bestBuy: buyOffers[0]?.price ?? null,
    sellDepth: Math.round(topSell.reduce((sum, offer) => sum + offer.available, 0)),
    buyDepth: Math.round(topBuy.reduce((sum, offer) => sum + offer.available, 0)),
    spread: Math.round(spread * 1000) / 1000,
    spreadPct: buyAvg > 0 ? Math.round(((spread / buyAvg) * 100) * 1000) / 1000 : null,
    sellOffers,
    buyOffers,
  };
}

function toHistoryPoint(snapshot: P2PSnapshot): P2PHistoryPoint {
  return {
    ts: snapshot.ts,
    market: snapshot.market,
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.stale,
    status: snapshot.status,
    sellAvg: snapshot.sellAvg,
    buyAvg: snapshot.buyAvg,
    spread: snapshot.spread,
    spreadPct: snapshot.spreadPct,
  };
}

async function getHistoryFromKV(env: ProviderEnv, market: P2PMarket): Promise<P2PHistoryPoint[]> {
  const history = await env.P2P_KV.get(kvKey(market, 'history'), 'json');
  return Array.isArray(history) ? history as P2PHistoryPoint[] : [];
}

async function getSnapshotFromKV(env: ProviderEnv, market: P2PMarket): Promise<P2PSnapshot | null> {
  return await env.P2P_KV.get(kvKey(market, 'latest'), 'json') as P2PSnapshot | null;
}

async function persistSnapshot(env: ProviderEnv, snapshot: P2PSnapshot): Promise<P2PHistoryPoint[]> {
  const history = await getHistoryFromKV(env, snapshot.market);
  const nextHistory = [...history, toHistoryPoint(snapshot)].slice(-TRACKER_HISTORY_LIMIT);
  await Promise.all([
    env.P2P_KV.put(kvKey(snapshot.market, 'latest'), JSON.stringify(snapshot)),
    env.P2P_KV.put(kvKey(snapshot.market, 'history'), JSON.stringify(nextHistory)),
  ]);
  return nextHistory;
}

function staleSnapshot(snapshot: P2PSnapshot, retryCount: number): P2PSnapshot {
  return {
    ...snapshot,
    stale: true,
    status: 'degraded',
    retryCount,
  };
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiveSnapshot(market: P2PMarket, env: ProviderEnv): Promise<P2PSnapshot> {
  const providerUrl = env.P2P_LIVE_PROVIDER_URL;
  if (!providerUrl) {
    throw new Error('Live P2P provider is not configured');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= LIVE_MAX_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
    try {
      const response = await fetch(`${providerUrl}?market=${market}`, {
        signal: controller.signal,
        headers: env.P2P_LIVE_PROVIDER_TOKEN ? { Authorization: `Bearer ${env.P2P_LIVE_PROVIDER_TOKEN}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Live provider request failed with ${response.status}`);
      }
      const payload = await response.json() as Omit<P2PSnapshot, 'market' | 'source' | 'fetchedAt' | 'stale' | 'status'> & Partial<P2PSnapshot>;
      return {
        ...payload,
        market,
        source: 'live',
        fetchedAt: payload.fetchedAt || new Date().toISOString(),
        stale: false,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        retryCount: attempt,
      } as P2PSnapshot;
    } catch (error) {
      lastError = error;
      if (attempt < LIVE_MAX_RETRIES) {
        await delay(LIVE_BACKOFF_MS * (attempt + 1));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Live provider request failed');
}

export async function refreshP2PMarketSnapshot(marketInput: string, env: ProviderEnv): Promise<{ snapshot: P2PSnapshot; history: P2PHistoryPoint[] }> {
  const market = normalizeMarketId(marketInput);
  const snapshot = hasLiveProvider(env)
    ? await fetchLiveSnapshot(market, env)
    : isProductionEnv(env)
      ? (() => { throw new Error('Live P2P market data is not configured for this environment'); })()
      : buildSyntheticSnapshot(Date.now(), market);
  const history = await persistSnapshot(env, snapshot);
  return { snapshot, history };
}

export async function getP2PSnapshot(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  const cached = await getSnapshotFromKV(env, market);
  if (cached) return cached;
  if (!hasLiveProvider(env) && isProductionEnv(env)) {
    throw new Error('Live P2P market data is not configured for this environment');
  }
  const { snapshot } = await refreshP2PMarketSnapshot(market, env);
  return snapshot;
}

export async function getP2PHistory(marketInput: string | undefined, env: ProviderEnv): Promise<P2PHistoryPoint[]> {
  const market = normalizeMarketId(marketInput);
  const history = await getHistoryFromKV(env, market);
  if (history.length > 0) return history;
  await getP2PSnapshot(market, env);
  return await getHistoryFromKV(env, market);
}

export async function getP2PSnapshotWithFallback(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  try {
    if (hasLiveProvider(env)) {
      const { snapshot } = await refreshP2PMarketSnapshot(market, env);
      return snapshot;
    }
    return await getP2PSnapshot(market, env);
  } catch (error) {
    const cached = await getSnapshotFromKV(env, market);
    if (cached) {
      return staleSnapshot(cached, LIVE_MAX_RETRIES);
    }
    throw error;
  }
}

export async function scheduledRefreshAllMarkets(env: ProviderEnv, log: Pick<Console, 'info' | 'error'> = console): Promise<void> {
  await Promise.all(P2P_MARKETS.map(async (market) => {
    try {
      const { snapshot, history } = await refreshP2PMarketSnapshot(market, env);
      log.info(`[p2p] refreshed market=${market} source=${snapshot.source} history=${history.length} stale=${snapshot.stale}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[p2p] refresh failed market=${market} error=${message}`);
    }
  }));
}

export { normalizeMarketId, P2P_MARKETS };
