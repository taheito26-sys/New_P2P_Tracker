// Demo data matching the TRACKER_CLOUDFLARE- repo state model
import { getCurrentTrackerState } from './tracker-backup';
import { num, uid, type TrackerState, type Batch, type Trade, type Customer, computeFIFO, type DerivedState } from './tracker-helpers';

const now = Date.now();
const DAY = 86400000;

function makeBatches(): Batch[] {
  return [
    { id: uid(), ts: now - 14 * DAY, source: 'Al-Wakra Exchange', note: '', buyPriceQAR: 3.72, initialUSDT: 25000, revisions: [] },
    { id: uid(), ts: now - 10 * DAY, source: 'Souq Trader', note: 'Bulk buy', buyPriceQAR: 3.74, initialUSDT: 15000, revisions: [] },
    { id: uid(), ts: now - 7 * DAY, source: 'Binance P2P', note: '', buyPriceQAR: 3.73, initialUSDT: 20000, revisions: [] },
    { id: uid(), ts: now - 3 * DAY, source: 'Al-Wakra Exchange', note: 'Weekly restock', buyPriceQAR: 3.75, initialUSDT: 30000, revisions: [] },
    { id: uid(), ts: now - 1 * DAY, source: 'Doha OTC', note: '', buyPriceQAR: 3.76, initialUSDT: 10000, revisions: [] },
  ];
}

function makeTrades(batches: Batch[]): Trade[] {
  const customers = makeCust();
  return [
    { id: uid(), ts: now - 13 * DAY, inputMode: 'USDT', amountUSDT: 5000, sellPriceQAR: 3.78, feeQAR: 12, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[0].id },
    { id: uid(), ts: now - 12 * DAY, inputMode: 'USDT', amountUSDT: 3000, sellPriceQAR: 3.79, feeQAR: 8, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[1].id },
    { id: uid(), ts: now - 11 * DAY, inputMode: 'USDT', amountUSDT: 8000, sellPriceQAR: 3.77, feeQAR: 20, note: 'Bulk', voided: false, usesStock: true, revisions: [], customerId: customers[2].id },
    { id: uid(), ts: now - 9 * DAY, inputMode: 'USDT', amountUSDT: 2000, sellPriceQAR: 3.80, feeQAR: 5, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[0].id },
    { id: uid(), ts: now - 8 * DAY, inputMode: 'USDT', amountUSDT: 6000, sellPriceQAR: 3.78, feeQAR: 15, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[3].id },
    { id: uid(), ts: now - 6 * DAY, inputMode: 'USDT', amountUSDT: 4500, sellPriceQAR: 3.79, feeQAR: 10, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[1].id },
    { id: uid(), ts: now - 5 * DAY, inputMode: 'USDT', amountUSDT: 7000, sellPriceQAR: 3.81, feeQAR: 18, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[2].id },
    { id: uid(), ts: now - 4 * DAY, inputMode: 'USDT', amountUSDT: 3500, sellPriceQAR: 3.77, feeQAR: 9, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[4].id },
    { id: uid(), ts: now - 2 * DAY, inputMode: 'USDT', amountUSDT: 5500, sellPriceQAR: 3.82, feeQAR: 14, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[0].id },
    { id: uid(), ts: now - 1 * DAY, inputMode: 'USDT', amountUSDT: 2500, sellPriceQAR: 3.80, feeQAR: 7, note: '', voided: false, usesStock: true, revisions: [], customerId: customers[3].id },
    { id: uid(), ts: now - 0.5 * DAY, inputMode: 'USDT', amountUSDT: 4000, sellPriceQAR: 3.83, feeQAR: 10, note: 'Premium', voided: false, usesStock: true, revisions: [], customerId: customers[1].id },
  ];
}

function makeCust(): Customer[] {
  return [
    { id: uid(), name: 'Ahmed Al-Thani', phone: '+974 5511 2233', tier: 'A', dailyLimitUSDT: 50000, notes: 'VIP trader', createdAt: now - 30 * DAY },
    { id: uid(), name: 'Mohammed', phone: '+974 5544 6677', tier: 'B', dailyLimitUSDT: 20000, notes: '', createdAt: now - 20 * DAY },
    { id: uid(), name: 'Khalid Enterprises', phone: '+974 5588 9900', tier: 'A', dailyLimitUSDT: 100000, notes: 'Corporate', createdAt: now - 25 * DAY },
    { id: uid(), name: 'Fatima', phone: '+974 5522 3344', tier: 'C', dailyLimitUSDT: 10000, notes: '', createdAt: now - 15 * DAY },
    { id: uid(), name: 'Rashid Trading', phone: '', tier: 'B', dailyLimitUSDT: 30000, notes: 'Wholesale', createdAt: now - 10 * DAY },
  ];
}

