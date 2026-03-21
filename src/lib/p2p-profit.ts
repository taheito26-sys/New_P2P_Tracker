export interface ProfitInput {
  holdingsQty: number | null;
  avgCostPerUsdtInBase: number | null;
  marketSellAvgPerUsdt: number | null;
  marketCurrency: string;
  baseCurrency: string;
  marketToBaseRate?: number | null;
}

export interface ProfitResult {
  status: 'available' | 'unavailable';
  reason?: 'missing_holdings' | 'missing_cost_basis' | 'missing_market_sell_avg' | 'missing_normalization_rate';
  normalizedSellAvgPerUsdtInBase?: number;
  avgCostPerUsdtInBase?: number;
  holdingsQty?: number;
  profitInBase?: number;
}

export function calculateProfitIfSoldNow(input: ProfitInput): ProfitResult {
  const {
    holdingsQty,
    avgCostPerUsdtInBase,
    marketSellAvgPerUsdt,
    marketCurrency,
    baseCurrency,
    marketToBaseRate,
  } = input;

  if (!(holdingsQty != null) || !(holdingsQty > 0)) {
    return { status: 'unavailable', reason: 'missing_holdings' };
  }
  if (!(avgCostPerUsdtInBase != null) || !(avgCostPerUsdtInBase > 0)) {
    return { status: 'unavailable', reason: 'missing_cost_basis' };
  }
  if (!(marketSellAvgPerUsdt != null) || !(marketSellAvgPerUsdt > 0)) {
    return { status: 'unavailable', reason: 'missing_market_sell_avg' };
  }

  const normalizedSellAvgPerUsdtInBase = marketCurrency === baseCurrency
    ? marketSellAvgPerUsdt
    : (marketToBaseRate != null && marketToBaseRate > 0)
      ? marketSellAvgPerUsdt * marketToBaseRate
      : null;

  if (!(normalizedSellAvgPerUsdtInBase != null) || !(normalizedSellAvgPerUsdtInBase > 0)) {
    return { status: 'unavailable', reason: 'missing_normalization_rate' };
  }

  return {
    status: 'available',
    holdingsQty,
    avgCostPerUsdtInBase,
    normalizedSellAvgPerUsdtInBase,
    profitInBase: Math.round((normalizedSellAvgPerUsdtInBase - avgCostPerUsdtInBase) * holdingsQty),
  };
}
