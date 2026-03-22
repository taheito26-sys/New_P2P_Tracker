import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DEAL_TYPE_CONFIGS, calculateOutstanding } from '@/lib/deal-engine';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import { ArrowLeft, AlertTriangle, Check, Clock3, DollarSign, Loader2, MessageCircle, Plus, Send, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantApproval, MerchantDeal, MerchantMessage, MerchantRelationship } from '@/types/domain';
import type { TrackerState } from '@/lib/tracker-helpers';

type RelationshipWorkspaceProps = {
  relationshipId?: string;
  embedded?: boolean;
};

type RejectProposalState = {
  approvalId: string;
  deal: MerchantDeal;
};

function dealStatusStyle(status: string) {
  switch (status) {
    case 'approved': return 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30';
    case 'pending': return 'bg-amber-500/10 text-amber-700 border border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border border-border';
  }
}

function extractDealRatio(deal: MerchantDeal) {
  const meta = deal.metadata || {};
  const partnerPct = Number(meta.partner_ratio ?? meta.counterparty_share_pct ?? meta.pool_owner_share_pct ?? NaN);
  const merchantPct = Number(meta.merchant_ratio ?? meta.merchant_share_pct ?? (Number.isFinite(partnerPct) ? 100 - partnerPct : NaN));
  if (!Number.isFinite(partnerPct)) return null;
  return {
    partnerPct,
    merchantPct: Number.isFinite(merchantPct) ? merchantPct : null,
  };
}