type DemoOverrides = Partial<TrackerState['settings']> & {
  range?: TrackerState['range'];
  currency?: TrackerState['currency'];
};

function normalizeBatch(raw: unknown): Batch | null {
  if (!raw || typeof raw !== 'object') return null;
  const batch = raw as Partial<Batch> & Record<string, unknown>;
  return {
    id: typeof batch.id === 'string' && batch.id.trim() ? batch.id : uid(),
    ts: num(batch.ts ?? batch.created_at ?? Date.now(), Date.now()),
    source: typeof batch.source === 'string' ? batch.source : '',
    note: typeof batch.note === 'string' ? batch.note : typeof batch.notes === 'string' ? batch.notes : '',
    buyPriceQAR: num(batch.buyPriceQAR ?? batch.priceQAR ?? batch.unit_cost, 0),
    initialUSDT: num(batch.initialUSDT ?? batch.qty ?? batch.quantity, 0),
    revisions: Array.isArray(batch.revisions) ? batch.revisions : [],
  };
}

function normalizeTrade(raw: unknown): Trade | null {
  if (!raw || typeof raw !== 'object') return null;
  const trade = raw as Partial<Trade> & Record<string, unknown>;
  const inputMode = trade.inputMode === 'QAR' ? 'QAR' : 'USDT';
  const customerId = typeof trade.customerId === 'string'
    ? trade.customerId
    : typeof trade.customer_id === 'string'
      ? trade.customer_id
      : '';

  return {
    id: typeof trade.id === 'string' && trade.id.trim() ? trade.id : uid(),
    ts: num(trade.ts ?? trade.created_at ?? Date.now(), Date.now()),
    inputMode,
    amountUSDT: num(trade.amountUSDT ?? trade.quantity, 0),
    sellPriceQAR: num(trade.sellPriceQAR ?? trade.unit_price, 0),
    feeQAR: num(trade.feeQAR ?? trade.fee, 0),
    note: typeof trade.note === 'string' ? trade.note : typeof trade.notes === 'string' ? trade.notes : '',
    voided: Boolean(trade.voided),
    usesStock: trade.usesStock !== false,
    revisions: Array.isArray(trade.revisions) ? trade.revisions : [],
    customerId,
    linkedDealId: typeof trade.linkedDealId === 'string' ? trade.linkedDealId : undefined,
    linkedRelId: typeof trade.linkedRelId === 'string' ? trade.linkedRelId : undefined,
    linkedMerchantId: typeof trade.linkedMerchantId === 'string' ? trade.linkedMerchantId : undefined,
    agreementFamily: trade.agreementFamily === 'profit_share' || trade.agreementFamily === 'sales_deal' ? trade.agreementFamily : undefined,
    agreementTemplateId: typeof trade.agreementTemplateId === 'string' ? trade.agreementTemplateId : undefined,
    partnerPct: trade.partnerPct == null ? undefined : num(trade.partnerPct, 0),
    merchantPct: trade.merchantPct == null ? undefined : num(trade.merchantPct, 0),
    isPartnerLinked: Boolean(trade.isPartnerLinked ?? trade.linkedRelId ?? trade.agreementFamily ?? trade.approvalStatus),
    createdByUserId: typeof trade.createdByUserId === 'string' ? trade.createdByUserId : undefined,
    counterpartyMerchantId: typeof trade.counterpartyMerchantId === 'string' ? trade.counterpartyMerchantId : undefined,
    approvalStatus: typeof trade.approvalStatus === 'string' ? trade.approvalStatus as Trade['approvalStatus'] : undefined,
    cancellationRequestedBy: typeof trade.cancellationRequestedBy === 'string' ? trade.cancellationRequestedBy : undefined,
    cancellationReason: typeof trade.cancellationReason === 'string' ? trade.cancellationReason : undefined,
    cancellationRequestedAt: trade.cancellationRequestedAt == null ? undefined : num(trade.cancellationRequestedAt, Date.now()),
    cancellationDecisions: trade.cancellationDecisions && typeof trade.cancellationDecisions === 'object' ? trade.cancellationDecisions as Record<string, 'approved' | 'rejected'> : undefined,
  };
}

