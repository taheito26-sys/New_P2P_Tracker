import { getCurrentTrackerState } from '@/lib/tracker-backup';
import { computeFIFO, getWACOP, num, totalStock, type Batch, type Trade } from '@/lib/tracker-helpers';

export interface P2PPortfolioView {
  holdingsQty: number | null;
  avgCost: number | null;
  avgCostCurrency: 'QAR';
  unavailableReason: string | null;
}

function normalizeBatch(raw: unknown): Batch | null {
  if (!raw || typeof raw !== 'object') return null;
  const batch = raw as Partial<Batch> & Record<string, unknown>;
  return {
    id: typeof batch.id === 'string' && batch.id.trim() ? batch.id : '',
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
  return {
    id: typeof trade.id === 'string' && trade.id.trim() ? trade.id : '',
    ts: num(trade.ts ?? trade.created_at ?? Date.now(), Date.now()),
    inputMode: trade.inputMode === 'QAR' ? 'QAR' : 'USDT',
    amountUSDT: num(trade.amountUSDT ?? trade.quantity, 0),
    sellPriceQAR: num(trade.sellPriceQAR ?? trade.unit_price, 0),
    feeQAR: num(trade.feeQAR ?? trade.fee, 0),
    note: typeof trade.note === 'string' ? trade.note : typeof trade.notes === 'string' ? trade.notes : '',
    voided: Boolean(trade.voided),
    usesStock: trade.usesStock !== false,
    revisions: Array.isArray(trade.revisions) ? trade.revisions : [],
    customerId: typeof trade.customerId === 'string' ? trade.customerId : typeof trade.customer_id === 'string' ? trade.customer_id : '',
  };
}

export function getRealP2PPortfolioView(): P2PPortfolioView {
  if (typeof window === 'undefined') {
    return { holdingsQty: null, avgCost: null, avgCostCurrency: 'QAR', unavailableReason: 'portfolio_storage_unavailable' };
  }
  if (localStorage.getItem('tracker_data_cleared') === 'true') {
    return { holdingsQty: null, avgCost: null, avgCostCurrency: 'QAR', unavailableReason: 'portfolio_cleared' };
  }

  const stored = getCurrentTrackerState(localStorage);
  if (!stored || (!Array.isArray(stored.batches) && !Array.isArray(stored.trades))) {
    return { holdingsQty: null, avgCost: null, avgCostCurrency: 'QAR', unavailableReason: 'portfolio_missing' };
  }

  const batches = Array.isArray(stored.batches) ? stored.batches.map(normalizeBatch).filter((v): v is Batch => Boolean(v && v.id)) : [];
  const trades = Array.isArray(stored.trades) ? stored.trades.map(normalizeTrade).filter((v): v is Trade => Boolean(v && v.id)) : [];
  const derived = computeFIFO(batches, trades);
  const holdingsQty = totalStock(derived);
  const avgCost = getWACOP(derived);

  return {
    holdingsQty: holdingsQty > 0 ? holdingsQty : null,
    avgCost: avgCost && avgCost > 0 ? avgCost : null,
    avgCostCurrency: 'QAR',
    unavailableReason: holdingsQty > 0 && avgCost && avgCost > 0 ? null : 'portfolio_missing_cost_basis',
  };
}
