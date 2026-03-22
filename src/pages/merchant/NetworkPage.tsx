import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Briefcase, ChevronRight, FileText, Inbox, Loader2, MessageCircle, Search, TrendingUp, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import RelationshipWorkspace from '@/pages/merchant/RelationshipWorkspace';
import { demoTradingData } from '@/lib/trading/demo-data';
import { economicTermsChanged, getMerchantAgreementDeleteMode } from '@/lib/trading/utils';
import type { AgreementTemplate, CalculationConfig, MerchantAgreement } from '@/lib/trading/types';
import type { PortfolioAnalytics } from '@/lib/api';
import type { MerchantApproval, MerchantInvite, MerchantMessage, MerchantRelationship, MerchantSearchResult } from '@/types/domain';

const MESSAGE_SUMMARY_TIMEOUT_MS = 4000;

type ConversationSummary = {
  relationship: MerchantRelationship;
  unreadCount: number;
  latestMessage: MerchantMessage | null;
  pendingIncomingApprovals: number;
  pendingOutgoingApprovals: number;
};

class NetworkWorkspaceBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('[NetworkPage] workspace crashed', error); }
  render() {
    if (this.state.hasError) {
      return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 text-center text-sm text-muted-foreground">Workspace unavailable</div>;
    }
    return this.props.children;
  }
}

const statusColors: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  approved: 'bg-success text-success-foreground',
  rejected: 'bg-destructive text-destructive-foreground',
  archived: 'bg-muted text-muted-foreground',
};

function getConfigValue(config: CalculationConfig) {
  return config.profitSharePercent ?? config.fixedMarginAmount ?? config.spreadPercent ?? config.commissionPercent ?? Object.values(config.percentages || {})[0] ?? 0;
}

function callOrResolve<T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  return fn ? fn() : Promise.resolve(fallback);
}

export default function NetworkPage() {
  const inRouterContext = useInRouterContext();

  if (inRouterContext) {
    return <NetworkPageWithRouter />;
  }

  return <NetworkPageContent searchParams={new URLSearchParams()} setSearchParams={() => undefined} />;
}

function NetworkPageWithRouter() {
  const [searchParams, setSearchParams] = useSearchParams();
  return <NetworkPageContent searchParams={searchParams} setSearchParams={setSearchParams} />;
}

