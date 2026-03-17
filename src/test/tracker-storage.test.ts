import { describe, expect, it } from 'vitest';
import { buildEmptyTrackerState, loadTrackerState, saveTrackerState, toTradeCsv, toTradeExcelTsv } from '@/lib/tracker-storage';
import { clearTrackerStorage } from '@/lib/tracker-backup';

function createStorage(seed: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  } as Storage;
}

const overrides = {
  lowStockThreshold: 500,
  priceAlertThreshold: 2,
  range: '7d',
  currency: 'QAR' as const,
};

describe('tracker-storage', () => {
  it('loads empty state when no valid tracker payload exists', () => {
    const state = loadTrackerState(createStorage({}), overrides);
    expect(state.batches).toEqual([]);
    expect(state.trades).toEqual([]);
    expect(state.customers).toEqual([]);
  });

  it('saves and reloads tracker state used by stock/orders', () => {
    const storage = createStorage({});
    const state = buildEmptyTrackerState(overrides);
    state.batches.push({ id: 'b1', ts: 1, source: 's', note: '', buyPriceQAR: 3.7, initialUSDT: 100, revisions: [] });
    state.trades.push({ id: 't1', ts: 2, inputMode: 'USDT', amountUSDT: 10, sellPriceQAR: 3.8, feeQAR: 0, note: '', voided: false, usesStock: true, revisions: [], customerId: '' });

    saveTrackerState(storage, state);
    const loaded = loadTrackerState(storage, overrides);
    expect(loaded.batches.length).toBe(1);
    expect(loaded.trades.length).toBe(1);

    clearTrackerStorage(storage);
    const cleared = loadTrackerState(storage, overrides);
    expect(cleared.batches).toEqual([]);
    expect(cleared.trades).toEqual([]);
  });

  it('exports trade csv and excel payloads', () => {
    const state = {
      trades: [{ id: 't1', ts: 10, amountUSDT: 25, sellPriceQAR: 3.8, feeQAR: 1, note: 'ok', voided: false }],
    };
    const csv = toTradeCsv(state);
    const xls = toTradeExcelTsv(state);
    expect(csv).toContain('amountUSDT');
    expect(csv).toContain('"ok"');
    expect(xls.startsWith('\uFEFF')).toBe(true);
    expect(xls).toContain('t1\t10\t25');
  });
});
