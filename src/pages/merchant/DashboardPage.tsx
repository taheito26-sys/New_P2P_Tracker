import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Landmark,
  PackageCheck,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Waves,
} from 'lucide-react';
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
    api.approvals.inbox().then((response) => setPendingApprovals(response.approvals.filter((approval) => approval.status === 'pending'))).catch(() => {});
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

  const controlStats = [
    {
      label: 'Inventory accuracy',
      value: isLow ? 'Watchlist' : 'Stable',
      detail: `${fmtU(stk, 0)} USDT liquid across desks`,
      tone: isLow ? 'text-amber-200 border-amber-400/30 bg-amber-400/10' : 'text-emerald-100 border-emerald-400/30 bg-emerald-400/10',
      icon: Boxes,
    },
    {
      label: 'Process throughput',
      value: `${d7.count} tasks`,
      detail: `${fmtQWithUnit(d7.rev)} processed in 7 days`,
      tone: 'text-sky-100 border-sky-400/30 bg-sky-400/10',
      icon: PackageCheck,
    },
    {
      label: 'Exception queue',
      value: `${totalPendingItems}`,
      detail: pendingApprovals.length > 0 ? `${pendingApprovals.length} approvals need review` : 'No urgent review blockers',
      tone: totalPendingItems > 0 ? 'text-rose-100 border-rose-400/30 bg-rose-400/10' : 'text-violet-100 border-violet-400/30 bg-violet-400/10',
      icon: ShieldCheck,
    },
  ];

  const operationalCards = [
    {
      label: t('netProfitLabel'),
      value: fmtQWithUnit(dR.net),
      caption: `${dR.count} ${t('trades')} · ${fmtQWithUnit(dR.fee)} ${t('fees')}`,
      tone: dR.net >= 0 ? 'text-emerald-400' : 'text-rose-400',
      icon: dR.net >= 0 ? TrendingUp : TrendingDown,
    },
    {
      label: t('avPriceSpread'),
      value: wacop ? `${fmtP(wacop)} QAR` : t('noStock'),
      caption: buySellSpreadPct !== null ? `${buySellSpreadPct >= 0 ? '+' : ''}${buySellSpreadPct.toFixed(2)}% vs P2P sell` : t('sellAboveAvPrice'),
      tone: buySellSpreadPct !== null && buySellSpreadPct < 0 ? 'text-amber-300' : 'text-sky-300',
      icon: Waves,
    },
    {
      label: t('merchantExposure'),
      value: `$${merchantExposure.toLocaleString()}`,
      caption: `${activeDeals.length} ${t('activeDeals')}`,
      tone: 'text-violet-300',
      icon: BriefcaseBusiness,
    },
    {
      label: t('cashAvailable'),
      value: fmtQWithUnit(num(state.cashQAR, 0)),
      caption: `${t('owner')}: ${state.cashOwner || '—'}`,
      tone: 'text-amber-300',
      icon: CreditCard,
    },
  ];

  const actionTiles = [
    {
      label: 'Review approvals',
      detail: pendingApprovals.length > 0 ? `${pendingApprovals.length} awaiting action` : 'All approval lanes are clear',
      href: '/approvals',
      icon: ShieldCheck,
    },
    {
      label: 'Open merchant deals',
      detail: `${merchantDeals.length} total deals · ${pendingDeals.length} pending`,
      href: '/deals',
      icon: Landmark,
    },
    {
      label: 'Inspect live P2P pricing',
      detail: `Sell ${p2pAvgs.avgSell ? `${fmtP(p2pAvgs.avgSell)} QAR` : '—'} · Buy ${p2pAvgs.avgBuy ? `${fmtP(p2pAvgs.avgBuy)} QAR` : '—'}`,
      href: '/p2p',
      icon: CircleDollarSign,
    },
  ];

  return (
    <div className="app-page-shell" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-slate-50 shadow-[0_24px_80px_rgba(15,23,42,0.55)]">
          <div className="grid gap-6 px-5 py-6 md:px-7 xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">
                    Operations control center
                  </span>
                  <div className="space-y-2">
                    <h1 className="max-w-3xl text-2xl font-semibold tracking-tight md:text-4xl">
                      Clean warehouse-inspired visibility for trading, liquidity, and merchant coordination.
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                      Inspired by Epicor&apos;s warehouse dashboard language: emphasize inventory control, step-by-step workflow clarity,
                      and fast exception handling for the teams running your P2P operation.
                    </p>
                  </div>
                </div>
                <div className="grid min-w-[220px] gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Live range</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{rLabel}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <p className="text-slate-400">{t('tradingVolume')}</p>
                      <p className="mt-1 font-semibold text-white">{fmtQWithUnit(dR.rev)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                      <p className="text-slate-400">{t('trades')}</p>
                      <p className="mt-1 font-semibold text-white">{dR.count}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {controlStats.map(({ icon: Icon, label, value, detail, tone }) => (
                  <div key={label} className={`rounded-3xl border p-4 ${tone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-white/70">{label}</p>
                        <p className="mt-2 text-xl font-semibold text-white">{value}</p>
                      </div>
                      <span className="rounded-2xl border border-white/10 bg-white/10 p-2 text-white">
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-white/80">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Shift performance</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Daily and weekly throughput</h2>
                </div>
                <Clock3 className="h-5 w-5 text-slate-300" />
              </div>
              <div className="mt-5 space-y-4">
                {[
                  { label: t('oneDay'), value: fmtQWithUnit(d1.rev), sub: `${d1.count} ${t('trades')} · ${fmtU(d1.qty, 0)} USDT` },
                  { label: t('sevenDays'), value: fmtQWithUnit(d7.rev), sub: `${d7.count} ${t('trades')} · ${fmtU(d7.qty, 0)} USDT` },
                ].map((row) => (
                  <div key={row.label} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{row.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{row.value}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-slate-500" />
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{row.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {operationalCards.map(({ icon: Icon, label, value, caption, tone }) => (
                <article key={label} className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                      <p className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</p>
                    </div>
                    <span className="rounded-2xl bg-secondary p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{caption}</p>
                </article>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Period stats</p>
                    <h2 className="mt-1 text-xl font-semibold text-foreground">Operational summary for {rLabel}</h2>
                  </div>
                  <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">Warehouse-style KPI tape</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Volume', fmtQWithUnit(dR.rev)],
                    ['Cost basis', fmtQWithUnit(dR.rev - dR.net - dR.fee)],
                    [t('fees'), fmtQWithUnit(dR.fee)],
                    [t('avgMargin'), fmtPct(dR.avgMgn)],
                    [t('availableUsdt'), fmtU(stk, 0)],
                    ['Net position', fmtQWithUnit(stCost + num(state.cashQAR, 0))],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-secondary/60 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Merchant lane</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Deal desk readiness</h2>
                <div className="mt-5 space-y-3">
                  {[
                    { label: t('activeMerchantDeals'), value: `${activeDeals.length}`, sub: `${merchantDeals.length} ${t('totalDealsLabel')}` },
                    { label: t('pendingMerchantApprovals'), value: `${pendingApprovals.length}`, sub: pendingApprovals.length > 0 ? t('actionNeeded') : t('allClear') },
                    { label: t('merchantRealizedPnl'), value: `$${merchantPnL.toLocaleString()}`, sub: pendingDeals.length > 0 ? `${pendingDeals.length} pending deals` : t('allClear') },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-lg font-semibold text-foreground">{item.value}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.sub}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>

          <aside className="space-y-4">
            <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Recommended actions</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Next best workflows</h2>
              <div className="mt-5 space-y-3">
                {actionTiles.map(({ icon: Icon, label, detail, href }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => navigate(href)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-2xl bg-secondary p-2 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Signals</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Supply, cash, and market posture</h2>
              <div className="mt-5 space-y-4 text-sm text-muted-foreground">
                <div className="rounded-2xl bg-secondary/60 p-4">
                  <p className="font-medium text-foreground">P2P sell average</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-500">{p2pAvgs.avgSell ? `${fmtP(p2pAvgs.avgSell)} QAR` : '—'}</p>
                  <p className="mt-2">{t('avgFromTrades')}</p>
                </div>
                <div className="rounded-2xl bg-secondary/60 p-4">
                  <p className="font-medium text-foreground">P2P buy average</p>
                  <p className="mt-2 text-2xl font-semibold text-rose-500">{p2pAvgs.avgBuy ? `${fmtP(p2pAvgs.avgBuy)} QAR` : '—'}</p>
                  <p className="mt-2">{t('avgFromBatches')}</p>
                </div>
                <div className="rounded-2xl bg-secondary/60 p-4">
                  <p className="font-medium text-foreground">Stock carrying value</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{fmtQ(stCost)}</p>
                  <p className="mt-2">{t('stock')} + {t('cash')} alignment for same-day settlement.</p>
                </div>
              </div>
            </article>
          </aside>
        </section>
      </div>
    </div>
  );
}