function extractDealPrice(deal: MerchantDeal) {
  const raw = deal.metadata?.unit_price ?? deal.metadata?.price ?? deal.metadata?.sell_price ?? deal.metadata?.quoted_price;
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function extractDealBuyer(deal: MerchantDeal) {
  const raw = deal.metadata?.customer_name ?? deal.metadata?.buyer_name ?? deal.metadata?.buyer;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function extractDealMargin(deal: MerchantDeal) {
  const raw = deal.metadata?.margin_pct ?? deal.metadata?.margin ?? deal.metadata?.spread_pct;
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isFinite(numeric)) return numeric;
  if (deal.expected_return != null && deal.amount > 0) return (deal.expected_return / deal.amount) * 100;
  return null;
}

function formatDealRatioLabel(deal: MerchantDeal) {
  const ratio = extractDealRatio(deal);
  if (!ratio) return 'Not set';
  return `${ratio.partnerPct}% / ${ratio.merchantPct ?? '—'}%`;
}

function formatDealDirection(deal: MerchantDeal, userId: string) {
  return deal.created_by === userId ? 'Outgoing' : 'Incoming';
}

function formatCurrencyValue(value: number | null | undefined, currency = '$') {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Not set';
  return `${currency}${value.toLocaleString()}`;
}

function formatDealDate(deal: MerchantDeal, fallbackDate?: string) {
  const raw = deal.issue_date || fallbackDate || deal.created_at;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? raw : value.toLocaleDateString();
}

function approvalSummaryLabel(approval: { type: string }) {
  if (approval.type === 'deal_create') return 'New deal awaiting your decision';
  if (approval.type === 'deal_close') return 'Deal close request';
  return approval.type.replace(/_/g, ' ');
}

export default function RelationshipWorkspace(props: RelationshipWorkspaceProps) {
  const params = useParams<{ id: string }>();
  return <RelationshipWorkspaceCore relationshipId={props.relationshipId ?? params.id} embedded={props.embedded ?? Boolean(props.relationshipId)} />;
}

export function RelationshipWorkspaceCore({ relationshipId, embedded = false }: Required<RelationshipWorkspaceProps>) {
  const { userId } = useAuth();
  const { settings } = useTheme();
  const navigate = useNavigate();
  const t = useT();

  const sharedData = useMemo<TrackerState>(() => ({
    currency: settings.currency,
    range: settings.range,
    batches: [],
    trades: [],
    customers: [],
    cashQAR: 0,
    cashOwner: 'merchant',
    settings: {
      lowStockThreshold: settings.lowStockThreshold,
      priceAlertThreshold: settings.priceAlertThreshold,
    },
    cal: {
      year: new Date().getUTCFullYear(),
      month: new Date().getUTCMonth(),
      selectedDay: null,
    },
  }), [settings.currency, settings.lowStockThreshold, settings.priceAlertThreshold, settings.range]);
  const [trackerState, setTrackerState] = useState(sharedData);
  const sharedCustomers = trackerState.customers;
  const sharedSuppliers = useMemo(() => {
    const names = trackerState.batches.map((batch) => batch.source.trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [trackerState.batches]);

  const [rel, setRel] = useState<MerchantRelationship | null>(null);
  const [msgs, setMsgs] = useState<MerchantMessage[]>([]);
  const [relDeals, setRelDeals] = useState<MerchantDeal[]>([]);
  const [relApprovals, setRelApprovals] = useState<MerchantApproval[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settleDealId, setSettleDealId] = useState('');
  const [settlementForm, setSettlementForm] = useState({ amount: '', profit: '', period_key: '', note: '' });
  const [submittingSettlement, setSubmittingSettlement] = useState(false);
  const [rejectProposal, setRejectProposal] = useState<RejectProposalState | null>(null);
  const [rejectForm, setRejectForm] = useState({ proposed_ratio: '', proposed_amount: '', note: '' });
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<'loading' | 'retrying' | 'ready' | 'not_found' | 'forbidden' | 'error'>('loading');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));

    const startedAt = Date.now();
    while (Date.now() - startedAt < 2000) {
      try {
        const { relationship } = await api.relationships.get(relationshipId);
        setRel(relationship);

        const [messagesRes, dealsRes, approvalsInboxRes, approvalsSentRes] = await Promise.allSettled([
          api.messages.list(relationshipId),
          api.deals.list(relationshipId),
          api.approvals.inbox(),
          api.approvals.sent(),
        ]);

        if (messagesRes.status === 'fulfilled') {
          const unreadIncoming = messagesRes.value.messages.filter((message) => !message.is_read && message.sender_user_id !== userId);
          if (unreadIncoming.length > 0) {
            await Promise.all(unreadIncoming.map((message) => api.messages.markRead(message.id)));
            const refreshed = await api.messages.list(relationshipId);
            setMsgs(refreshed.messages);
          } else {
            setMsgs(messagesRes.value.messages);
          }
        } else {
          setMsgs([]);
        }

        setRelDeals(dealsRes.status === 'fulfilled' ? dealsRes.value.deals : []);
        const approvalsInbox = approvalsInboxRes.status === 'fulfilled' ? approvalsInboxRes.value.approvals : [];
        const approvalsSent = approvalsSentRes.status === 'fulfilled' ? approvalsSentRes.value.approvals : [];
        setRelApprovals([...approvalsInbox, ...approvalsSent].filter((approval) => approval.relationship_id === relationshipId));

        setLoadState('ready');
        setLoading(false);
        return;
      } catch (err) {
        if (err instanceof api.ApiError) {
          if (err.status === 404) {
            setLoadState('retrying');
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            continue;
          }
          if (err.status === 401 || err.status === 403) {
            setLoadState('forbidden');
            setLoading(false);
            return;
          }
        }

        setLoadState('error');
        setLoading(false);
        toast.error(t('failedLoadWorkspace'));
        return;
      }
    }

    setLoadState('not_found');
    setLoading(false);
  }, [relationshipId, t, userId]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtimeRefresh(reload, ['new_message', 'approval_update', 'deal_update']);
  useEffect(() => {
    const node = messagesEndRef.current;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgs]);

  const pendingIncomingApprovals = useMemo(
    () => relApprovals.filter((approval) => approval.status === 'pending' && approval.reviewer_user_id === userId),
    [relApprovals, userId],
  );
  const pendingOutgoingApprovals = useMemo(
    () => relApprovals.filter((approval) => approval.status === 'pending' && approval.submitted_by_user_id === userId && approval.reviewer_user_id !== userId),
    [relApprovals, userId],
  );
  const approvalByDealId = useMemo(() => {
    const map = new Map<string, MerchantApproval>();
    pendingIncomingApprovals.forEach((approval) => {
      if (approval.target_entity_type === 'deal') map.set(approval.target_entity_id, approval);
    });
    return map;
  }, [pendingIncomingApprovals]);
  const outgoingApprovalByDealId = useMemo(() => {
    const map = new Map<string, MerchantApproval>();
    pendingOutgoingApprovals.forEach((approval) => {
      if (approval.target_entity_type === 'deal') map.set(approval.target_entity_id, approval);
    });
    return map;
  }, [pendingOutgoingApprovals]);

  const sendMsg = async () => {
    if (!relationshipId || !msgInput.trim()) return;
    try {
      await api.messages.send(relationshipId, msgInput.trim());
      setMsgInput('');
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleApproveApproval = async (approvalId: string) => {
    try {
      await api.approvals.approve(approvalId);
      toast.success(t('approved'));
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRejectApproval = async (approvalId: string, note?: string) => {
    try {
      await api.approvals.reject(approvalId, note);
      toast.success(t('rejected'));
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openRejectProposal = (approvalId: string, deal: MerchantDeal) => {
    const ratio = extractDealRatio(deal);
    setRejectProposal({ approvalId, deal });
    setRejectForm({
      proposed_ratio: ratio?.partnerPct != null ? String(ratio.partnerPct) : '',
      proposed_amount: String(deal.amount || ''),
      note: '',
    });
  };

  const submitRejectProposal = async () => {
    if (!relationshipId || !rejectProposal) return;
    const note = rejectForm.note.trim();
    const proposedRatio = Number(rejectForm.proposed_ratio);
    const proposedAmount = Number(rejectForm.proposed_amount);
    const parts = [
      note,
      Number.isFinite(proposedRatio) ? `Requested ratio: ${proposedRatio}%` : '',
      Number.isFinite(proposedAmount) ? `Requested amount: ${proposedAmount}` : '',
    ].filter(Boolean);

    try {
      await api.messages.send(
        relationshipId,
        `Counter-proposal for ${rejectProposal.deal.title || rejectProposal.deal.id}: ${parts.join(' · ') || 'Please review revised terms.'}`,
        'system',
        {
          kind: 'ratio_change_request',
          approval_id: rejectProposal.approvalId,
          deal_id: rejectProposal.deal.id,
          proposed_ratio: Number.isFinite(proposedRatio) ? proposedRatio : null,
          proposed_amount: Number.isFinite(proposedAmount) ? proposedAmount : null,
          note,
        },
      );
      await api.approvals.reject(rejectProposal.approvalId, parts.join(' | ') || 'Counter-proposal sent');
      toast.success('Deal rejected with revised ratio request');
      setRejectProposal(null);
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openSettlement = (dealId: string) => {
    setSettleDealId(dealId);
    setSettlementForm({ amount: '', profit: '', period_key: new Date().toISOString().slice(0, 7), note: '' });
    setSettlementOpen(true);
  };

  const settlingDeal = relDeals.find((deal) => deal.id === settleDealId);
  const isPartnershipSettle = settlingDeal?.deal_type === 'partnership';
  const parsedSettlementAmount = Number.parseFloat(settlementForm.amount);
  const parsedProfitAmount = Number.parseFloat(settlementForm.profit);
  const canSubmitSettlement = isPartnershipSettle ? parsedProfitAmount > 0 : parsedSettlementAmount > 0;

  const handleSubmitSettlement = async () => {
    if (!canSubmitSettlement) return;
    setSubmittingSettlement(true);
    try {
      const settleAmount = isPartnershipSettle ? 0 : parsedSettlementAmount;
      await api.deals.submitSettlement(settleDealId, { amount: settleAmount, note: settlementForm.note });
      if (parsedProfitAmount > 0) {
        await api.deals.recordProfit(settleDealId, { amount: parsedProfitAmount, period_key: settlementForm.period_key, note: settlementForm.note });
      }
      await api.deals.close(settleDealId, { note: isPartnershipSettle ? 'Profit-share settlement submitted' : 'Settlement submitted' });
      toast.success('Settlement submitted');
      setSettlementOpen(false);
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingSettlement(false);
    }
  };

  if (loading || loadState === 'retrying') {
    return (
      <div className="flex h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('loading') || 'Loading'}</span>
      </div>
    );
  }
  if (loadState === 'forbidden') return <div className="p-6 text-center text-muted-foreground">You do not have access to this relationship workspace.</div>;
  if (loadState === 'not_found') return <div className="p-6 text-center text-muted-foreground">This relationship could not be opened.</div>;
  if (loadState === 'error' || !rel || !relationshipId) return <div className="p-6 text-center text-muted-foreground">{t('relationshipNotFound')}</div>;

  const counterpartyName = rel.counterparty?.display_name || rel.counterparty?.nickname || t('workspace');
  const unreadCount = msgs.filter((message) => !message.is_read && message.sender_user_id !== userId).length;
  const latestMessage = msgs[msgs.length - 1] || null;

  return (
    <div dir={t.isRTL ? 'rtl' : 'ltr'} className={embedded ? 'flex flex-col gap-3' : 'mx-1 my-1 flex min-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-border/50 bg-card md:h-[calc(100vh-3.5rem)]'}>
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className={`flex flex-wrap items-start gap-3 border-b border-border ${embedded ? 'px-3 py-3' : 'px-4 py-4'}`}>
          {!embedded && (
            <button type="button" onClick={() => navigate('/network')} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-600">
            {counterpartyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{counterpartyName}</h1>
              <Badge variant="outline">{rel.counterparty?.merchant_id || '—'}</Badge>
              <Badge className={dealStatusStyle(rel.status)}>{rel.status}</Badge>
            </div>
            {!embedded ? <p className="mt-1 text-sm text-muted-foreground">{rel.counterparty?.merchant_id}</p> : null}
          </div>
          <div className={`grid gap-2 ${embedded ? 'min-w-0 grid-cols-2 lg:grid-cols-4' : 'min-w-[220px] grid-cols-2 md:grid-cols-4'}`}>
            <div className="rounded-xl bg-secondary px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">{t('activeDeals')}</p>
              <p className="text-base font-semibold">{relDeals.filter((deal) => deal.status === 'approved').length}</p>
            </div>
            <div className="rounded-xl bg-secondary px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Pending</p>
              <p className="text-base font-semibold">{relDeals.filter((deal) => deal.status === 'pending').length}</p>
            </div>
            <div className="rounded-xl bg-secondary px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Unread</p>
              <p className="text-base font-semibold">{unreadCount}</p>
            </div>
            <div className="rounded-xl bg-secondary px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">{t('activeExposure')}</p>
              <p className="text-base font-semibold">${Number(rel.summary?.activeExposure || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className={`grid gap-3 ${embedded ? 'p-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.95fr)]' : 'p-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(340px,1fr)]'}`}>
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Deal flow</h2>
                {null}
              </div>
              <Button onClick={() => setCreateDealOpen(true)} size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t('newDeal')}
              </Button>
            </div>

            <div className="space-y-3">
              {relDeals.length > 0 && (
                <div className="hidden grid-cols-[minmax(0,2fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(140px,0.9fr)_minmax(220px,1fr)] gap-3 rounded-2xl border border-border/70 bg-muted/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <div>Deal</div>
                <div>Split</div>
                <div>Exposure</div>
                <div>State</div>
                <div>Controls</div>
              </div>
              )}
              {relDeals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('noDealsYet')}
                </div>
              ) : relDeals.map((deal) => {
                const approval = approvalByDealId.get(deal.id);
                const outgoingApproval = outgoingApprovalByDealId.get(deal.id);
                const buyer = extractDealBuyer(deal);
                const price = extractDealPrice(deal);
                const merchantLabel = rel.counterparty?.display_name || rel.counterparty?.nickname || 'Merchant';
                const margin = extractDealMargin(deal);
                const net = deal.realized_pnl ?? deal.expected_return ?? null;
                const outstanding = calculateOutstanding(deal);
                const detailRows = [
                  { label: t('date'), value: formatDealDate(deal, approval?.submitted_at || outgoingApproval?.submitted_at) },
                  { label: 'Deal type', value: DEAL_TYPE_CONFIGS[deal.deal_type]?.label || deal.deal_type },
                  { label: 'Direction', value: formatDealDirection(deal, userId) },
                  { label: 'Merchant', value: merchantLabel },
                  { label: 'Status', value: deal.status },
                  { label: 'Amount', value: `${formatCurrencyValue(deal.amount)} ${deal.currency}` },
                  { label: 'Margin', value: margin != null ? `${margin.toFixed(2)}%` : 'Not set' },
                  { label: 'Net', value: formatCurrencyValue(net) },
                ];
                return (
                  <article key={deal.id} className={`rounded-2xl border border-border/70 bg-background shadow-sm ${embedded ? 'p-3' : 'p-4'}`}>
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(140px,0.9fr)_minmax(220px,1fr)] lg:items-start">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">{DEAL_TYPE_CONFIGS[deal.deal_type]?.icon || '📄'}</span>
                          <h3 className="text-base font-semibold text-foreground">{deal.title || DEAL_TYPE_CONFIGS[deal.deal_type]?.label || deal.deal_type}</h3>
                          <Badge className={dealStatusStyle(deal.status)}>{deal.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{approvalSummaryLabel(approval || outgoingApproval || { type: deal.deal_type, target_entity_type: '', target_entity_id: '', id: '', relationship_id: '', proposed_payload: {}, status: 'pending', submitted_by_user_id: '', submitted_by_merchant_id: '', reviewer_user_id: '', resolution_note: null, submitted_at: deal.created_at, resolved_at: null, created_at: deal.created_at, updated_at: deal.updated_at })}</p>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {detailRows.map((detail) => (
                            <div key={`${deal.id}-${detail.label}`} className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{detail.label}</p>
                              <p className="mt-1 text-sm font-medium text-foreground">{detail.value}</p>
                            </div>
                          ))}
                          <div className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('buyer')}</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{buyer || 'Not set'}</p>
                          </div>
                          <div className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('price')}</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{price != null ? `$${price.toLocaleString()}` : 'Not set'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ratio</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{formatDealRatioLabel(deal)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{formatCurrencyValue(outstanding.outstanding)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-secondary/30 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{deal.status}</p>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</p>
                        <div className="mt-3 flex flex-col gap-2">
                          {approval ? (
                            <>
                              <Button size="sm" className="justify-center gap-1.5" onClick={() => handleApproveApproval(approval.id)}>
                                <Check className="h-3.5 w-3.5" />
                                {t('approve')}
                              </Button>
                              <Button size="sm" variant="outline" className="justify-center" onClick={() => handleRejectApproval(approval.id)}>
                                {t('reject')}
                              </Button>
                              <Button size="sm" variant="secondary" className="justify-center" onClick={() => openRejectProposal(approval.id, deal)}>
                                Reject, modify, and send back
                              </Button>
                              <p className="text-xs text-muted-foreground">{approvalSummaryLabel(approval)}</p>
                            </>
                          ) : outgoingApproval ? (
                            <div className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-700">
                              <Clock3 className="h-3.5 w-3.5" />
                              Awaiting counterparty approval
                            </div>
                          ) : deal.status === 'approved' ? (
                            <>
                              <Button size="sm" variant="outline" className="justify-center gap-1.5" onClick={() => openSettlement(deal.id)}>
                                <DollarSign className="h-3.5 w-3.5" />
                                {t('settle')}
                              </Button>
                              {null}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">—</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {!embedded && <aside className="flex min-h-[420px] flex-col rounded-2xl border border-border/70 bg-muted/20">
            <div className="border-b border-border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {unreadCount} unread
                </div>
              </div>
              {latestMessage && (
                <div className="mt-3 rounded-xl border border-border/70 bg-background px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest</p>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{latestMessage.body}</p>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {pendingIncomingApprovals.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    Pending approvals need attention
                  </div>
                  <div className="space-y-2 text-xs text-amber-900/80">
                    {pendingIncomingApprovals.map((approval) => (
                      <div key={approval.id} className="rounded-lg bg-background/70 px-3 py-2">
                        {approvalSummaryLabel(approval)} · {new Date(approval.submitted_at).toLocaleDateString()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {msgs.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 text-center text-sm text-muted-foreground">
                  {t('noMessagesYet')}
                </div>
              ) : msgs.map((msg) => {
                const isOwn = msg.sender_user_id === userId;
                const isSystem = msg.message_type === 'system';
                return (
                  <div key={msg.id} className={`flex ${isSystem ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      isSystem
                        ? 'border border-border bg-background text-muted-foreground'
                        : isOwn
                          ? 'bg-foreground text-background'
                          : msg.is_read
                            ? 'bg-background border border-border'
                            : 'border border-blue-500/30 bg-blue-500/10'
                    }`}>
                      {!isSystem && !isOwn && <p className="mb-1 text-[11px] font-medium text-muted-foreground">{msg.sender_name || rel.counterparty?.display_name || rel.counterparty?.merchant_id}</p>}
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                      <p className={`mt-1 text-[10px] ${isOwn ? 'text-background/60' : 'text-muted-foreground'}`}>
                        {new Date(msg.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-background px-4 py-3">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground">Message</Label>
                <Textarea rows={3} value={msgInput} onChange={(event) => setMsgInput(event.target.value)} placeholder={t('typeMessage')} className="mt-2 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={sendMsg} disabled={!msgInput.trim()} className="gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </aside>}
        </div>
      </div>

      <CreateDealDialog
        open={createDealOpen}
        onOpenChange={setCreateDealOpen}
        relationshipId={relationshipId}
        counterpartyName={counterpartyName}
        onCreated={reload}
        customers={sharedCustomers}
        suppliers={sharedSuppliers}
        trackerState={trackerState}
        onStateChange={setTrackerState}
      />

      <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle & close deal</DialogTitle>
            <DialogDescription>Submit the capital return and profit. Approval and close flow remain unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isPartnershipSettle && (
              <div className="space-y-2">
                <Label>{t('amountUsdtLabel')}</Label>
                <Input type="number" value={settlementForm.amount} onChange={(event) => setSettlementForm((current) => ({ ...current, amount: event.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profit earned</Label>
                <Input type="number" value={settlementForm.profit} onChange={(event) => setSettlementForm((current) => ({ ...current, profit: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t('period')}</Label>
                <Input type="month" value={settlementForm.period_key} onChange={(event) => setSettlementForm((current) => ({ ...current, period_key: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('noteOptional')}</Label>
              <Textarea rows={3} value={settlementForm.note} onChange={(event) => setSettlementForm((current) => ({ ...current, note: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlementOpen(false)} disabled={submittingSettlement}>{t('cancel')}</Button>
            <Button onClick={handleSubmitSettlement} disabled={!canSubmitSettlement || submittingSettlement}>{submittingSettlement ? 'Submitting...' : t('submitForApproval')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectProposal)} onOpenChange={(open) => !open && setRejectProposal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject with ratio change</DialogTitle>
            <DialogDescription>
              Send a structured counter-proposal into the relationship thread and reject the pending approval with an auditable note.
            </DialogDescription>
          </DialogHeader>
          {rejectProposal && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{rejectProposal.deal.title}</p>
                <p className="text-xs text-muted-foreground">Current amount ${rejectProposal.deal.amount.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Revised ratio (%)</Label>
                  <Input type="number" min="0" max="100" value={rejectForm.proposed_ratio} onChange={(event) => setRejectForm((current) => ({ ...current, proposed_ratio: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Revised amount</Label>
                  <Input type="number" min="0" value={rejectForm.proposed_amount} onChange={(event) => setRejectForm((current) => ({ ...current, proposed_amount: event.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea rows={4} value={rejectForm.note} onChange={(event) => setRejectForm((current) => ({ ...current, note: event.target.value }))} placeholder="Explain what should change before approval." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectProposal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitRejectProposal}>Send counter-proposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
