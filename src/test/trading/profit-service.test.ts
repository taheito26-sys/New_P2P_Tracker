import { describe, expect, it } from 'vitest';
import { calculateNetProfit } from '@/lib/trading/profit-service';

describe('calculateNetProfit', () => {
  it('calculates profit share agreements', () => {
    expect(calculateNetProfit({
      quantity: 100,
      unitPrice: 250,
      snapshot: { agreementType: 'profit_share', profitSharePercent: 12 },
    })).toBe(3000);
  });

  it('calculates fixed margin agreements', () => {
    expect(calculateNetProfit({
      quantity: 20,
      unitPrice: 50,
      snapshot: { agreementType: 'fixed_margin', fixedMarginAmount: 8 },
    })).toBe(160);
  });
});
