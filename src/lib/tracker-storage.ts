import type { TrackerState } from '@/lib/tracker-helpers';
import { findTrackerStorageKey, getCurrentTrackerState } from '@/lib/tracker-backup';

type TrackerSettingsOverrides = {
  lowStockThreshold: number;
  priceAlertThreshold: number;
  range: string;
  currency: 'QAR' | 'USDT';
};

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function buildEmptyTrackerState(overrides: TrackerSettingsOverrides): TrackerState {
  return {
    currency: overrides.currency,
    range: overrides.range,
    batches: [],
    trades: [],
    customers: [],
    cashQAR: 0,
    cashOwner: 'Main Account',
    settings: {
      lowStockThreshold: overrides.lowStockThreshold,
      priceAlertThreshold: overrides.priceAlertThreshold,
    },
    cal: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      selectedDay: null,
    },
  };
}

export function loadTrackerState(storage: Storage, overrides: TrackerSettingsOverrides): TrackerState {
  const base = buildEmptyTrackerState(overrides);
  const raw = getCurrentTrackerState(storage) as Partial<TrackerState>;
  if (!Array.isArray(raw.batches) || !Array.isArray(raw.trades) || !Array.isArray(raw.customers)) {
    return base;
  }

  return {
    ...base,
    ...raw,
    currency: raw.currency === 'USDT' ? 'USDT' : raw.currency === 'QAR' ? 'QAR' : base.currency,
    range: typeof raw.range === 'string' ? raw.range : base.range,
    cashQAR: asNumber(raw.cashQAR, base.cashQAR),
    cashOwner: typeof raw.cashOwner === 'string' && raw.cashOwner.trim() ? raw.cashOwner : base.cashOwner,
    settings: {
      lowStockThreshold: asNumber(raw.settings?.lowStockThreshold, base.settings.lowStockThreshold),
      priceAlertThreshold: asNumber(raw.settings?.priceAlertThreshold, base.settings.priceAlertThreshold),
    },
    cal: {
      year: asNumber(raw.cal?.year, base.cal.year),
      month: asNumber(raw.cal?.month, base.cal.month),
      selectedDay: typeof raw.cal?.selectedDay === 'number' ? raw.cal.selectedDay : null,
    },
  };
}

export function saveTrackerState(storage: Storage, state: TrackerState): void {
  const key = findTrackerStorageKey(storage);
  storage.setItem(key, JSON.stringify(state));
}

export function toTradeCsv(state: Record<string, any>): string {
  const trades = Array.isArray(state.trades) ? state.trades : [];
  const headers = ['id', 'ts', 'amountUSDT', 'sellPriceQAR', 'feeQAR', 'note', 'voided'];
  const rows = trades.map((t: any) => headers.map((h) => JSON.stringify(t?.[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export function toTradeExcelTsv(state: Record<string, any>): string {
  const trades = Array.isArray(state.trades) ? state.trades : [];
  const headers = ['id', 'ts', 'amountUSDT', 'sellPriceQAR', 'feeQAR', 'note', 'voided'];
  const esc = (v: unknown) => String(v ?? '').replace(/[\t\n\r]/g, ' ').trim();
  const rows = trades.map((t: any) => headers.map((h) => esc(t?.[h])).join('\t'));
  return ['\uFEFF' + headers.join('\t'), ...rows].join('\n');
}