function NetworkPageContent({
  searchParams,
  setSearchParams,
}: {
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams) => void;
}) {
  const { userId } = useAuth();
  const t = useT();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MerchantSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<MerchantSearchResult | null>(null);
  const [inviteForm, setInviteForm] = useState({ purpose: '', role: 'partner', message: '' });
  const [inbox, setInbox] = useState<MerchantInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<MerchantInvite[]>([]);
  const [relationships, setRelationships] = useState<MerchantRelationship[]>([]);
  const [conversationMap, setConversationMap] = useState<Record<string, ConversationSummary>>({});
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [agreements, setAgreements] = useState<MerchantAgreement[]>([]);
  const [usedAgreementIds, setUsedAgreementIds] = useState<Set<string>>(new Set());
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [messages, setMessages] = useState<MerchantMessage[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const [editingAgreement, setEditingAgreement] = useState<MerchantAgreement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [deleteAgreementId, setDeleteAgreementId] = useState<string | null>(null);

  const selectedRelationshipId = searchParams.get('relationship');

  const getErrorMessage = (err: unknown, fallback: string) => err instanceof Error && err.message ? err.message : fallback;
  const ensureArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
    let timeoutId: number | undefined;
    try {
      return await Promise.race([promise, new Promise<T>((resolve) => { timeoutId = window.setTimeout(() => resolve(fallbackValue), timeoutMs); })]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [invitesRes, sentRes, relationshipsRes, approvalsInboxRes, approvalsSentRes, templatesRes, agreementsRes, ordersRes, analyticsRes] = await Promise.allSettled([
        callOrResolve(api.invites?.inbox, { invites: [] as MerchantInvite[] }),
        callOrResolve(api.invites?.sent, { invites: [] as MerchantInvite[] }),
        callOrResolve(api.relationships?.list, { relationships: [] as MerchantRelationship[] }),
        callOrResolve(api.approvals?.inbox, { approvals: [] as MerchantApproval[] }),
        callOrResolve(api.approvals?.sent, { approvals: [] as MerchantApproval[] }),
        callOrResolve(api.agreementTemplates?.list, { templates: demoTradingData.templates }),
        callOrResolve(api.merchantAgreements?.list, { agreements: demoTradingData.merchantAgreements }),
        callOrResolve(api.orders?.list, { orders: demoTradingData.orders }),
        callOrResolve(api.analytics?.get, null as PortfolioAnalytics | null),
      ]);

      setInbox(invitesRes.status === 'fulfilled' ? ensureArray(invitesRes.value?.invites) : []);
      setSentInvites(sentRes.status === 'fulfilled' ? ensureArray(sentRes.value?.invites) : []);
      const rels = relationshipsRes.status === 'fulfilled' ? ensureArray<MerchantRelationship>(relationshipsRes.value?.relationships) : [];
      setRelationships(rels);
      setTemplates(templatesRes.status === 'fulfilled' ? templatesRes.value.templates : demoTradingData.templates);
      setAgreements(agreementsRes.status === 'fulfilled' ? agreementsRes.value.agreements : demoTradingData.merchantAgreements);
      setUsedAgreementIds(new Set((ordersRes.status === 'fulfilled' ? ordersRes.value.orders : demoTradingData.orders).map((order) => order.merchantAgreementId).filter(Boolean)));
      setAnalytics(analyticsRes.status === 'fulfilled' ? analyticsRes.value : null);

      const approvalsInbox = approvalsInboxRes.status === 'fulfilled' ? ensureArray<MerchantApproval>(approvalsInboxRes.value?.approvals) : [];
      const approvalsSent = approvalsSentRes.status === 'fulfilled' ? ensureArray<MerchantApproval>(approvalsSentRes.value?.approvals) : [];

      const messageResults = await Promise.allSettled(rels.map(async (relationship) => {
        const response = await withTimeout(api.messages.list(relationship.id), MESSAGE_SUMMARY_TIMEOUT_MS, { messages: [] as MerchantMessage[] });
        return { relationshipId: relationship.id, messages: ensureArray<MerchantMessage>(response?.messages) };
      }));

      const nextConversationMap: Record<string, ConversationSummary> = {};
      rels.forEach((relationship, index) => {
        const messages = messageResults[index]?.status === 'fulfilled' ? messageResults[index].value.messages : [];
        nextConversationMap[relationship.id] = {
          relationship,
          unreadCount: messages.filter((message) => !message.is_read && message.sender_user_id !== userId).length,
          latestMessage: messages[messages.length - 1] || null,
          pendingIncomingApprovals: approvalsInbox.filter((approval) => approval.relationship_id === relationship.id && approval.status === 'pending').length,
          pendingOutgoingApprovals: approvalsSent.filter((approval) => approval.relationship_id === relationship.id && approval.status === 'pending').length,
        };
      });
      setConversationMap(nextConversationMap);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Merchant hub data could not be loaded'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtimeRefresh(reload, ['new_message', 'new_invite', 'invite_update', 'approval_update', 'deal_update']);

  const selectedRelationship = useMemo(() => {
    if (selectedRelationshipId) return relationships.find((relationship) => relationship.id === selectedRelationshipId) || null;
    return relationships[0] || null;
  }, [relationships, selectedRelationshipId]);
  const selectedConversation = selectedRelationship ? conversationMap[selectedRelationship.id] ?? null : null;
  const pendingInviteCount = useMemo(() => inbox.filter((invite) => invite.status === 'pending').length + sentInvites.filter((invite) => invite.status === 'pending').length, [inbox, sentInvites]);
  const totalApprovalCount = useMemo(() => Object.values(conversationMap).reduce((sum, item) => sum + item.pendingIncomingApprovals + item.pendingOutgoingApprovals, 0), [conversationMap]);
  const agreementStats = useMemo(() => ({
    approved: agreements.filter((agreement) => agreement.status === 'approved').length,
    pending: agreements.filter((agreement) => agreement.status === 'pending').length,
    templates: templates.length,
  }), [agreements, templates]);
  const activeAnalytics = analytics ?? {
    totalDeployed: agreements.length * 1000,
    activeDeployed: agreements.filter((agreement) => agreement.status !== 'archived').length * 750,
    returnedCapital: Math.round(agreements.length * 420),
    realizedProfit: Math.round(agreements.filter((agreement) => agreement.status === 'approved').length * 180),
    unsettledExposure: Math.round(agreements.filter((agreement) => agreement.status === 'pending').length * 540),
    overdueDeals: agreements.filter((agreement) => agreement.status === 'pending').length,
    activeRelationships: relationships.length,
    pendingApprovals: totalApprovalCount,
    capitalByCounterparty: [],
    dealsByType: agreements.reduce<Record<string, number>>((acc, agreement) => ({ ...acc, [agreement.agreementType]: (acc[agreement.agreementType] || 0) + 1 }), {}),
    riskIndicators: [],
  };

  useEffect(() => {
    if (!selectedRelationship) {
      setMessages([]);
      return;
    }
    api.messages.list(selectedRelationship.id).then((response) => {
      setMessages(ensureArray<MerchantMessage>(response?.messages));
    }).catch(() => {
      setMessages([]);
    });
  }, [selectedRelationship]);

  const openInviteDialog = (merchant: MerchantSearchResult) => {
    setInviteTarget(merchant);
    setInviteForm({ purpose: '', role: 'partner', message: '' });
    setInviteDialogOpen(true);
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return toast.error(t('enterMin2Chars'));
    try {
      const response = await api.merchant.search(query.trim());
      setResults(response.results);
      setSearchOpen(true);
      setSearched(true);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSendInvite = async () => {
    if (!inviteTarget) return;
    try {
      await api.invites.send({ to_merchant_id: inviteTarget.merchant_id, purpose: inviteForm.purpose || t('generalCollaboration'), requested_role: inviteForm.role, message: inviteForm.message });
      toast.success(`${t('inviteSentTo')} ${inviteTarget.display_name}`);
      setInviteDialogOpen(false);
      await reload();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAcceptInvite = async (invite: MerchantInvite) => {
    try {
      const response = await api.invites.accept(invite.id);
      const next = new URLSearchParams(searchParams);
      if (response.relationship_id) next.set('relationship', response.relationship_id);
      setSearchParams(next);
      await reload();
      toast.success(t('inviteAccepted'));
    } catch (err: any) { toast.error(err.message); }
  };
  const handleRejectInvite = async (inviteId: string) => { try { await api.invites.reject(inviteId); await reload(); toast.success(t('inviteRejected')); } catch (err: any) { toast.error(err.message); } };
  const handleWithdrawInvite = async (inviteId: string) => { try { await api.invites.withdraw(inviteId); await reload(); toast.success(t('inviteWithdrawn')); } catch (err: any) { toast.error(err.message); } };
  const handleSendMessage = async () => {
    if (!selectedRelationship || !messageDraft.trim()) return;
    try {
      await api.messages.send(selectedRelationship.id, messageDraft.trim());
      setMessageDraft('');
      const response = await api.messages.list(selectedRelationship.id);
      setMessages(ensureArray<MerchantMessage>(response?.messages));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openEditAgreement = (agreement: MerchantAgreement) => {
    setEditingAgreement(agreement);
    setEditTitle(agreement.title || '');
    setEditAmount(String(getConfigValue(agreement.resolvedTermsSnapshot)));
    setEditStatus(agreement.status || 'pending');
  };

  const saveAgreement = async () => {
    if (!editingAgreement) return;
    const template = templates.find((item) => item.id === editingAgreement.templateId);
    if (!template) return;
    const amount = Number(editAmount);
    const nextConfig: CalculationConfig = template.agreementType === 'profit_share'
      ? { ...editingAgreement.resolvedTermsSnapshot, profitSharePercent: amount }
      : template.agreementType === 'fixed_margin'
        ? { ...editingAgreement.resolvedTermsSnapshot, fixedMarginAmount: amount }
        : template.agreementType === 'spread'
          ? { ...editingAgreement.resolvedTermsSnapshot, spreadPercent: amount }
          : template.agreementType === 'commission'
            ? { ...editingAgreement.resolvedTermsSnapshot, commissionPercent: amount }
            : { ...editingAgreement.resolvedTermsSnapshot, percentages: { ...(editingAgreement.resolvedTermsSnapshot.percentages || {}), custom: amount } };
    if (usedAgreementIds.has(editingAgreement.id) && economicTermsChanged(editingAgreement.resolvedTermsSnapshot, nextConfig)) {
      setAgreements((current) => [{ ...editingAgreement, id: `${editingAgreement.id}-v${editingAgreement.version + 1}`, title: editTitle, status: 'pending', version: editingAgreement.version + 1, approvedAt: null, approvedByUserId: null, resolvedTermsSnapshot: { ...nextConfig, agreementId: `${editingAgreement.id}-v${editingAgreement.version + 1}`, templateId: editingAgreement.templateId, version: editingAgreement.version + 1, agreementType: editingAgreement.agreementType }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...current]);
      toast.success('Economic terms changed, so a new merchant-agreement version was created.');
    } else {
      setAgreements((current) => current.map((agreement) => agreement.id === editingAgreement.id ? { ...agreement, title: editTitle, status: editStatus as MerchantAgreement['status'], resolvedTermsSnapshot: { ...agreement.resolvedTermsSnapshot, ...nextConfig }, updatedAt: new Date().toISOString() } : agreement));
      toast.success(t('saveCorrection'));
    }
    setEditingAgreement(null);
  };

  const deleteAgreement = async () => {
    if (!deleteAgreementId) return;
    const agreement = agreements.find((item) => item.id === deleteAgreementId);
    if (!agreement) return;
    const mode = getMerchantAgreementDeleteMode(agreement, usedAgreementIds);
    if (mode === 'archive') {
      setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: 'archived', isActive: false, updatedAt: new Date().toISOString() } : item));
      toast.success('This agreement is already used in orders, so it will be archived instead of permanently deleted.');
    } else {
      setAgreements((current) => current.filter((item) => item.id !== agreement.id));
      toast.success(t('deletedSuccessfully'));
    }
    setDeleteAgreementId(null);
  };

  if (loading) {
    return <div className="flex h-[70vh] items-center justify-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /><span>{t('networkTitle')}</span></div></div>;
  }

  return (
    <div className="space-y-4 px-2 pb-4 md:px-3" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <PageHeader title={t('networkTitle')} />

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Network</Badge><Badge variant="outline">Analytics</Badge><Badge variant="outline">Deals</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline">{relationships.length} relationships</Badge>
            <Badge variant="outline">{activeAnalytics.pendingApprovals} approvals</Badge>
            <Badge variant="outline">{agreementStats.approved} active deals</Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="mb-2 flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Workspace</h2></div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Stat label="Relationships" value={String(relationships.length)} />
                <Stat label="Approved" value={String(agreementStats.approved)} />
                <Stat label="Pending" value={String(agreementStats.pending)} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">Analytics</h3>
              </div>
              <Badge variant="outline">Analytics</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total deployed" value={`$${activeAnalytics.totalDeployed.toLocaleString()}`} />
              <Stat label="Active exposure" value={`$${activeAnalytics.activeDeployed.toLocaleString()}`} />
              <Stat label="Realized profit" value={`$${activeAnalytics.realizedProfit.toLocaleString()}`} />
              <Stat label="Pending approvals" value={String(activeAnalytics.pendingApprovals)} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Counterparty exposure</p>
                <div className="mt-3 space-y-2">
                  {(activeAnalytics.capitalByCounterparty.length > 0 ? activeAnalytics.capitalByCounterparty : relationships.slice(0, 3).map((relationship) => ({
                    name: relationship.counterparty?.display_name || relationship.counterparty?.nickname || relationship.id,
                    deployed: relationship.summary?.activeExposure || 0,
                    returned: relationship.summary?.realizedProfit || 0,
                    profit: relationship.summary?.realizedProfit || 0,
                    roi: relationship.summary?.activeExposure ? ((relationship.summary?.realizedProfit || 0) / relationship.summary.activeExposure) * 100 : 0,
                  }))).map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">${item.deployed.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{item.roi.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">${item.profit.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deal mix</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(activeAnalytics.dealsByType).length > 0 ? Object.entries(activeAnalytics.dealsByType).map(([type, count]) => (
                    <div key={type} className="rounded-full border border-border/70 px-3 py-1.5 text-sm">
                      {type} <span className="text-muted-foreground">({count})</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">—</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Relationship</h3>
              {selectedConversation && <div className="flex flex-wrap gap-2"><Badge variant="outline">{selectedConversation.pendingIncomingApprovals} incoming</Badge><Badge variant="outline">{selectedConversation.pendingOutgoingApprovals} outgoing</Badge><Badge variant="outline">{selectedConversation.unreadCount} unread</Badge></div>}
            </div>
            {selectedRelationship ? (
              <NetworkWorkspaceBoundary key={selectedRelationship.id}><RelationshipWorkspace relationshipId={selectedRelationship.id} embedded /></NetworkWorkspaceBoundary>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">Workspace unavailable</div>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="mb-1 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="text-base font-semibold">Deals</h3></div>
              <Badge variant="outline">{agreementStats.templates} templates</Badge>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merchant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No deals</td>
                    </tr>
                  ) : agreements.map((agreement) => {
                    const template = templates.find((item) => item.id === agreement.templateId);
                    const deleteMode = getMerchantAgreementDeleteMode(agreement, usedAgreementIds);
                    return (
                      <tr key={agreement.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-3"><div className="font-medium">{agreement.title || template?.name || 'Agreement'}</div><div className="text-xs text-muted-foreground">{agreement.agreementType} · v{agreement.version}</div></td>
                        <td className="px-4 py-3">{agreement.merchantName}</td>
                        <td className="px-4 py-3"><Badge className={statusColors[agreement.status] || statusColors.pending}>{agreement.status}</Badge></td>
                        <td className="px-4 py-3 text-right"><div className="font-medium">{getConfigValue(agreement.resolvedTermsSnapshot).toLocaleString()}</div><div className="text-xs text-muted-foreground">{template?.defaultCurrency || 'USD'}</div></td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEditAgreement(agreement)}>Edit</Button>{agreement.status === 'pending' && <Button size="sm" onClick={() => setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: 'approved', approvedAt: new Date().toISOString(), approvedByUserId: 'current-user' } : item))}>Approve</Button>}<Button size="sm" variant="outline" onClick={() => setDeleteAgreementId(agreement.id)}>Delete</Button>{deleteMode === 'archive' && <span className="self-center text-[11px] text-muted-foreground">Archives after use</span>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Relationship switcher</h3><Users className="h-4 w-4 text-muted-foreground" /></div>
            <div className="space-y-2 max-h-[260px] overflow-auto">
              {relationships.map((item) => {
                const selected = selectedRelationship?.id === item.id;
                return <button key={item.id} type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.set('relationship', item.id); setSearchParams(next); }} className={`w-full rounded-xl border px-3 py-2 text-left ${selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-background hover:bg-secondary/60'}`}><div className="font-medium text-sm">{item.counterparty?.display_name || item.counterparty?.nickname || item.id}</div><div className="text-[11px] text-muted-foreground">{conversationMap[item.id]?.latestMessage?.body || 'Open workspace'}</div></button>;
              })}
              {relationships.length === 0 && <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No relationships</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Quick merchant search</h3><Search className="h-4 w-4 text-muted-foreground" /></div>
            <form id="merchant-search" onSubmit={handleSearch} className="flex gap-2">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find merchant…" className="h-9 text-sm" />
              <Button type="submit" size="sm" variant="outline">Search</Button>
            </form>
            {searchOpen && <div className="mt-2 space-y-2">{results.length === 0 && searched ? <p className="text-xs text-muted-foreground">No results</p> : null}{results.map((result) => <div key={result.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{result.display_name}</p><p className="text-[11px] text-muted-foreground">{result.merchant_id}</p></div><Button size="sm" variant="outline" onClick={() => openInviteDialog(result)}><UserPlus className="mr-1 h-3.5 w-3.5" />{t('invite')}</Button></div>)}</div>}
          </div>
        </aside>
      </section>

      <button
        type="button"
        onClick={() => setInboxOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border/70 bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg"
      >
        <Inbox className="h-4 w-4" />
        Inbox
        <span className="rounded-full bg-background/15 px-2 py-0.5 text-xs">{pendingInviteCount + totalApprovalCount + messages.filter((message) => !message.is_read && message.sender_user_id !== userId).length}</span>
      </button>

      <Dialog open={inboxOpen} onOpenChange={setInboxOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" /> Inbox</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Unread" value={String(messages.filter((message) => !message.is_read && message.sender_user_id !== userId).length)} />
              <Stat label="Invites" value={String(pendingInviteCount)} />
              <Stat label="Approvals" value={String(totalApprovalCount)} />
            </div>
            <div className="rounded-xl border border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Latest thread</h3>
                <Badge variant="outline">{selectedRelationship?.counterparty?.display_name || 'No relationship selected'}</Badge>
              </div>
              <div className="max-h-[220px] space-y-2 overflow-auto">
                {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages</p> : messages.slice(-6).map((message) => (
                  <div key={message.id} className="rounded-lg border border-border/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{message.sender_name || (message.sender_user_id === userId ? 'You' : selectedRelationship?.counterparty?.display_name) || 'Message'}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString()}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{message.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Textarea rows={3} value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Reply" />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSendMessage} disabled={!selectedRelationship || !messageDraft.trim()} className="gap-1.5">
                    Send <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-3">
                <h3 className="text-sm font-semibold">Pending invites</h3>
                <div className="mt-2 space-y-2">
                  {inbox.filter((invite) => invite.status === 'pending').length === 0 ? <p className="text-sm text-muted-foreground">—</p> : inbox.filter((invite) => invite.status === 'pending').map((invite) => <div key={invite.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{invite.from_display_name || invite.from_merchant_id}</div>)}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <h3 className="text-sm font-semibold">Approval queue</h3>
                <div className="mt-2 space-y-2">
                  {Object.values(conversationMap).filter((item) => item.pendingIncomingApprovals + item.pendingOutgoingApprovals > 0).length === 0 ? <p className="text-sm text-muted-foreground">—</p> : Object.values(conversationMap).filter((item) => item.pendingIncomingApprovals + item.pendingOutgoingApprovals > 0).map((item) => <div key={item.relationship.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{item.relationship.counterparty?.display_name || item.relationship.id} · {item.pendingIncomingApprovals + item.pendingOutgoingApprovals} pending</div>)}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('sendInviteTo')} {inviteTarget?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>{t('purpose')}</Label><Input value={inviteForm.purpose} onChange={(event) => setInviteForm((current) => ({ ...current, purpose: event.target.value }))} placeholder={t('purposePlaceholder')} /></div>
            <div className="space-y-2"><Label>{t('role')}</Label><Input value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))} /></div>
            <div className="space-y-2"><Label>{t('message')}</Label><Textarea rows={4} value={inviteForm.message} onChange={(event) => setInviteForm((current) => ({ ...current, message: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setInviteDialogOpen(false)}>{t('cancel')}</Button><Button onClick={handleSendInvite}>{t('sendInvite')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAgreement} onOpenChange={(open) => !open && setEditingAgreement(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit merchant agreement</DialogTitle></DialogHeader>
          <div className="space-y-3"><label className="text-sm font-medium block">Title<input className="mt-1 w-full rounded-md border px-3 py-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label><label className="text-sm font-medium block">Economic value<input className="mt-1 w-full rounded-md border px-3 py-2" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label><label className="text-sm font-medium block">Status<select className="mt-1 w-full rounded-md border px-3 py-2" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="archived">archived</option></select></label></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingAgreement(null)}>{t('cancel')}</Button><Button onClick={saveAgreement}>{t('saveCorrection')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteAgreementId} onOpenChange={(open) => !open && setDeleteAgreementId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('delete')}</DialogTitle></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteAgreementId(null)}>{t('cancel')}</Button><Button onClick={deleteAgreement}>{t('delete')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/70 bg-background px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-lg font-semibold text-foreground">{value}</div></div>;
}
