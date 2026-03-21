import { describe, expect, it } from 'vitest';
import { calculateProfitIfSoldNow } from '@/lib/p2p-profit';

describe('calculateProfitIfSoldNow', () => {
  it('calculates profit when market and cost basis share the same currency', () => {
    const result = calculateProfitIfSoldNow({
      holdingsQty: 1000,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 3.82,
      marketCurrency: 'QAR',
      baseCurrency: 'QAR',
    });

    expect(result).toEqual({
      status: 'available',
      holdingsQty: 1000,
      avgCostPerUsdtInBase: 3.7,
      normalizedSellAvgPerUsdtInBase: 3.82,
      profitInBase: 120,
    });
  });

  it('calculates profit when explicit normalization is provided', () => {
    const result = calculateProfitIfSoldNow({
      holdingsQty: 500,
      avgCostPerUsdtInBase: 3.75,
      marketSellAvgPerUsdt: 1.02,
      marketCurrency: 'AED',
      baseCurrency: 'QAR',
      marketToBaseRate: 1.05,
    });

    expect(result.status).toBe('available');
    expect(result.normalizedSellAvgPerUsdtInBase).toBeCloseTo(1.071, 6);
    expect(result.profitInBase).toBe(Math.round((1.02 * 1.05 - 3.75) * 500));
  });

  it('returns unavailable when holdings are missing', () => {
    expect(calculateProfitIfSoldNow({
      holdingsQty: null,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 3.8,
      marketCurrency: 'QAR',
      baseCurrency: 'QAR',
    })).toEqual({ status: 'unavailable', reason: 'missing_holdings' });
  });

  it('returns unavailable when cost basis is missing', () => {
    expect(calculateProfitIfSoldNow({
      holdingsQty: 100,
      avgCostPerUsdtInBase: null,
      marketSellAvgPerUsdt: 3.8,
      marketCurrency: 'QAR',
      baseCurrency: 'QAR',
    })).toEqual({ status: 'unavailable', reason: 'missing_cost_basis' });
  });

  it('does not compare mismatched currencies without normalization metadata', () => {
    expect(calculateProfitIfSoldNow({
      holdingsQty: 100,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 3.68,
      marketCurrency: 'AED',
      baseCurrency: 'QAR',
    })).toEqual({ status: 'unavailable', reason: 'missing_normalization_rate' });
  });

  it('switching markets requires explicit normalization rather than raw subtraction', () => {
    const qatar = calculateProfitIfSoldNow({
      holdingsQty: 250,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 3.82,
      marketCurrency: 'QAR',
      baseCurrency: 'QAR',
    });
    const uae = calculateProfitIfSoldNow({
      holdingsQty: 250,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 3.82,
      marketCurrency: 'AED',
      baseCurrency: 'QAR',
    });
    const egypt = calculateProfitIfSoldNow({
      holdingsQty: 250,
      avgCostPerUsdtInBase: 3.7,
      marketSellAvgPerUsdt: 50,
      marketCurrency: 'EGP',
      baseCurrency: 'QAR',
    });

    expect(qatar.status).toBe('available');
    expect(uae).toEqual({ status: 'unavailable', reason: 'missing_normalization_rate' });
    expect(egypt).toEqual({ status: 'unavailable', reason: 'missing_normalization_rate' });
  });
});
