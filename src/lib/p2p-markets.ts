export const P2P_MARKETS = ['qatar', 'uae', 'egypt'] as const;

export type P2PMarket = (typeof P2P_MARKETS)[number];
export type P2PSource = 'synthetic' | 'live';
export type P2PStatus = 'ok' | 'degraded';

const P2P_MARKET_ALIASES: Record<string, P2PMarket> = {
  qatar: 'qatar',
  qar: 'qatar',
  uae: 'uae',
  egypt: 'egypt',
  egy: 'egypt',
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
