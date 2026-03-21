import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  ChevronRight,
  ClipboardCheck,
  Inbox,
  Loader2,
  MessageCircle,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import RelationshipWorkspace from '@/pages/merchant/RelationshipWorkspace';
import type { MerchantApproval, MerchantInvite, MerchantMessage, MerchantRelationship, MerchantSearchResult } from '@/types/domain';

const MESSAGE_SUMMARY_TIMEOUT_MS = 4000;

type ConversationSummary = {
  relationship: MerchantRelationship;
  unreadCount: number;
  latestMessage: MerchantMessage | null;
  pendingIncomingApprovals: number;
  pendingOutgoingApprovals: number;
};

type NetworkWorkspaceBoundaryProps = {
  children: React.ReactNode;
};

type NetworkWorkspaceBoundaryState = {
  hasError: boolean;
};

class NetworkWorkspaceBoundary extends React.Component<NetworkWorkspaceBoundaryProps, NetworkWorkspaceBoundaryState> {
  constructor(props: NetworkWorkspaceBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[NetworkPage] embedded workspace crashed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 text-center text-sm text-muted-foreground">
          The relationship workspace could not be displayed. Refresh the page or reopen this relationship.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NetworkPage() {
  const { userId } = useAuth();
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
  const [loading, setLoading] = useState(true);

  const selectedRelationshipId = searchParams.get('relationship');

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return fallback;
  };

  const ensureArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> => {
    let timeoutId: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeoutId = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [invitesRes, sentInvitesRes, relationshipsRes, approvalsInboxRes, approvalsSentRes] = await Promise.allSettled([
        api.invites.inbox(),
        api.invites.sent(),
        api.relationships.list(),
        api.approvals.inbox(),
        api.approvals.sent(),
      ]);

      if (invitesRes.status === 'fulfilled') setInbox(ensureArray<MerchantInvite>(invitesRes.value?.invites));
      else {
        setInbox([]);
        toast.error(getErrorMessage(invitesRes.reason, 'Invites inbox could not be loaded'));
      }

      if (sentInvitesRes.status === 'fulfilled') setSentInvites(ensureArray<MerchantInvite>(sentInvitesRes.value?.invites));
      else setSentInvites([]);

      const rels = relationshipsRes.status === 'fulfilled'
        ? ensureArray<MerchantRelationship>(relationshipsRes.value?.relationships)
        : [];
      setRelationships(rels);
      if (relationshipsRes.status === 'rejected') toast.error(getErrorMessage(relationshipsRes.reason, 'Relationships could not be loaded'));

      const approvalsInbox = approvalsInboxRes.status === 'fulfilled'
        ? ensureArray<MerchantApproval>(approvalsInboxRes.value?.approvals)
        : [];
      const approvalsSent = approvalsSentRes.status === 'fulfilled'
        ? ensureArray<MerchantApproval>(approvalsSentRes.value?.approvals)
        : [];

      const nextConversationMap: Record<string, ConversationSummary> = {};
      const messageResults = await Promise.allSettled(rels.map(async (relationship) => {
        const response = await withTimeout(
          api.messages.list(relationship.id),
          MESSAGE_SUMMARY_TIMEOUT_MS,
          { messages: [] as MerchantMessage[] },
        );
        return { relationshipId: relationship.id, messages: ensureArray<MerchantMessage>(response?.messages) };
      }));

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
      console.error('[NetworkPage] reload failed', err);
      toast.error(getErrorMessage(err, 'Network data could not be loaded'));
      setInbox([]);
      setSentInvites([]);
      setRelationships([]);
      setConversationMap({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void reload(); }, [reload]);
  useRealtimeRefresh(reload, ['new_message', 'new_invite', 'invite_update', 'approval_update', 'deal_update']);
  useEffect(() => {
    if (window.location.hash === '#merchant-search') {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      toast.error(t('enterMin2Chars'));
      return;
    }
    try {
      const response = await api.merchant.search(query.trim());
      setResults(response.results);
      setSearchOpen(true);
      setSearched(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openInviteDialog = (merchant: MerchantSearchResult) => {
    setInviteTarget(merchant);
    setInviteForm({ purpose: '', role: 'partner', message: '' });
    setInviteDialogOpen(true);
  };

  const handleSendInvite = async () => {
    if (!inviteTarget) return;
    try {
      await api.invites.send({
        to_merchant_id: inviteTarget.merchant_id,
        purpose: inviteForm.purpose || t('generalCollaboration'),
        requested_role: inviteForm.role,
        message: inviteForm.message,
      });
      toast.success(`${t('inviteSentTo')} ${inviteTarget.display_name}`);
      setInviteDialogOpen(false);
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const waitForRelationship = useCallback(async (counterpartyMerchantId: string, timeoutMs = 8000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const { relationships: nextRelationships } = await api.relationships.list();
      const relationship = nextRelationships.find((item) => item.counterparty?.merchant_id === counterpartyMerchantId);
      if (relationship) return relationship;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    return null;
  }, []);

  const handleAcceptInvite = async (invite: MerchantInvite) => {
    try {
      const response = await api.invites.accept(invite.id);
      const targetRelationshipId = response.relationship_id || (await waitForRelationship(invite.from_merchant_id))?.id;
      await reload();
      if (targetRelationshipId) {
        const next = new URLSearchParams(searchParams);
        next.set('relationship', targetRelationshipId);
        setSearchParams(next);
      }
      toast.success(t('inviteAccepted'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRejectInvite = async (inviteId: string) => {
    try {
      await api.invites.reject(inviteId);
      toast.success(t('inviteRejected'));
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleWithdrawInvite = async (inviteId: string) => {
    try {
      await api.invites.withdraw(inviteId);
      toast.success(t('inviteWithdrawn'));
      await reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const selectedRelationship = useMemo(() => {
    if (relationships.length === 1) return relationships[0];
    if (selectedRelationshipId) return relationships.find((relationship) => relationship.id === selectedRelationshipId) || null;
    return relationships[0] || null;
  }, [relationships, selectedRelationshipId]);

  useEffect(() => {
    if (!selectedRelationship) return;
    if (relationships.length === 1 && searchParams.get('relationship')) {
      const next = new URLSearchParams(searchParams);
      next.delete('relationship');
      setSearchParams(next, { replace: true });
      return;
    }
    if (relationships.length > 1 && !selectedRelationshipId) {
      const next = new URLSearchParams(searchParams);
      next.set('relationship', selectedRelationship.id);
      setSearchParams(next, { replace: true });
    }
  }, [relationships.length, searchParams, selectedRelationship, selectedRelationshipId, setSearchParams]);

  const conversationList = useMemo(
    () => relationships
      .map((relationship) => conversationMap[relationship.id])
      .filter((item): item is ConversationSummary => Boolean(item)),
    [conversationMap, relationships],
  );
  const selectedConversation = selectedRelationship ? conversationMap[selectedRelationship.id] ?? null : null;
  const singleRelationshipMode = relationships.length === 1;
  const pendingInboxInvites = inbox.filter((invite) => invite.status === 'pending');
  const pendingSentInvites = sentInvites.filter((invite) => invite.status === 'pending');
  const totalPendingActions = pendingInboxInvites.length + conversationList.reduce((sum, item) => sum + item.pendingIncomingApprovals + item.pendingOutgoingApprovals, 0);
  const totalUnread = conversationList.reduce((sum, item) => sum + item.unreadCount, 0);
  const totalApprovals = conversationList.reduce((sum, item) => sum + item.pendingIncomingApprovals + item.pendingOutgoingApprovals, 0);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{t('networkTitle')}</span>
        </div>
      </div>
    );
  }

  const overviewCards = [
    {
      label: 'Relationships',
      value: `${relationships.length}`,
      detail: singleRelationshipMode ? 'Single workspace active' : 'Multi-partner mode',
      icon: Users,
      warn: false,
    },
    {
      label: 'Pending Actions',
      value: `${totalPendingActions}`,
      detail: totalPendingActions > 0 ? 'Approvals and invites need a decision' : 'No approval bottlenecks',
      icon: ClipboardCheck,
      warn: totalPendingActions > 0,
    },
    {
      label: 'Unread Messages',
      value: `${selectedConversation?.unreadCount ?? totalUnread}`,
      detail: selectedConversation?.latestMessage?.body || 'No recent messages',
      icon: MessageCircle,
      warn: false,
    },
  ];

  return (
    <div dir={t.isRTL ? 'rtl' : 'ltr'} className="space-y-5 px-2 pb-4 md:px-3">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('networkTitle')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {relationships.length} relationship{relationships.length !== 1 ? 's' : ''} · {totalPendingActions} pending
          </p>
        </div>
        <form id="merchant-search" onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find merchant…"
              className="h-9 w-52 pl-9 text-sm"
            />
          </div>
          <Button type="submit" size="sm" className="h-9">Search</Button>
        </form>
      </div>

      {/* Overview stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {overviewCards.map(({ icon: Icon, label, value, detail, warn }) => (
          <div key={label} className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${warn ? 'text-amber-500' : 'text-foreground'}`}>{value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      {/* Search results */}
      {searchOpen && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Search Results</h2>
            <Badge variant="outline">{results.length} result{results.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="divide-y divide-border/40">
            {results.length === 0 && searched ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No merchants found.</p>
            ) : null}
            {results.map((result) => (
              <div key={result.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{result.display_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{result.merchant_id} · {result.region || 'Region not set'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openInviteDialog(result)} className="gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" />
                  {t('invite')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main 3-col layout */}
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        {/* Left: Relationships */}
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Relationships</h2>
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            {selectedConversation && selectedRelationship && (
              <div className="border-b border-border/60 px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Active</p>
                <p className="mt-1.5 text-sm font-semibold text-foreground">
                  {selectedRelationship.counterparty?.display_name || selectedRelationship.counterparty?.nickname || selectedRelationship.id}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{selectedConversation.pendingIncomingApprovals} incoming</Badge>
                  <Badge variant="outline" className="text-[10px]">{selectedConversation.pendingOutgoingApprovals} outgoing</Badge>
                  <Badge variant="outline" className="text-[10px]">{selectedConversation.unreadCount} unread</Badge>
                </div>
              </div>
            )}

            {!singleRelationshipMode && conversationList.length > 0 && (
              <div className="divide-y divide-border/40">
                {conversationList.map((item) => {
                  const selected = selectedRelationship?.id === item.relationship.id;
                  return (
                    <button
                      key={item.relationship.id}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set('relationship', item.relationship.id);
                        setSearchParams(next);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40 ${selected ? 'bg-primary/5' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.relationship.counterparty?.display_name || item.relationship.counterparty?.nickname || item.relationship.id}
                        </p>
                        <p className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
                          <span>{item.pendingIncomingApprovals + item.pendingOutgoingApprovals} approvals</span>
                          <span>·</span>
                          <span>{item.unreadCount} unread</span>
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}

            {relationships.length === 0 && (
              <p className="px-5 py-4 text-sm text-muted-foreground">No active relationships. Search for a merchant to connect.</p>
            )}
          </div>

          {(pendingInboxInvites.length > 0 || pendingSentInvites.length > 0) && (
            <div className="overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center justify-between border-b border-amber-500/20 px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Invite Queue</h2>
                <Inbox className="h-3.5 w-3.5 text-amber-500" />
              </div>
              {pendingInboxInvites.length > 0 && (
                <div className="divide-y divide-border/40">
                  <p className="px-5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Incoming</p>
                  {pendingInboxInvites.map((invite) => (
                    <div key={invite.id} className="px-5 py-3.5">
                      <p className="text-sm font-medium text-foreground">{invite.from_display_name || invite.from_merchant_id}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')} · {t('role')}: {invite.requested_role}</p>
                      {invite.message ? <p className="mt-1 text-xs italic text-muted-foreground">"{invite.message}"</p> : null}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => handleAcceptInvite(invite)}>{t('accept')}</Button>
                        <Button size="sm" variant="outline" onClick={() => handleRejectInvite(invite.id)}>{t('reject')}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {pendingSentInvites.length > 0 && (
                <div className="divide-y divide-border/40">
                  <p className="px-5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Sent</p>
                  {pendingSentInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{invite.to_display_name || invite.to_merchant_id}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleWithdrawInvite(invite.id)}>{t('withdraw')}</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center: Workspace */}
        <div>
          {selectedRelationship ? (
            <NetworkWorkspaceBoundary key={selectedRelationship.id}>
              <RelationshipWorkspace relationshipId={selectedRelationship.id} embedded />
            </NetworkWorkspaceBoundary>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-border bg-card text-sm text-muted-foreground">
              Select a relationship to open its workspace.
            </div>
          )}
        </div>

        {/* Right: Action rail */}
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Focus</h2>
            </div>
            <div className="divide-y divide-border/40">
              {[
                {
                  label: 'Incoming Approvals',
                  value: `${selectedConversation?.pendingIncomingApprovals ?? conversationList.reduce((sum, item) => sum + item.pendingIncomingApprovals, 0)}`,
                },
                {
                  label: 'Outgoing Approvals',
                  value: `${selectedConversation?.pendingOutgoingApprovals ?? conversationList.reduce((sum, item) => sum + item.pendingOutgoingApprovals, 0)}`,
                },
                {
                  label: 'Invite Queue',
                  value: `${pendingInboxInvites.length + pendingSentInvites.length}`,
                },
                {
                  label: 'Unread Messages',
                  value: `${selectedConversation?.unreadCount ?? totalUnread}`,
                },
                {
                  label: 'Approvals (all)',
                  value: `${selectedConversation ? selectedConversation.pendingIncomingApprovals + selectedConversation.pendingOutgoingApprovals : totalApprovals}`,
                },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="border-b border-border/60 px-5 py-3">
              <h2 className="text-sm font-semibold text-foreground">Invite a Merchant</h2>
            </div>
            <p className="px-5 py-4 text-sm text-muted-foreground">
              Search for a merchant above, then send a collaboration invitation with a purpose and requested role.
            </p>
          </div>
        </aside>
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sendInviteTo')} {inviteTarget?.display_name}</DialogTitle>
            <DialogDescription>
              Send a collaboration invitation directly from Network.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('purpose')}</Label>
              <Input value={inviteForm.purpose} onChange={(event) => setInviteForm((current) => ({ ...current, purpose: event.target.value }))} placeholder={t('purposePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('requestedRole')}</Label>
              <Input value={inviteForm.role} onChange={(event) => setInviteForm((current) => ({ ...current, role: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t('messageOptional')}</Label>
              <Textarea rows={4} value={inviteForm.message} onChange={(event) => setInviteForm((current) => ({ ...current, message: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSendInvite}>{t('sendInvite')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