function normalizeCustomer(raw: unknown): Customer | null {
  if (!raw || typeof raw !== 'object') return null;
  const customer = raw as Partial<Customer> & Record<string, unknown>;
  return {
    id: typeof customer.id === 'string' && customer.id.trim() ? customer.id : uid(),
    name: typeof customer.name === 'string' ? customer.name : '',
    phone: typeof customer.phone === 'string' ? customer.phone : '',
    tier: typeof customer.tier === 'string' && customer.tier.trim() ? customer.tier : 'C',
    dailyLimitUSDT: num(customer.dailyLimitUSDT, 0),
    notes: typeof customer.notes === 'string' ? customer.notes : '',
    createdAt: num(customer.createdAt ?? customer.created_at ?? Date.now(), Date.now()),
  };
}

function loadStoredTrackerState(overrides?: DemoOverrides): TrackerState | null {
  if (typeof window === 'undefined') return null;
  const isCleared = localStorage.getItem('tracker_data_cleared') === 'true';
  if (isCleared) return null;

  const stored = getCurrentTrackerState(localStorage);
  if (!stored || Object.keys(stored).length === 0) return null;

  const batches = Array.isArray(stored.batches)
    ? stored.batches.map(normalizeBatch).filter((batch): batch is Batch => batch !== null)
    : [];
  const trades = Array.isArray(stored.trades)
    ? stored.trades.map(normalizeTrade).filter((trade): trade is Trade => trade !== null)
    : [];
  const customers = Array.isArray(stored.customers)
    ? stored.customers.map(normalizeCustomer).filter((customer): customer is Customer => customer !== null)
    : [];
  const settings = typeof stored.settings === 'object' && stored.settings !== null ? stored.settings as Record<string, unknown> : {};
  const cal = typeof stored.cal === 'object' && stored.cal !== null ? stored.cal as Record<string, unknown> : {};

  return {
    currency: stored.currency === 'USDT' ? 'USDT' : overrides?.currency ?? 'QAR',
    range: typeof stored.range === 'string' && stored.range.trim() ? stored.range : overrides?.range ?? '7d',
    batches,
    trades,
    customers,
    cashQAR: num(stored.cashQAR, 0),
    cashOwner: typeof stored.cashOwner === 'string' ? stored.cashOwner : 'Main Account',
    settings: {
      lowStockThreshold: num(settings.lowStockThreshold, overrides?.lowStockThreshold ?? 5000),
      priceAlertThreshold: num(settings.priceAlertThreshold, overrides?.priceAlertThreshold ?? 2),
    },
    cal: {
      year: num(cal.year, new Date().getFullYear()),
      month: num(cal.month, new Date().getMonth()),
      selectedDay: cal.selectedDay == null ? null : num(cal.selectedDay, 0),
    },
  };
}

export function createDemoState(overrides?: DemoOverrides): { state: TrackerState; derived: DerivedState } {
  const storedState = loadStoredTrackerState(overrides);
  if (storedState) {
    const derived = computeFIFO(storedState.batches, storedState.trades);
    return { state: storedState, derived };
  }

  const isCleared = typeof window !== 'undefined' && localStorage.getItem('tracker_data_cleared') === 'true';

  const batches = isCleared ? [] : makeBatches();
  const customers = isCleared ? [] : makeCust();
  const trades = isCleared ? [] : makeTrades(batches);

  const state: TrackerState = {
    currency: overrides?.currency ?? 'QAR',
    range: overrides?.range ?? '7d',
    batches,
    trades,
    customers,
    cashQAR: isCleared ? 0 : 45000,
    cashOwner: 'Main Account',
    settings: {
      lowStockThreshold: overrides?.lowStockThreshold ?? 5000,
      priceAlertThreshold: overrides?.priceAlertThreshold ?? 2,
    },
    cal: { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDay: null },
  };

  const derived = computeFIFO(batches, trades);
  return { state, derived };
}
