import { describe, expect, it, beforeEach } from 'vitest';
import { getRealP2PPortfolioView } from '@/lib/p2p-portfolio';

describe('getRealP2PPortfolioView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an unavailable reason when no persisted tracker data exists', () => {
    expect(getRealP2PPortfolioView()).toEqual({
      holdingsQty: null,
      avgCost: null,
      avgCostCurrency: 'QAR',
      unavailableReason: 'portfolio_missing',
    });
  });
});
