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
import { Briefcase, Loader2, MessageCircle, Search, UserPlus, Users } from 'lucide-react';
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
        <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 text-center text-sm text-muted-foreground">
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
  const singleRelationshipMode = relationships.length === 1;
  const totalPendingActions = inbox.filter((invite) => invite.status === 'pending').length + conversationList.reduce((sum, item) => sum + item.pendingIncomingApprovals + item.pendingOutgoingApprovals, 0);

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

  return (
    <div dir={t.isRTL ? 'rtl' : 'ltr'} className="space-y-4 px-2 pb-4 md:px-3">
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Briefcase className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">{t('networkTitle')}</h1>
            <p className="text-sm text-muted-foreground">
              {singleRelationshipMode
                ? 'One relationship detected — the full merchant workspace is embedded below.'
                : 'Select a relationship to work deals, approvals, and messages without leaving Network.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{relationships.length} relationship{relationships.length === 1 ? '' : 's'}</Badge>
            <Badge variant="outline">{totalPendingActions} pending actions</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div id="merchant-search" className="rounded-2xl border border-border/70 bg-background p-3">
              <p className="mb-2 text-sm font-semibold text-foreground">Find merchants</p>
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchants" className="pl-9" />
                </div>
                <Button type="submit">Search</Button>
              </form>
              {searchOpen && (
                <div className="mt-3 space-y-2">
                  {results.length === 0 && searched ? <p className="text-sm text-muted-foreground">No merchants found.</p> : null}
                  {results.map((result) => (
                    <div key={result.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{result.display_name}</p>
                        <p className="text-xs text-muted-foreground">{result.merchant_id} · {result.region || 'Region not set'}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openInviteDialog(result)} className="gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" />
                        {t('invite')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!singleRelationshipMode && (
              <div className="rounded-2xl border border-border/70 bg-background p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Relationship inbox</p>
                    <p className="text-xs text-muted-foreground">Choose a merchant thread to open the integrated workspace.</p>
                  </div>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="space-y-2">
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
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-secondary/60'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{item.relationship.counterparty?.display_name || item.relationship.counterparty?.nickname || item.relationship.id}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.latestMessage?.body || 'No messages yet'}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {item.unreadCount > 0 && <Badge>{item.unreadCount} unread</Badge>}
                            <p className="mt-1 text-[11px] text-muted-foreground">{item.pendingIncomingApprovals} in · {item.pendingOutgoingApprovals} out</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(inbox.filter((invite) => invite.status === 'pending').length > 0 || sentInvites.filter((invite) => invite.status === 'pending').length > 0) && (
              <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                {inbox.filter((invite) => invite.status === 'pending').length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Incoming invites</p>
                    <div className="mt-2 space-y-2">
                      {inbox.filter((invite) => invite.status === 'pending').map((invite) => (
                        <div key={invite.id} className="rounded-xl bg-background/85 px-3 py-3">
                          <p className="text-sm font-medium text-foreground">{invite.from_display_name || invite.from_merchant_id}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')} · {t('role')}: {invite.requested_role}</p>
                          {invite.message ? <p className="mt-2 text-xs italic text-muted-foreground">“{invite.message}”</p> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => handleAcceptInvite(invite)}>{t('accept')}</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectInvite(invite.id)}>{t('reject')}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sentInvites.filter((invite) => invite.status === 'pending').length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Sent invites</p>
                    <div className="mt-2 space-y-2">
                      {sentInvites.filter((invite) => invite.status === 'pending').map((invite) => (
                        <div key={invite.id} className="rounded-xl bg-background/85 px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{invite.to_display_name || invite.to_merchant_id}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{invite.purpose || t('generalCollaboration')}</p>
                            </div>
                            <Badge variant="outline">Waiting for recipient</Badge>
                          </div>
                          <div className="mt-3">
                            <Button size="sm" variant="outline" onClick={() => handleWithdrawInvite(invite.id)}>{t('withdraw')}</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            {selectedRelationship ? (
              <NetworkWorkspaceBoundary key={selectedRelationship.id}>
                <RelationshipWorkspace relationshipId={selectedRelationship.id} embedded />
              </NetworkWorkspaceBoundary>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-card text-sm text-muted-foreground">
                Select a relationship to open its workspace.
              </div>
            )}
          </div>
        </div>
      </section>

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
