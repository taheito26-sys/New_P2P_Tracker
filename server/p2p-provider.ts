import type { P2PHistoryPoint, P2PSnapshot } from '../src/types/domain';
import { P2P_MARKETS, P2P_MARKET_CONFIGS, normalizeMarketId, type P2PMarket } from '../src/lib/p2p-markets';

type ProviderEnv = {
  P2P_KV: KVNamespace;
  APP_ENV?: string;
  P2P_LIVE_PROVIDER_URL?: string;
};

const TRACKER_HISTORY_LIMIT = 24 * 12 * 15;
const LIVE_MAX_RETRIES = 2;
const LIVE_BACKOFF_MS = 250;
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_TIMEOUT_MS = 12_000;
const STALE_THRESHOLD_MS = 15 * 60 * 1000;
const MEMORY_CACHE_TTL_MS = 5_000;
const PEER_FAILURE_QUARANTINE_MS = 30_000;
const PEER_FAILURE_THRESHOLD = 3;

type BinanceOffer = P2PSnapshot['sellOffers'][number];
type CacheEntry = { snapshot: P2PSnapshot; cachedAt: number; invalidationVersion: number; cacheScope: string };
type SyncMeta = {
  version: number;
  lamport: number;
  invalidationVersion: number;
  lastUpdatedAt: string;
  lastReplicationAt: string;
  peerSource: string;
  consecutiveFailures: number;
  quarantineUntil: string | null;
};

const memorySnapshotCache = new Map<P2PMarket, CacheEntry>();

interface SideResult {
  avg: number | null;
  best: number | null;
  depth: number;
  offers: BinanceOffer[];
}

function kvKey(market: P2PMarket, kind: 'latest' | 'history'): string {
  return `p2p:${market}:${kind}`;
}

function legacyKvKey(kind: 'latest' | 'history'): string {
  return `p2p:${kind}`;
}

function syncMetaKey(market: P2PMarket): string {
  return `p2p:${market}:sync`;
}

function peerSource(env: ProviderEnv) {
  return env.P2P_LIVE_PROVIDER_URL || `local:${env.APP_ENV || 'dev'}`;
}

