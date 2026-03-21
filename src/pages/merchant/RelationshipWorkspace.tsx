import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { createTrackerState } from '@/lib/tracker-demo-data';
import { useTheme } from '@/lib/theme-context';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DEAL_TYPE_CONFIGS, calculateOutstanding } from '@/lib/deal-engine';
import { normalizeDealStatus } from '@/lib/merchant-deal-status';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import {
  Loader2, Send, Users, Briefcase, DollarSign, CheckSquare,
  Plus, ArrowLeft, Check, X, AlertTriangle, Clock, MessageCircle,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantRelationship, MerchantMessage, MerchantDeal, MerchantApproval } from '@/types/domain';

export default function RelationshipWorkspace() {
  return <RelationshipWorkspaceCore />;
}

/* ─── Helpers ─── */
function dealStatusStyle(status: string) {
  switch (status) {
    case 'approved': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30';
    case 'pending': return 'bg-amber-500/10 text-amber-600 border border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border border-border';
  }
}

/* ═══════════════════════════════════════════════════════════
   RELATIONSHIP WORKSPACE — Flat, deals-centric
   No tabs. Deals table = main content. Approvals = alert bars.
   Chat = collapsible bottom drawer (rare usage).
   ═══════════════════════════════════════════════════════════ */
function RelationshipWorkspaceCore() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const { settings } = useTheme();
  const navigate = useNavigate();
  const t = useT();

  const sharedData = useMemo(() => createTrackerState({
    lowStockThreshold: settings.lowStockThreshold,
    priceAlertThreshold: settings.priceAlertThreshold,
    range: settings.range,
    currency: settings.currency,
  }).state, [settings.lowStockThreshold, settings.priceAlertThreshold, settings.range, settings.currency]);
  const [trackerState, setTrackerState] = useState(sharedData);
  const sharedCustomers = trackerState.customers;
  const sharedSuppliers = useMemo(() => {
    const names = trackerState.batches.map(b => b.source.trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [trackerState.batches]);

  const [rel, setRel] = useState<MerchantRelationship | null>(null);
  const [msgs, setMsgs] = useState<MerchantMessage[]>([]);
  const [relDeals, setRelDeals] = useState<MerchantDeal[]>([]);
  const [relApprovals, setRelApprovals] = useState<MerchantApproval[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settlementSubmitLock = useRef(false);

  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settleDealId, setSettleDealId] = useState('');
  const [settlementForm, setSettlementForm] = useState({ amount: '', profit: '', period_key: '', note: '' });
  const [submittingSettlement, setSubmittingSettlement] = useState(false);
  const [rejectDealOpen, setRejectDealOpen] = useState(false);
  const [rejectDealId, setRejectDealId] = useState('');
  const [rejectDealData, setRejectDealData] = useState<MerchantDeal | null>(null);
  const [rejectForm, setRejectForm] = useState({ suggested_share_pct: '', suggested_amount: '', note: '' });
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<'loading' | 'retrying' | 'ready' | 'not_found' | 'forbidden' | 'error'>('loading');

  const reload = useCallback(async () => {
    if (!id) return;
    console.info('[RelationshipWorkspace] workspace fetch start', { relationshipId: id });
    setLoading(true);
    setLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));

    const startedAt = Date.now();
    const retryWindowMs = 2000;

    while (Date.now() - startedAt < retryWindowMs) {
      try {
        const { relationship } = await api.relationships.get(id);
        setRel(relationship);

        const [messagesRes, dealsRes, approvalsInboxRes, approvalsSentRes] = await Promise.allSettled([
          api.messages.list(id),
          api.deals.list(id),
          api.approvals.inbox(),
          api.approvals.sent(),
        ]);

        if (messagesRes.status === 'fulfilled') {
          const unreadIncoming = messagesRes.value.messages.filter(m => !m.is_read && m.sender_user_id !== userId);
          if (unreadIncoming.length > 0) {
            await Promise.all(unreadIncoming.map((message) => api.messages.markRead(message.id)));
            const refreshedMessages = await api.messages.list(id);
            setMsgs(refreshedMessages.messages);
          } else {
            setMsgs(messagesRes.value.messages);
          }
        } else {
          console.error('[RelationshipWorkspace] messages fetch failed', { relationshipId: id, error: messagesRes.reason });
          setMsgs([]);
        }

        if (dealsRes.status === 'fulfilled') {
          setRelDeals(dealsRes.value.deals);
        } else {
          console.error('[RelationshipWorkspace] deals fetch failed', { relationshipId: id, error: dealsRes.reason });
          setRelDeals([]);
        }

        const approvalsInbox = approvalsInboxRes.status === 'fulfilled' ? approvalsInboxRes.value.approvals : [];
        const approvalsSent = approvalsSentRes.status === 'fulfilled' ? approvalsSentRes.value.approvals : [];
        if (approvalsInboxRes.status === 'rejected') {
          console.error('[RelationshipWorkspace] approvals inbox fetch failed', { relationshipId: id, error: approvalsInboxRes.reason });
        }
        if (approvalsSentRes.status === 'rejected') {
          console.error('[RelationshipWorkspace] approvals sent fetch failed', { relationshipId: id, error: approvalsSentRes.reason });
        }
        setRelApprovals([...approvalsInbox, ...approvalsSent].filter(a => a.relationship_id === id));

        setLoadState('ready');
        setLoading(false);
        return;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.status === 404) {
            console.warn('[RelationshipWorkspace] relationship lookup returned 404, retrying briefly', { relationshipId: id, status: err.status });
            setLoadState('retrying');
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            continue;
          }

          if (err.status === 401 || err.status === 403) {
            console.error('[RelationshipWorkspace] workspace fetch forbidden', { relationshipId: id, status: err.status, error: err.message });
            setLoadState('forbidden');
            setLoading(false);
            return;
          }
        }

        console.error('[RelationshipWorkspace] workspace fetch failed', { relationshipId: id, error: err });
        setLoadState('error');
        setLoading(false);
        toast.error(t('failedLoadWorkspace'));
        return;
      }
    }

    console.warn('[RelationshipWorkspace] relationship could not be opened after retry window', { relationshipId: id });
    setLoadState('not_found');
    setLoading(false);
  }, [id, t, userId]);

  useEffect(() => { reload(); }, [reload]);
  useRealtimeRefresh(reload, ['new_message', 'approval_update', 'deal_update']);
  useEffect(() => { if (chatOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, chatOpen]);

  /* ─── Handlers ─── */
  const sendMsg = async () => {
    if (!msgInput.trim() || !id) return;
    try { await api.messages.send(id, msgInput.trim()); setMsgInput(''); await reload(); }
    catch (err: any) { toast.error(err.message); }
  };

  const handleAcceptDeal = async (dealId: string) => {
    try { await api.deals.update(dealId, { status: 'approved' }); toast.success('Deal approved'); await reload(); }
    catch (err: any) { toast.error(err.message); }
  };

  const openRejectDeal = (deal: MerchantDeal) => {
    setRejectDealId(deal.id); setRejectDealData(deal);
    setRejectForm({ suggested_share_pct: deal.metadata?.counterparty_share_pct ? String(deal.metadata.counterparty_share_pct) : '', suggested_amount: String(deal.amount || ''), note: '' });
    setRejectDealOpen(true);
  };

  const handleRejectDeal = async () => {
    try {
      const note = [rejectForm.note, rejectForm.suggested_amount ? `Suggested amount: $${rejectForm.suggested_amount}` : '', rejectForm.suggested_share_pct ? `Suggested profit share: ${rejectForm.suggested_share_pct}%` : ''].filter(Boolean).join(' | ');
      if (id && note) await api.messages.send(id, `⚠️ Deal feedback:\n${note}`, 'system');
      toast.success('Counter-proposal sent');
      setRejectDealOpen(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const openSettlement = (dealId: string) => {
    setSettleDealId(dealId);
    setSettlementForm({ amount: '', profit: '', period_key: new Date().toISOString().substring(0, 7), note: '' });
    settlementSubmitLock.current = false;
    setSubmittingSettlement(false);
    setSettlementOpen(true);
  };

  const settlingDeal = relDeals.find(d => d.id === settleDealId);
  const isPartnershipSettle = settlingDeal?.deal_type === 'partnership';
  const parsedSettlementAmount = Number.parseFloat(settlementForm.amount);
  const parsedProfitAmount = Number.parseFloat(settlementForm.profit);
  const canSubmitSettlement = isPartnershipSettle
    ? parsedProfitAmount > 0
    : parsedSettlementAmount > 0;

  const handleSubmitSettlement = async () => {
    if (!canSubmitSettlement || submittingSettlement || settlementSubmitLock.current) {
      if (!submittingSettlement && !settlementSubmitLock.current) {
        toast.error(isPartnershipSettle ? 'Enter a positive profit amount before submitting.' : 'Enter a positive settlement amount before submitting.');
      }
      return;
    }
    settlementSubmitLock.current = true;
    setSubmittingSettlement(true);
    try {
      const settleAmount = isPartnershipSettle ? 0 : parsedSettlementAmount;
      await api.deals.submitSettlement(settleDealId, { amount: settleAmount, note: settlementForm.note });
      if (parsedProfitAmount > 0) {
        await api.deals.recordProfit(settleDealId, { amount: parsedProfitAmount, period_key: settlementForm.period_key, note: settlementForm.note });
      }
      await api.deals.close(settleDealId, { note: isPartnershipSettle ? 'Profit-share deal closed — capital retained by merchant' : 'Auto-closed on settlement submission' });
      toast.success('Settlement submitted — deal will close once approved');
      setSettlementOpen(false);
      await reload();
    } catch (err: any) { toast.error(err.message); }
    finally {
      settlementSubmitLock.current = false;
      setSubmittingSettlement(false);
    }
  };

  const handleApprove = async (approvalId: string) => {
    try { await api.approvals.approve(approvalId); toast.success(t('approvedMutation')); await reload(); }
    catch (err: any) { toast.error(err.message); }
  };
  const handleReject = async (approvalId: string) => {
    try { await api.approvals.reject(approvalId); toast.success(t('rejectedNoMutation')); await reload(); }
    catch (err: any) { toast.error(err.message); }
  };

  if (loading || loadState === 'retrying') {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t('loading') || 'Loading'}</p>
          <p className="text-xs text-muted-foreground">{loadState === 'retrying' ? 'Retrying workspace lookup…' : 'Loading workspace data…'}</p>
        </div>
      </div>
    );
  }
  if (loadState === 'forbidden') return <div className="p-6 text-center text-muted-foreground">You do not have access to this relationship workspace.</div>;
  if (loadState === 'not_found') return <div className="p-6 text-center text-muted-foreground">This relationship could not be opened.</div>;
  if (loadState === 'error' || !rel) return <div className="p-6 text-center text-muted-foreground">{t('relationshipNotFound')}</div>;

  const pendingApprovals = relApprovals.filter(a => a.status === 'pending');
  const unreadMsgs = msgs.filter(m => !m.is_read && m.sender_user_id !== userId);
  const activeDeals = relDeals.filter(d => d.status === 'approved');
  const counterpartyName = rel.counterparty?.display_name || t('workspace');

  const exposure = rel.summary?.activeExposure || 0;
  const realizedPnl = rel.summary?.realizedProfit || 0;

  return (
    <div dir={t.isRTL ? 'rtl' : 'ltr'} className="mx-1 my-1 flex min-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-border/50 bg-card md:h-[calc(100vh-3.5rem)]">

      {/* ─── HEADER ─── */}
      <div className="shrink-0 flex flex-wrap items-start gap-2.5 border-b border-border bg-card px-3 py-3 sm:px-4 md:min-h-[52px] md:items-center md:py-2">
        <button onClick={() => navigate('/network')} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center text-[14px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
          {counterpartyName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-medium">{counterpartyName}</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
              rel.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' :
              rel.status === 'restricted' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30' :
              'bg-muted text-muted-foreground border border-border'
            }`}>{rel.status}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{rel.my_role} · {rel.counterparty?.merchant_id} · Since {new Date(rel.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex-1" />

        {/* Chat toggle */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`order-3 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors relative md:order-none ${
            chatOpen ? 'bg-blue-500/10 border-blue-500/30 text-blue-600' : 'border-border text-muted-foreground hover:bg-secondary'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Messages
          {unreadMsgs.length > 0 && !chatOpen && (
            <div className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-blue-500 text-white text-[9px] font-medium flex items-center justify-center px-0.5">
              {unreadMsgs.length}
            </div>
          )}
          {chatOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        {/* New deal */}
        <button
          onClick={() => setCreateDealOpen(true)}
          className="order-4 flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90 md:order-none"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newDeal')}
        </button>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="shrink-0 grid grid-cols-2 gap-2 border-b border-border px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:px-4">
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">{t('activeDeals')}</p>
          <p className="text-xl font-medium leading-tight mt-0.5">{activeDeals.length}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">{t('activeExposure')}</p>
          <p className="text-xl font-medium leading-tight mt-0.5 font-mono">${exposure.toLocaleString()}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">{t('realizedProfit')}</p>
          <p className={`text-xl font-medium leading-tight mt-0.5 font-mono ${realizedPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toLocaleString()}
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">{t('pendingApprovalsLabel')}</p>
          <p className="text-xl font-medium leading-tight mt-0.5">{pendingApprovals.length}</p>
        </div>
      </div>

      {/* ─── APPROVAL ALERT BARS (only when pending) ─── */}
      {pendingApprovals.map(a => {
        const linkedDeal = a.target_entity_type === 'deal' ? relDeals.find(d => d.id === a.target_entity_id) : null;
        const payload = a.proposed_payload || {};
        return (
          <div key={a.id} className="shrink-0 flex flex-wrap items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] lg:px-4">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium capitalize">{a.type.replace(/_/g, ' ')}</span>
              {linkedDeal && <span className="text-muted-foreground"> — {linkedDeal.title || DEAL_TYPE_CONFIGS[linkedDeal.deal_type]?.label}</span>}
              {payload.amount && <span className="text-muted-foreground"> · ${Number(payload.amount).toLocaleString()}</span>}
            </span>
            {a.reviewer_user_id === userId && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => handleApprove(a.id)} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1"><Check className="w-3 h-3" /> {t('approve')}</button>
                <button onClick={() => handleReject(a.id)} className="px-2 py-1 rounded-md text-red-500 hover:bg-red-500/10 transition-colors"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        );
      })}

      {/* ─── DEALS TABLE (main content, full width) ─── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {relDeals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('noDealsYet')}</p>
            <button onClick={() => setCreateDealOpen(true)} className="mt-3 text-[12px] font-medium text-blue-600 hover:underline">Create your first deal</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-secondary sticky top-0 z-[1]">
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Deal</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dates</th>
                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {relDeals.map(deal => {
                const cfg = DEAL_TYPE_CONFIGS[deal.deal_type];
                const net = deal.realized_pnl ?? 0;
                const outstandingVal = calculateOutstanding(deal);
                return (
                  <tr key={deal.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors relative">

                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 ${
                          deal.status === 'approved' ? 'bg-emerald-500/10' : 'bg-secondary'
                        }`}>{cfg?.icon || '📋'}</div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{cfg?.label || deal.deal_type}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{deal.title || deal.id.slice(0, 12)}</p>
                          {(deal.metadata?.customer_name || deal.metadata?.supplier_name) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {deal.metadata?.customer_name && <span>👤 {String(deal.metadata.customer_name)}</span>}
                              {deal.metadata?.customer_name && deal.metadata?.supplier_name && <span> · </span>}
                              {deal.metadata?.supplier_name && <span>📦 {String(deal.metadata.supplier_name)}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${dealStatusStyle(normalizeDealStatus(deal.status))}`}>{normalizeDealStatus(deal.status)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                      {deal.issue_date}{deal.due_date ? ` → ${deal.due_date}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <p className="font-mono font-medium">${deal.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{deal.currency}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {net !== 0 ? (
                        <span className={net >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                          {net >= 0 ? '+' : ''}${net.toLocaleString()}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        {deal.status === 'pending' && (
                          <>
                            <button onClick={() => handleAcceptDeal(deal.id)} className="px-2 py-1 rounded-md text-[11px] font-medium border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 transition-colors flex items-center gap-1"><Check className="w-3 h-3" /> Approve</button>
                            <button onClick={() => openRejectDeal(deal)} className="px-2 py-1 rounded-md text-[11px] border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-colors"><MessageCircle className="w-3 h-3" /></button>
                          </>
                        )}
                        {deal.status === 'approved' && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => openSettlement(deal.id)} className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 transition-colors flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" /> {t('settle')}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[200px] text-xs">Return capital, record profit, submit for approval.</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ─── CHAT DRAWER (collapsible) ─── */}
      {chatOpen && (
        <div className="shrink-0 border-t border-border flex flex-col" style={{ height: 240 }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary">
            <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[12px] font-medium">Messages</span>
            {unreadMsgs.length > 0 && <span className="text-[11px] text-blue-600">· {unreadMsgs.length} unread</span>}
            <div className="flex-1" />
            <button onClick={() => setChatOpen(false)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-card transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1.5">
            {msgs.length === 0 && <p className="text-center text-muted-foreground text-xs py-4">{t('noMessagesYet')}</p>}
            {msgs.map(msg => {
              const isOwn = msg.sender_user_id === userId;
              const isSystem = msg.message_type === 'system';
              return (
                <div key={msg.id} className={`flex ${isSystem ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[72%] px-3 py-1.5 text-[12px] leading-[1.5] ${
                    isSystem ? 'bg-secondary text-muted-foreground text-center text-[11px] italic rounded-md max-w-full'
                    : isOwn ? 'bg-foreground text-background rounded-[12px_12px_3px_12px]'
                    : 'bg-secondary rounded-[12px_12px_12px_3px]'
                  }`}>
                    {!isSystem && !isOwn && <p className="text-[10px] text-muted-foreground mb-0.5">{msg.sender_name || msg.sender_merchant_id}</p>}
                    <p>{msg.body}</p>
                    <p className={`text-[9px] mt-0.5 ${isOwn ? 'opacity-40' : 'text-muted-foreground'}`}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <div className="flex-1 flex items-center px-3 h-8 rounded-full bg-secondary text-[12px]">
              <input placeholder={t('typeMessage')} value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()}
                className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground text-[12px]" />
            </div>
            <button onClick={sendMsg} className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center shrink-0"><Send className="w-3 h-3" /></button>
          </div>
        </div>
      )}

      {/* ─── DIALOGS (unchanged logic) ─── */}
      <CreateDealDialog open={createDealOpen} onOpenChange={setCreateDealOpen} relationshipId={id!} counterpartyName={counterpartyName} onCreated={reload} customers={sharedCustomers} suppliers={sharedSuppliers} trackerState={trackerState} onStateChange={setTrackerState} />

      <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle & Close Deal</DialogTitle>
            <DialogDescription>
              Submit the capital return and profit. Once the counterparty approves, the deal closes automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isPartnershipSettle ? (
              <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 text-xs text-blue-700 dark:text-blue-400">
                Capital stays with the merchant. Only the profit earned is submitted for settlement.
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{t('amountUsdtLabel')} *</Label>
                <Input type="number" placeholder="8000" value={settlementForm.amount} onChange={e => setSettlementForm(f => ({ ...f, amount: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Capital amount being returned</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Profit Earned</Label><Input type="number" placeholder="900" value={settlementForm.profit} onChange={e => setSettlementForm(f => ({ ...f, profit: e.target.value }))} /></div>
              <div className="space-y-2"><Label>{t('period')}</Label><Input type="month" value={settlementForm.period_key} onChange={e => setSettlementForm(f => ({ ...f, period_key: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>{t('noteOptional')}</Label><Textarea placeholder="Settlement note..." value={settlementForm.note} onChange={e => setSettlementForm(f => ({ ...f, note: e.target.value }))} rows={2} /></div>
            <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>This will submit the settlement, record profit, and request deal closure.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlementOpen(false)} disabled={submittingSettlement}>{t('cancel')}</Button>
            <Button onClick={handleSubmitSettlement} disabled={submittingSettlement || !canSubmitSettlement}>
              {submittingSettlement ? 'Submitting...' : t('submitForApproval')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDealOpen} onOpenChange={setRejectDealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><X className="w-4 h-4 text-red-500" /> Reject Deal</DialogTitle>
            <DialogDescription>
              Send feedback and propose revised terms without forcing the deal into a hidden legacy status.
            </DialogDescription>
          </DialogHeader>
          {rejectDealData && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted/50 border border-border p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Terms</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Type:</span> <span className="capitalize">{rejectDealData.deal_type?.replace(/_/g, ' ')}</span></div>
                  <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono">${rejectDealData.amount?.toLocaleString()}</span></div>
                  {rejectDealData.metadata?.counterparty_share_pct && <div><span className="text-muted-foreground">Share:</span> {String(rejectDealData.metadata.counterparty_share_pct)}%</div>}
                </div>
              </div>
              <div className="space-y-2"><Label>Suggested Amount ($)</Label><Input type="number" placeholder={String(rejectDealData.amount || '')} value={rejectForm.suggested_amount} onChange={e => setRejectForm(f => ({ ...f, suggested_amount: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Suggested Profit Share (%)</Label><Input type="number" min="0" max="100" value={rejectForm.suggested_share_pct} onChange={e => setRejectForm(f => ({ ...f, suggested_share_pct: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Reason</Label><Textarea placeholder="Why are you rejecting?" value={rejectForm.note} onChange={e => setRejectForm(f => ({ ...f, note: e.target.value }))} rows={3} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDealOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectDeal}>Reject & Send Proposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
