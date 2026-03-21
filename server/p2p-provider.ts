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

function hasLiveProvider(env: ProviderEnv): boolean {
  return Boolean(env.P2P_LIVE_PROVIDER_URL);
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

function createUnavailableSnapshot(market: P2PMarket, reason: string, retryCount = 0): P2PSnapshot {
  return {
    ts: Date.now(),
    market,
    source: 'unavailable',
    fetchedAt: new Date().toISOString(),
    stale: false,
    status: 'unavailable',
    unavailableReason: reason,
    latencyMs: 0,
    retryCount,
    sellAvg: null,
    buyAvg: null,
    bestSell: null,
    bestBuy: null,
    sellDepth: 0,
    buyDepth: 0,
    spread: null,
    spreadPct: null,
    sellOffers: [],
    buyOffers: [],
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
  const existingHistory = await getHistoryFromKV(env, snapshot.market);
  const nextHistory = snapshot.source === 'live'
    ? [...existingHistory, toHistoryPoint(snapshot)].slice(-TRACKER_HISTORY_LIMIT)
    : existingHistory;

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

function assertLivePayload(market: P2PMarket, payload: unknown): asserts payload is Omit<P2PSnapshot, 'market' | 'source' | 'fetchedAt' | 'stale' | 'status'> & Partial<P2PSnapshot> {
  if (!payload || typeof payload !== 'object') throw new Error(`Live provider returned invalid payload for ${market}`);
  const data = payload as Record<string, unknown>;
  if (data.source && data.source !== 'live') throw new Error(`Live provider returned unsupported source for ${market}`);
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
      const payload = await response.json();
      assertLivePayload(market, payload);
      return {
        ...(payload as object),
        market,
        source: 'live',
        fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : new Date().toISOString(),
        stale: false,
        status: 'ok',
        unavailableReason: null,
        latencyMs: Date.now() - startedAt,
        retryCount: attempt,
      } as P2PSnapshot;
    } catch (error) {
      lastError = error;
      if (attempt < LIVE_MAX_RETRIES) await delay(LIVE_BACKOFF_MS * (attempt + 1));
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
    : createUnavailableSnapshot(market, 'live_provider_unconfigured');
  const history = await persistSnapshot(env, snapshot);
  return { snapshot, history };
}

export async function getP2PSnapshot(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  const cached = await getSnapshotFromKV(env, market);
  if (cached) return cached;
  const { snapshot } = await refreshP2PMarketSnapshot(market, env);
  return snapshot;
}

export async function getP2PHistory(marketInput: string | undefined, env: ProviderEnv): Promise<P2PHistoryPoint[]> {
  const market = normalizeMarketId(marketInput);
  const history = await getHistoryFromKV(env, market);
  if (history.length > 0) return history;
  const snapshot = await getP2PSnapshot(market, env);
  return snapshot.source === 'live' ? await getHistoryFromKV(env, market) : [];
}

export async function getP2PSnapshotWithFallback(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  try {
    return hasLiveProvider(env)
      ? (await refreshP2PMarketSnapshot(market, env)).snapshot
      : await getP2PSnapshot(market, env);
  } catch (error) {
    const cached = await getSnapshotFromKV(env, market);
    if (cached?.source === 'live') return staleSnapshot(cached, LIVE_MAX_RETRIES);
    return createUnavailableSnapshot(market, error instanceof Error ? error.message : 'live_provider_unavailable', LIVE_MAX_RETRIES);
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
