import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CircleDollarSign, Landmark, ShieldCheck } from 'lucide-react';
import { createTrackerState } from '@/lib/tracker-demo-data';
import {
  fmtQWithUnit, fmtU, fmtQ, fmtPct, fmtP,
  kpiFor, totalStock, stockCostQAR, getWACOP,
  rangeLabel, num,
} from '@/lib/tracker-helpers';
import { useTheme } from '@/lib/theme-context';
import { useT } from '@/lib/i18n';
import * as api from '@/lib/api';
import type { MerchantDeal, MerchantApproval } from '@/types/domain';
import '@/styles/tracker.css';

type KpiCardProps = {
  label: string;
  value: string;
  sub: string;
  positive?: boolean;
  warn?: boolean;
};

function KpiCard({ label, value, sub, positive, warn }: KpiCardProps) {
  const valueClass = warn
    ? 'text-amber-500'
    : positive === true
    ? 'text-emerald-500'
    : positive === false
    ? 'text-rose-500'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardPageWorkspace />;
}

function DashboardPageWorkspace() {
  const { settings } = useTheme();
  const t = useT();
  const navigate = useNavigate();
  const { state, derived } = useMemo(() => createTrackerState({
    lowStockThreshold: settings.lowStockThreshold,
    priceAlertThreshold: settings.priceAlertThreshold,
  }), [settings.lowStockThreshold, settings.priceAlertThreshold]);

  const d1 = kpiFor(state, derived, 'today');
  const d7 = kpiFor(state, derived, '7d');
  const dR = kpiFor(state, derived, state.range);
  const stk = totalStock(derived);
  const stCost = stockCostQAR(derived);
  const wacop = getWACOP(derived);
  const rLabel = rangeLabel(state.range);

  const allTrades = state.trades.filter((trade) => !trade.voided);
  const allMargins = allTrades
    .map((trade) => {
      const calc = derived.tradeCalc.get(trade.id);
      return calc?.ok ? calc.margin : null;
    })
    .filter((value): value is number => value !== null);
  const avgM = allMargins.length ? allMargins.reduce((sum, value) => sum + value, 0) / allMargins.length : 0;

  const LOW = num(state.settings?.lowStockThreshold, 5000);
  const isLow = stk <= 0 || (LOW > 0 && stk < LOW);

  const [merchantDeals, setMerchantDeals] = useState<MerchantDeal[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<MerchantApproval[]>([]);

  useEffect(() => {
    api.deals.list().then((response) => setMerchantDeals(response.deals)).catch(() => {});
    api.approvals.inbox().then((response) => setPendingApprovals(response.approvals.filter((a) => a.status === 'pending'))).catch(() => {});
  }, []);

  const activeDeals = merchantDeals.filter((deal) => deal.status === 'approved');
  const merchantExposure = activeDeals.reduce((sum, deal) => sum + deal.amount, 0);
  const merchantPnL = merchantDeals.reduce((sum, deal) => sum + (deal.realized_pnl || 0), 0);
  const pendingDeals = merchantDeals.filter((deal) => deal.status === 'pending');

  const p2pAvgs = useMemo(() => {
    const sellTrades = allTrades.filter((trade) => trade.usesStock && trade.sellPriceQAR > 0);
    const avgSell = sellTrades.length ? sellTrades.reduce((sum, trade) => sum + trade.sellPriceQAR, 0) / sellTrades.length : null;
    const batches = state.batches.filter((batch) => batch.buyPriceQAR > 0);
    const avgBuy = batches.length ? batches.reduce((sum, batch) => sum + batch.buyPriceQAR, 0) / batches.length : null;
    return { avgSell, avgBuy };
  }, [allTrades, state.batches]);

  const buySellSpreadPct = wacop && p2pAvgs.avgSell ? ((p2pAvgs.avgSell - wacop) / wacop) * 100 : null;
  const totalPendingItems = pendingApprovals.length + pendingDeals.length;

  const actionTiles = [
    {
      label: 'Review Approvals',
      detail: pendingApprovals.length > 0 ? `${pendingApprovals.length} awaiting action` : 'All clear',
      href: '/approvals',
      icon: ShieldCheck,
    },
    {
      label: 'Merchant Deals',
      detail: `${merchantDeals.length} total · ${pendingDeals.length} pending`,
      href: '/deals',
      icon: Landmark,
    },
    {
      label: 'Live P2P Pricing',
      detail: `Sell ${p2pAvgs.avgSell ? `${fmtP(p2pAvgs.avgSell)} QAR` : '—'} · Buy ${p2pAvgs.avgBuy ? `${fmtP(p2pAvgs.avgBuy)} QAR` : '—'}`,
      href: '/p2p',
      icon: CircleDollarSign,
    },
  ];

  return (
    <div className="app-page-shell" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{rLabel}</p>
          </div>
          {totalPendingItems > 0 && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500">
              {totalPendingItems} pending items
            </span>
          )}
        </div>

        {/* Primary KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Net P&L"
            value={fmtQWithUnit(dR.net)}
            sub={`${dR.count} trades · ${fmtQWithUnit(dR.fee)} fees`}
            positive={dR.net >= 0}
          />
          <KpiCard
            label="Volume"
            value={fmtQWithUnit(dR.rev)}
            sub={rLabel}
          />
          <KpiCard
            label="Avg Margin"
            value={fmtPct(dR.avgMgn)}
            sub={`${fmtPct(avgM)} all-time`}
            positive={dR.avgMgn >= 0}
          />
          <KpiCard
            label="USDT Position"
            value={`${fmtU(stk, 0)} USDT`}
            sub={isLow ? 'Below threshold' : 'Sufficient liquidity'}
            warn={isLow}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="WACOP"
            value={wacop ? `${fmtP(wacop)} QAR` : '—'}
            sub="Weighted avg cost of purchase"
          />
          <KpiCard
            label="Price Spread"
            value={buySellSpreadPct !== null ? `${buySellSpreadPct >= 0 ? '+' : ''}${buySellSpreadPct.toFixed(2)}%` : '—'}
            sub="vs P2P sell average"
            positive={buySellSpreadPct !== null ? buySellSpreadPct >= 0 : undefined}
          />
          <KpiCard
            label="Merchant Exposure"
            value={`$${merchantExposure.toLocaleString()}`}
            sub={`${activeDeals.length} active deals`}
          />
          <KpiCard
            label="Cash Available"
            value={fmtQWithUnit(num(state.cashQAR, 0))}
            sub={state.cashOwner || '—'}
          />
        </div>

        {/* Body */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_300px]">
          <div className="space-y-4">

            {/* Performance table */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Period</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Volume</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Trades</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">USDT</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Net P&L</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Today', kpi: d1 },
                      { label: '7 Days', kpi: d7 },
                      { label: rLabel, kpi: dR },
                    ].map(({ label, kpi }) => (
                      <tr key={label} className="border-b border-border/30 last:border-0 transition-colors hover:bg-muted/20">
                        <td className="px-5 py-3.5 text-sm font-medium text-foreground">{label}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-sm text-foreground">{fmtQWithUnit(kpi.rev)}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-sm text-foreground">{kpi.count}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-sm text-foreground">{fmtU(kpi.qty, 0)}</td>
                        <td className={`px-5 py-3.5 text-right tabular-nums text-sm font-medium ${kpi.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtQWithUnit(kpi.net)}</td>
                        <td className={`px-5 py-3.5 text-right tabular-nums text-sm ${kpi.avgMgn >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtPct(kpi.avgMgn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Position summary */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Position Summary</h2>
              </div>
              <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 divide-border/40">
                {[
                  { label: 'Cost Basis', value: fmtQWithUnit(dR.rev - dR.net - dR.fee) },
                  { label: 'Fees Paid', value: fmtQWithUnit(dR.fee) },
                  { label: 'Net Position', value: fmtQWithUnit(stCost + num(state.cashQAR, 0)) },
                ].map(({ label, value }) => (
                  <div key={label} className="px-5 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Merchant lane */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Merchant Lane</h2>
              </div>
              <div className="divide-y divide-border/40">
                {[
                  {
                    label: t('activeMerchantDeals'),
                    value: `${activeDeals.length}`,
                    sub: `${merchantDeals.length} ${t('totalDealsLabel')}`,
                    colorClass: 'text-foreground',
                  },
                  {
                    label: t('pendingMerchantApprovals'),
                    value: `${pendingApprovals.length}`,
                    sub: pendingApprovals.length > 0 ? t('actionNeeded') : t('allClear'),
                    colorClass: pendingApprovals.length > 0 ? 'text-amber-500' : 'text-foreground',
                  },
                  {
                    label: t('merchantRealizedPnl'),
                    value: `$${merchantPnL.toLocaleString()}`,
                    sub: pendingDeals.length > 0 ? `${pendingDeals.length} pending deals` : t('allClear'),
                    colorClass: merchantPnL >= 0 ? 'text-emerald-500' : 'text-rose-500',
                  },
                ].map(({ label, value, sub, colorClass }) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                    </div>
                    <p className={`text-xl font-semibold tabular-nums ${colorClass}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">

            {/* Quick actions */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              </div>
              <div className="divide-y divide-border/40">
                {actionTiles.map(({ icon: Icon, label, detail, href }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => navigate(href)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">{detail}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>

            {/* P2P market signals */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
              <div className="border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">P2P Market</h2>
              </div>
              <div className="divide-y divide-border/40">
                {[
                  {
                    label: 'Sell Average',
                    sub: t('avgFromTrades'),
                    value: p2pAvgs.avgSell ? `${fmtP(p2pAvgs.avgSell)} QAR` : '—',
                    colorClass: 'text-emerald-500',
                  },
                  {
                    label: 'Buy Average',
                    sub: t('avgFromBatches'),
                    value: p2pAvgs.avgBuy ? `${fmtP(p2pAvgs.avgBuy)} QAR` : '—',
                    colorClass: 'text-rose-500',
                  },
                  {
                    label: 'Carrying Value',
                    sub: `${fmtU(stk, 0)} USDT`,
                    value: fmtQ(stCost),
                    colorClass: 'text-foreground',
                  },
                ].map(({ label, sub, value, colorClass }) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                    </div>
                    <p className={`text-lg font-semibold tabular-nums ${colorClass}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
