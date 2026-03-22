import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Briefcase, FileText, Loader2, MessageCircle, Search, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import RelationshipWorkspace from '@/pages/merchant/RelationshipWorkspace';
import { demoTradingData } from '@/lib/trading/demo-data';
import { economicTermsChanged, getMerchantAgreementDeleteMode } from '@/lib/trading/utils';
import type { AgreementTemplate, CalculationConfig, MerchantAgreement } from '@/lib/trading/types';
import type { MerchantApproval, MerchantInvite, MerchantMessage, MerchantRelationship, MerchantSearchResult } from '@/types/domain';

const MESSAGE_SUMMARY_TIMEOUT_MS = 4000;

type ConversationSummary = {
  relationship: MerchantRelationship;
  unreadCount: number;
  latestMessage: MerchantMessage | null;
  pendingIncomingApprovals: number;
  pendingOutgoingApprovals: number;
};

type MerchantHubPageProps = {
  entry?: 'network' | 'deals';
};

class NetworkWorkspaceBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('[MerchantHubPage] workspace crashed', error); }
  render() {
    if (this.state.hasError) {
      return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 text-center text-sm text-muted-foreground">The relationship workspace could not be displayed. Refresh the page or reopen this relationship.</div>;
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

export default function MerchantHubPage({ entry = 'network' }: MerchantHubPageProps) {
  const inRouterContext = useInRouterContext();

  if (inRouterContext) {
    return <MerchantHubPageWithRouter entry={entry} />;
  }

  return <MerchantHubPageContent entry={entry} searchParams={new URLSearchParams()} setSearchParams={() => undefined} />;
}

function MerchantHubPageWithRouter({ entry }: MerchantHubPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  return <MerchantHubPageContent entry={entry} searchParams={searchParams} setSearchParams={setSearchParams} />;
}

function MerchantHubPageContent({
  entry = 'network',
  searchParams,
  setSearchParams,
}: MerchantHubPageProps & {
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
      const [invitesRes, sentRes, relationshipsRes, approvalsInboxRes, approvalsSentRes, templatesRes, agreementsRes, ordersRes] = await Promise.allSettled([
        callOrResolve(api.invites?.inbox, { invites: [] as MerchantInvite[] }),
        callOrResolve(api.invites?.sent, { invites: [] as MerchantInvite[] }),
        callOrResolve(api.relationships?.list, { relationships: [] as MerchantRelationship[] }),
        callOrResolve(api.approvals?.inbox, { approvals: [] as MerchantApproval[] }),
        callOrResolve(api.approvals?.sent, { approvals: [] as MerchantApproval[] }),
        callOrResolve(api.agreementTemplates?.list, { templates: demoTradingData.templates }),
        callOrResolve(api.merchantAgreements?.list, { agreements: demoTradingData.merchantAgreements }),
        callOrResolve(api.orders?.list, { orders: demoTradingData.orders }),
      ]);

      setInbox(invitesRes.status === 'fulfilled' ? ensureArray(invitesRes.value?.invites) : []);
      setSentInvites(sentRes.status === 'fulfilled' ? ensureArray(sentRes.value?.invites) : []);
      const rels = relationshipsRes.status === 'fulfilled' ? ensureArray<MerchantRelationship>(relationshipsRes.value?.relationships) : [];
      setRelationships(rels);
      setTemplates(templatesRes.status === 'fulfilled' ? templatesRes.value.templates : demoTradingData.templates);
      setAgreements(agreementsRes.status === 'fulfilled' ? agreementsRes.value.agreements : demoTradingData.merchantAgreements);
      setUsedAgreementIds(new Set((ordersRes.status === 'fulfilled' ? ordersRes.value.orders : demoTradingData.orders).map((order) => order.merchantAgreementId).filter(Boolean)));

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
  const agreementStats = useMemo(() => ({
    approved: agreements.filter((agreement) => agreement.status === 'approved').length,
    pending: agreements.filter((agreement) => agreement.status === 'pending').length,
    templates: templates.length,
  }), [agreements, templates]);

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
      <PageHeader title={entry === 'deals' ? 'Merchant hub' : t('networkTitle')} description="Relationships and agreement operations now live together in one focused workspace." />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">Workspace focus</h2></div>
                <p className="text-sm text-muted-foreground">The core view now prioritizes active relationships and merchant agreements instead of inbox/search-heavy panels.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <Stat label="Relationships" value={String(relationships.length)} />
                <Stat label="Approved" value={String(agreementStats.approved)} />
                <Stat label="Pending" value={String(agreementStats.pending)} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Active merchant relationship</h3>
                <p className="text-sm text-muted-foreground">Relationship context remains central for live approvals, messages, and negotiation.</p>
              </div>
              {selectedConversation && <div className="flex flex-wrap gap-2"><Badge variant="outline">{selectedConversation.pendingIncomingApprovals} incoming</Badge><Badge variant="outline">{selectedConversation.pendingOutgoingApprovals} outgoing</Badge><Badge variant="outline">{selectedConversation.unreadCount} unread</Badge></div>}
            </div>
            {selectedRelationship ? (
              <NetworkWorkspaceBoundary key={selectedRelationship.id}><RelationshipWorkspace relationshipId={selectedRelationship.id} embedded /></NetworkWorkspaceBoundary>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground">The relationship workspace could not be displayed. Select or create a merchant relationship, then reopen the workspace.</div>
            )}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="text-base font-semibold">Merchant agreements</h3></div>
                <p className="text-sm text-muted-foreground">Versioned merchant agreements and templates are now part of the main workspace instead of a separate destination.</p>
              </div>
              <Badge variant="outline">{agreementStats.templates} templates</Badge>
            </div>
            {agreements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">No merchant agreements available.</div>
            ) : (
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
                    {agreements.map((agreement) => {
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
            )}
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
              {relationships.length === 0 && <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">No relationships yet.</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Quick merchant search</h3><Search className="h-4 w-4 text-muted-foreground" /></div>
            <form id="merchant-search" onSubmit={handleSearch} className="flex gap-2">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find merchant…" className="h-9 text-sm" />
              <Button type="submit" size="sm" variant="outline">Search</Button>
            </form>
            {searchOpen && <div className="mt-2 space-y-2">{results.length === 0 && searched ? <p className="text-xs text-muted-foreground">No merchants found.</p> : null}{results.map((result) => <div key={result.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{result.display_name}</p><p className="text-[11px] text-muted-foreground">{result.merchant_id}</p></div><Button size="sm" variant="outline" onClick={() => openInviteDialog(result)}><UserPlus className="mr-1 h-3.5 w-3.5" />{t('invite')}</Button></div>)}</div>}
          </div>

          {(inbox.filter((invite) => invite.status === 'pending').length > 0 || sentInvites.filter((invite) => invite.status === 'pending').length > 0) && (
            <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm">
              {inbox.filter((invite) => invite.status === 'pending').length > 0 && <div><p className="text-sm font-semibold text-amber-900">Incoming invites</p><div className="mt-2 space-y-2">{inbox.filter((invite) => invite.status === 'pending').map((invite) => <div key={invite.id} className="rounded-xl bg-background/85 px-3 py-3"><p className="text-sm font-medium text-foreground">{invite.from_display_name || invite.from_merchant_id}</p><p className="mt-1 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')} · {t('role')}: {invite.requested_role}</p>{invite.message ? <p className="mt-2 text-xs italic text-muted-foreground">“{invite.message}”</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => handleAcceptInvite(invite)}>{t('accept')}</Button><Button size="sm" variant="outline" onClick={() => handleRejectInvite(invite.id)}>{t('reject')}</Button></div></div>)}</div></div>}
              {sentInvites.filter((invite) => invite.status === 'pending').length > 0 && <div><p className="text-sm font-semibold text-amber-900">Sent invites</p><div className="mt-2 space-y-2">{sentInvites.filter((invite) => invite.status === 'pending').map((invite) => <div key={invite.id} className="rounded-xl bg-background/85 px-3 py-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{invite.to_display_name || invite.to_merchant_id}</p><p className="mt-1 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')}</p></div><Badge variant="outline">Waiting for recipient</Badge></div><div className="mt-3"><Button size="sm" variant="outline" onClick={() => handleWithdrawInvite(invite.id)}>{t('withdraw')}</Button></div></div>)}</div></div>}
            </div>
          )}
        </aside>
      </section>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('sendInviteTo')} {inviteTarget?.display_name}</DialogTitle><DialogDescription>Send a collaboration invitation directly from the merchant hub.</DialogDescription></DialogHeader>
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
          <DialogHeader><DialogTitle>Edit merchant agreement</DialogTitle><DialogDescription>Keep agreement economics safe while editing in the combined merchant hub.</DialogDescription></DialogHeader>
          <div className="space-y-3"><label className="text-sm font-medium block">Title<input className="mt-1 w-full rounded-md border px-3 py-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label><label className="text-sm font-medium block">Economic value<input className="mt-1 w-full rounded-md border px-3 py-2" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label><label className="text-sm font-medium block">Status<select className="mt-1 w-full rounded-md border px-3 py-2" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="archived">archived</option></select></label></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingAgreement(null)}>{t('cancel')}</Button><Button onClick={saveAgreement}>{t('saveCorrection')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteAgreementId} onOpenChange={(open) => !open && setDeleteAgreementId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('delete')}</DialogTitle><DialogDescription>Delete stays easy in the combined merchant hub. Used agreements archive instead of breaking history.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteAgreementId(null)}>{t('cancel')}</Button><Button onClick={deleteAgreement}>{t('delete')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border/70 bg-background px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-lg font-semibold text-foreground">{value}</div></div>;
}
