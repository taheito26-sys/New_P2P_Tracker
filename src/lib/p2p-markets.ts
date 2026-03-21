export const P2P_MARKETS = ['qatar', 'uae', 'egypt'] as const;

export type P2PMarket = (typeof P2P_MARKETS)[number];
export type P2PSource = 'live' | 'unavailable';
export type P2PStatus = 'ok' | 'degraded' | 'unavailable';

export interface P2PMarketConfig {
  market: P2PMarket;
  currency: 'QAR' | 'AED' | 'EGP';
  pair: 'USDT/QAR' | 'USDT/AED' | 'USDT/EGP';
  binanceFiat: 'QAR' | 'AED' | 'EGP';
}

export const P2P_MARKET_CONFIGS: Record<P2PMarket, P2PMarketConfig> = {
  qatar: { market: 'qatar', currency: 'QAR', pair: 'USDT/QAR', binanceFiat: 'QAR' },
  uae: { market: 'uae', currency: 'AED', pair: 'USDT/AED', binanceFiat: 'AED' },
  egypt: { market: 'egypt', currency: 'EGP', pair: 'USDT/EGP', binanceFiat: 'EGP' },
};

const P2P_MARKET_ALIASES: Record<string, P2PMarket> = {
  qatar: 'qatar',
  qar: 'qatar',
  uae: 'uae',
  aed: 'uae',
  egypt: 'egypt',
  egy: 'egypt',
  egp: 'egypt',
};

export function normalizeMarketId(input?: string | null): P2PMarket {
  const normalized = input?.trim().toLowerCase() || 'qatar';
  const market = P2P_MARKET_ALIASES[normalized];
  if (!market) {
    throw new Error(`Unsupported market "${input || ''}". Supported markets: qatar, uae, egypt.`);
  }
  return market;
}

export function isCanonicalMarketId(input: string): input is P2PMarket {
  return P2P_MARKETS.includes(input as P2PMarket);
}

export function getP2PMarketConfig(input?: string | null): P2PMarketConfig {
  return P2P_MARKET_CONFIGS[normalizeMarketId(input)];
}