function initialSyncMeta(env: ProviderEnv): SyncMeta {
  const now = new Date().toISOString();
  return {
    version: 0,
    lamport: 0,
    invalidationVersion: 0,
    lastUpdatedAt: now,
    lastReplicationAt: now,
    peerSource: peerSource(env),
    consecutiveFailures: 0,
    quarantineUntil: null,
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

function cloneSnapshot(snapshot: P2PSnapshot, overrides: Partial<P2PSnapshot> = {}): P2PSnapshot {
  return { ...snapshot, ...overrides };
}

function createUnavailableSnapshot(market: P2PMarket, reason: string, retryCount = 0): P2PSnapshot {
  return {
    ts: Date.now(),
    market,
    source: 'unavailable',
    servedFrom: 'live_fetch',
    peerSource: 'unavailable',
    fetchedAt: new Date().toISOString(),
    stale: false,
    status: 'unavailable',
    unavailableReason: reason,
    version: 0,
    lamport: 0,
    cacheAgeMs: 0,
    replicationLagMs: 0,
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

function normalizeSnapshotRecord(raw: Record<string, unknown>, market: P2PMarket): P2PSnapshot | null {
  if (typeof raw.ts !== 'number') return null;
  if (raw.source === 'live' || raw.source === 'unavailable') {
    return raw as unknown as P2PSnapshot;
  }

  const ts = raw.ts;
  const ageMs = Date.now() - ts;
  const stale = ageMs > STALE_THRESHOLD_MS;

  return {
    ts,
    market,
    source: 'live',
    servedFrom: typeof raw.servedFrom === 'string' ? raw.servedFrom as P2PSnapshot['servedFrom'] : 'kv',
    peerSource: typeof raw.peerSource === 'string' ? raw.peerSource : 'kv',
    fetchedAt: new Date(ts).toISOString(),
    stale,
    status: stale ? 'degraded' : 'ok',
    unavailableReason: null,
    version: typeof raw.version === 'number' ? raw.version : 0,
    lamport: typeof raw.lamport === 'number' ? raw.lamport : 0,
    cacheAgeMs: typeof raw.cacheAgeMs === 'number' ? raw.cacheAgeMs : ageMs,
    replicationLagMs: typeof raw.replicationLagMs === 'number' ? raw.replicationLagMs : 0,
    sellAvg: typeof raw.sellAvg === 'number' ? raw.sellAvg : null,
    buyAvg: typeof raw.buyAvg === 'number' ? raw.buyAvg : null,
    bestSell: typeof raw.bestSell === 'number' ? raw.bestSell : null,
    bestBuy: typeof raw.bestBuy === 'number' ? raw.bestBuy : null,
    sellDepth: typeof raw.sellDepth === 'number' ? raw.sellDepth : 0,
    buyDepth: typeof raw.buyDepth === 'number' ? raw.buyDepth : 0,
    spread: typeof raw.spread === 'number' ? raw.spread : null,
    spreadPct: typeof raw.spreadPct === 'number' ? raw.spreadPct : null,
    sellOffers: Array.isArray(raw.sellOffers) ? raw.sellOffers as P2PSnapshot['sellOffers'] : [],
    buyOffers: Array.isArray(raw.buyOffers) ? raw.buyOffers as P2PSnapshot['buyOffers'] : [],
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : undefined,
    retryCount: typeof raw.retryCount === 'number' ? raw.retryCount : undefined,
  };
}

function normalizeHistoryPointRecord(raw: Record<string, unknown>, market: P2PMarket): P2PHistoryPoint | null {
  if (typeof raw.ts !== 'number') return null;
  const ageMs = Date.now() - raw.ts;
  const stale = ageMs > STALE_THRESHOLD_MS;
  return {
    ts: raw.ts,
    market,
    source: raw.source === 'unavailable' ? 'unavailable' : 'live',
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : new Date(raw.ts).toISOString(),
    stale: typeof raw.stale === 'boolean' ? raw.stale : stale,
    status: raw.status === 'unavailable' ? 'unavailable' : stale ? 'degraded' : 'ok',
    sellAvg: typeof raw.sellAvg === 'number' ? raw.sellAvg : null,
    buyAvg: typeof raw.buyAvg === 'number' ? raw.buyAvg : null,
    spread: typeof raw.spread === 'number' ? raw.spread : null,
    spreadPct: typeof raw.spreadPct === 'number' ? raw.spreadPct : null,
  };
}

async function getHistoryFromKV(env: ProviderEnv, market: P2PMarket): Promise<P2PHistoryPoint[]> {
  let history = await env.P2P_KV.get(kvKey(market, 'history'), 'json');
  if (!Array.isArray(history) && market === 'qatar') {
    history = await env.P2P_KV.get(legacyKvKey('history'), 'json');
  }
  if (!Array.isArray(history)) return [];
  return history
    .map((point) => point && typeof point === 'object' ? normalizeHistoryPointRecord(point as Record<string, unknown>, market) : null)
    .filter((point): point is P2PHistoryPoint => Boolean(point));
}

async function getSnapshotFromKV(env: ProviderEnv, market: P2PMarket): Promise<P2PSnapshot | null> {
  try {
    let raw = await env.P2P_KV.get(kvKey(market, 'latest'), 'json') as Record<string, unknown> | null;
    if (!raw && market === 'qatar') {
      raw = await env.P2P_KV.get(legacyKvKey('latest'), 'json') as Record<string, unknown> | null;
    }
    if (!raw || typeof raw !== 'object') return null;
    return normalizeSnapshotRecord(raw, market);
  } catch (error) {
    console.error('[p2p.sync] failed to read snapshot from KV', { market, error });
    return null;
  }
}

async function getSyncMeta(env: ProviderEnv, market: P2PMarket): Promise<SyncMeta> {
  try {
    const raw = await env.P2P_KV.get(syncMetaKey(market), 'json') as SyncMeta | null;
    if (!raw || typeof raw !== 'object') return initialSyncMeta(env);
    return {
      ...initialSyncMeta(env),
      ...raw,
      version: typeof raw.version === 'number' ? raw.version : 0,
      lamport: typeof raw.lamport === 'number' ? raw.lamport : 0,
      invalidationVersion: typeof raw.invalidationVersion === 'number' ? raw.invalidationVersion : 0,
      consecutiveFailures: typeof raw.consecutiveFailures === 'number' ? raw.consecutiveFailures : 0,
      quarantineUntil: typeof raw.quarantineUntil === 'string' ? raw.quarantineUntil : null,
    };
  } catch (error) {
    console.error('[p2p.sync] failed to read sync metadata', { market, error });
    return initialSyncMeta(env);
  }
}

async function putSyncMeta(env: ProviderEnv, market: P2PMarket, meta: SyncMeta): Promise<void> {
  await env.P2P_KV.put(syncMetaKey(market), JSON.stringify(meta));
}

function invalidateMemoryCache(market: P2PMarket, invalidationVersion: number) {
  const entry = memorySnapshotCache.get(market);
  if (!entry) return;
  if (entry.invalidationVersion < invalidationVersion) {
    memorySnapshotCache.delete(market);
  }
}

async function getSnapshotFromMemoryCache(env: ProviderEnv, market: P2PMarket): Promise<P2PSnapshot | null> {
  const entry = memorySnapshotCache.get(market);
  if (!entry) return null;

  const cacheAgeMs = Date.now() - entry.cachedAt;
  const meta = await getSyncMeta(env, market);
  const hasScopedKvSnapshot = Boolean(await env.P2P_KV.get(kvKey(market, 'latest')));
  if (
    cacheAgeMs > MEMORY_CACHE_TTL_MS
    || entry.invalidationVersion < meta.invalidationVersion
    || entry.cacheScope !== peerSource(env)
    || (!hasScopedKvSnapshot && meta.version === 0)
  ) {
    memorySnapshotCache.delete(market);
    return null;
  }

  return cloneSnapshot(entry.snapshot, {
    servedFrom: 'memory_cache',
    cacheAgeMs,
    replicationLagMs: Math.max(0, Date.now() - new Date(meta.lastReplicationAt).getTime()),
    version: meta.version,
    lamport: meta.lamport,
    peerSource: meta.peerSource,
  });
}

function cacheSnapshot(snapshot: P2PSnapshot, invalidationVersion: number, cacheScope = snapshot.peerSource) {
  memorySnapshotCache.set(snapshot.market, {
    snapshot,
    cachedAt: Date.now(),
    invalidationVersion,
    cacheScope,
  });
}

async function runAntiEntropyPull(env: ProviderEnv, market: P2PMarket): Promise<P2PSnapshot | null> {
  const meta = await getSyncMeta(env, market);
  const kvSnapshot = await getSnapshotFromKV(env, market);
  if (!kvSnapshot) {
    invalidateMemoryCache(market, meta.invalidationVersion);
    return null;
  }

  const repairedSnapshot = cloneSnapshot(kvSnapshot, {
    servedFrom: 'kv',
    cacheAgeMs: Date.now() - kvSnapshot.ts,
    replicationLagMs: Math.max(0, Date.now() - new Date(meta.lastReplicationAt).getTime()),
    version: meta.version,
    lamport: meta.lamport,
    peerSource: meta.peerSource,
  });
  invalidateMemoryCache(market, meta.invalidationVersion);
  cacheSnapshot(repairedSnapshot, meta.invalidationVersion, peerSource(env));
  return repairedSnapshot;
}

async function persistSnapshot(env: ProviderEnv, snapshot: P2PSnapshot): Promise<P2PHistoryPoint[]> {
  const meta = await getSyncMeta(env, snapshot.market);
  const existingHistory = await getHistoryFromKV(env, snapshot.market);
  const nextHistory = snapshot.source === 'live'
    ? [...existingHistory, toHistoryPoint(snapshot)].slice(-TRACKER_HISTORY_LIMIT)
    : existingHistory;

  const version = meta.version + 1;
  const lamport = Math.max(meta.lamport, version) + 1;
  const lastReplicationAt = new Date().toISOString();
  const persistedSnapshot = cloneSnapshot(snapshot, {
    version,
    lamport,
    servedFrom: 'live_fetch',
    peerSource: peerSource(env),
    cacheAgeMs: 0,
    replicationLagMs: 0,
  });
  const nextMeta: SyncMeta = {
    version,
    lamport,
    invalidationVersion: meta.invalidationVersion + 1,
    lastUpdatedAt: persistedSnapshot.fetchedAt,
    lastReplicationAt,
    peerSource: peerSource(env),
    consecutiveFailures: 0,
    quarantineUntil: null,
  };

  await Promise.all([
    env.P2P_KV.put(kvKey(snapshot.market, 'latest'), JSON.stringify(persistedSnapshot)),
    env.P2P_KV.put(kvKey(snapshot.market, 'history'), JSON.stringify(nextHistory)),
    putSyncMeta(env, snapshot.market, nextMeta),
  ]);

  invalidateMemoryCache(snapshot.market, nextMeta.invalidationVersion);
  cacheSnapshot(persistedSnapshot, nextMeta.invalidationVersion, peerSource(env));
  console.info(`[p2p.sync] push market=${snapshot.market} version=${version} lamport=${lamport} peer=${nextMeta.peerSource}`);

  return nextHistory;
}

function staleSnapshot(snapshot: P2PSnapshot, retryCount: number): P2PSnapshot {
  return {
    ...snapshot,
    servedFrom: 'stale_cache',
    stale: true,
    status: 'degraded',
    cacheAgeMs: Date.now() - snapshot.ts,
    replicationLagMs: Date.now() - snapshot.ts,
    retryCount,
  };
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBinanceSide(tradeType: 'BUY' | 'SELL', fiat: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BINANCE_TIMEOUT_MS);
  try {
    const res = await fetch(BINANCE_P2P_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: 1,
        rows: 10,
        payTypes: [],
        publisherType: null,
        asset: 'USDT',
        tradeType,
        fiat,
        merchantCheck: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Binance ${tradeType} ${fiat} HTTP ${res.status}`);
    const json = await res.json() as { data?: unknown[] };
    if (!Array.isArray(json?.data)) throw new Error(`Binance ${tradeType} ${fiat} bad payload`);
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

function parseBinanceSide(data: unknown[], side: 'sell' | 'buy'): SideResult {
  const offers: BinanceOffer[] = (data || [])
    .map((row: any) => ({
      price: parseFloat(row?.adv?.price) || 0,
      min: parseFloat(row?.adv?.minSingleTransAmount) || 0,
      max: parseFloat(row?.adv?.dynamicMaxSingleTransAmount ?? row?.adv?.maxSingleTransAmount) || 0,
      nick: String(row?.advertiser?.nickName || ''),
      methods: (row?.adv?.tradeMethods || []).map((item: any) => item.tradeMethodName).filter(Boolean),
      available: parseFloat(row?.adv?.tradableQuantity || row?.adv?.surplusAmount || '0'),
    }))
    .filter((offer) => offer.price > 0);

  const sorted = offers.slice().sort((a, b) => side === 'sell' ? b.price - a.price : a.price - b.price);
  const top5 = sorted.slice(0, 5);
  const avg = top5.length ? top5.reduce((sum, offer) => sum + offer.price, 0) / top5.length : null;
  const best = sorted[0]?.price ?? null;
  const depth = top5.reduce((sum, offer) => {
    return side === 'sell'
      ? sum + Math.min(offer.max, offer.available > 0 ? offer.available * offer.price : offer.max)
      : sum + Math.min(offer.max / (offer.price || 1), offer.available > 0 ? offer.available : offer.max / (offer.price || 1));
  }, 0);

  return { avg, best, depth, offers: sorted };
}

async function fetchLiveSnapshot(market: P2PMarket, _env: ProviderEnv): Promise<P2PSnapshot> {
  const config = P2P_MARKET_CONFIGS[market];
  if (!config) throw new Error(`No config for market ${market}`);

  let lastError: unknown;
  for (let attempt = 0; attempt <= LIVE_MAX_RETRIES; attempt += 1) {
    const startedAt = Date.now();
    try {
      const [buyRaw, sellRaw] = await Promise.all([
        fetchBinanceSide('BUY', config.binanceFiat),
        fetchBinanceSide('SELL', config.binanceFiat),
      ]);

      const sellSide = parseBinanceSide(buyRaw, 'sell');
      const buySide = parseBinanceSide(sellRaw, 'buy');
      const ts = Date.now();
      const spread = sellSide.avg != null && buySide.avg != null ? sellSide.avg - buySide.avg : null;
      const spreadPct = spread != null && buySide.avg != null ? (spread / buySide.avg) * 100 : null;

      return {
        ts,
        market,
        source: 'live',
        servedFrom: 'live_fetch',
        peerSource: peerSource(_env),
        fetchedAt: new Date(ts).toISOString(),
        stale: false,
        status: 'ok',
        unavailableReason: null,
        version: 0,
        lamport: 0,
        cacheAgeMs: 0,
        replicationLagMs: 0,
        latencyMs: Date.now() - startedAt,
        retryCount: attempt,
        sellAvg: sellSide.avg,
        buyAvg: buySide.avg,
        bestSell: sellSide.best,
        bestBuy: buySide.best,
        sellDepth: sellSide.depth,
        buyDepth: buySide.depth,
        spread,
        spreadPct,
        sellOffers: sellSide.offers,
        buyOffers: buySide.offers,
      };
    } catch (error) {
      lastError = error;
      if (attempt < LIVE_MAX_RETRIES) await delay(LIVE_BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('binance_poll_failed');
}

async function fetchTransientLiveSnapshot(market: P2PMarket, env: ProviderEnv): Promise<P2PSnapshot> {
  const meta = await getSyncMeta(env, market);
  if (meta.quarantineUntil && new Date(meta.quarantineUntil).getTime() > Date.now()) {
    throw new Error(`upstream_quarantined_until:${meta.quarantineUntil}`);
  }

  const snapshot = await fetchLiveSnapshot(market, env);
  return cloneSnapshot(snapshot, {
    version: meta.version,
    lamport: meta.lamport,
    replicationLagMs: Math.max(0, Date.now() - new Date(meta.lastReplicationAt).getTime()),
  });
}

export async function refreshP2PMarketSnapshot(marketInput: string, env: ProviderEnv): Promise<{ snapshot: P2PSnapshot; history: P2PHistoryPoint[] }> {
  const market = normalizeMarketId(marketInput);
  const meta = await getSyncMeta(env, market);
  if (meta.quarantineUntil && new Date(meta.quarantineUntil).getTime() > Date.now()) {
    throw new Error(`upstream_quarantined_until:${meta.quarantineUntil}`);
  }

  const snapshot = await fetchLiveSnapshot(market, env);
  const history = await persistSnapshot(env, snapshot);
  return { snapshot, history };
}

export async function getP2PSnapshot(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  await runAntiEntropyPull(env, market);
  const memoryCached = await getSnapshotFromMemoryCache(env, market);
  if (memoryCached) return memoryCached;
  const cached = await getSnapshotFromKV(env, market);
  if (cached) {
    const meta = await getSyncMeta(env, market);
    const fromKv = cloneSnapshot(cached, {
      servedFrom: 'kv',
      cacheAgeMs: Date.now() - cached.ts,
      replicationLagMs: Math.max(0, Date.now() - new Date(meta.lastReplicationAt).getTime()),
      version: meta.version,
      lamport: meta.lamport,
      peerSource: meta.peerSource,
    });
    cacheSnapshot(fromKv, meta.invalidationVersion, peerSource(env));
    return fromKv;
  }
  return await fetchTransientLiveSnapshot(market, env);
}

export async function getP2PHistory(marketInput: string | undefined, env: ProviderEnv): Promise<P2PHistoryPoint[]> {
  const market = normalizeMarketId(marketInput);
  const history = await getHistoryFromKV(env, market);
  if (history.length > 0) return history;
  const snapshot = await getP2PSnapshotWithFallback(market, env);
  return snapshot.source === 'live' ? await getHistoryFromKV(env, market) : [];
}

export async function getP2PSnapshotWithFallback(marketInput: string | undefined, env: ProviderEnv): Promise<P2PSnapshot> {
  const market = normalizeMarketId(marketInput);
  await runAntiEntropyPull(env, market);
  const memoryCached = await getSnapshotFromMemoryCache(env, market);
  if (memoryCached && memoryCached.source === 'live' && !memoryCached.stale) {
    return memoryCached;
  }

  const cached = await getSnapshotFromKV(env, market);
  if (cached && cached.source === 'live' && !cached.stale) {
    const meta = await getSyncMeta(env, market);
    const fromKv = cloneSnapshot(cached, {
      servedFrom: 'kv',
      cacheAgeMs: Date.now() - cached.ts,
      replicationLagMs: Math.max(0, Date.now() - new Date(meta.lastReplicationAt).getTime()),
      version: meta.version,
      lamport: meta.lamport,
      peerSource: meta.peerSource,
    });
    cacheSnapshot(fromKv, meta.invalidationVersion, peerSource(env));
    return fromKv;
  }

  try {
    const snapshot = await fetchTransientLiveSnapshot(market, env);
    return snapshot;
  } catch (error) {
    const meta = await getSyncMeta(env, market);
    const failures = meta.consecutiveFailures + 1;
    const quarantineUntil = failures >= PEER_FAILURE_THRESHOLD
      ? new Date(Date.now() + PEER_FAILURE_QUARANTINE_MS).toISOString()
      : null;
    await putSyncMeta(env, market, {
      ...meta,
      consecutiveFailures: failures,
      quarantineUntil,
    });
    if (cached && cached.source === 'live') {
      return staleSnapshot(cached, LIVE_MAX_RETRIES);
    }
    return createUnavailableSnapshot(
      market,
      error instanceof Error ? error.message : 'binance_poll_failed',
      LIVE_MAX_RETRIES,
    );
  }
}

export async function scheduledRefreshAllMarkets(env: ProviderEnv, log: Pick<Console, 'info' | 'error'> = console): Promise<void> {
  await Promise.all(P2P_MARKETS.map(async (market) => {
    try {
      await runAntiEntropyPull(env, market);
      const { snapshot, history } = await refreshP2PMarketSnapshot(market, env);
      log.info(`[p2p] refreshed market=${market} source=${snapshot.source} history=${history.length} stale=${snapshot.stale}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const meta = await getSyncMeta(env, market);
      const failures = meta.consecutiveFailures + 1;
      const quarantineUntil = failures >= PEER_FAILURE_THRESHOLD
        ? new Date(Date.now() + PEER_FAILURE_QUARANTINE_MS).toISOString()
        : null;
      await putSyncMeta(env, market, {
        ...meta,
        consecutiveFailures: failures,
        quarantineUntil,
      });
      log.error(`[p2p] refresh failed market=${market} error=${message}`);
    }
  }));
}

export { normalizeMarketId, P2P_MARKETS };
