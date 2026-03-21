import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRealtimeRefresh } from '@/hooks/use-realtime';
import { DEAL_TYPE_CONFIGS } from '@/lib/deal-engine';
import { normalizeDealStatus } from '@/lib/merchant-deal-status';
import {
  Loader2, Search, UserPlus, X, RotateCcw, Users,
  MessageCircle, Briefcase,
  DollarSign, ArrowRight, ArrowUpRight, Send, Filter,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantSearchResult, MerchantInvite, MerchantRelationship, MerchantApproval, MerchantDeal } from '@/types/domain';

/* ─── Helpers ─── */
function dealStatusStyle(status: string) {
  switch (status) {
    case 'approved': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30';
    case 'pending': return 'bg-amber-500/10 text-amber-600 border border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border border-border';
  }
}

type DealFilter = 'all' | 'pending' | 'approved';

/* ═══════════════════════════════════════════════════════════
   NETWORK PAGE — Deals Dashboard (no sidebar)
   Merchants = navigable chips → click opens workspace
   Deals = full-width table, the primary content
   Invitations/Approvals = bell dropdown (rare events)
   ═══════════════════════════════════════════════════════════ */
export default function NetworkPage() {
  const { userId } = useAuth();
  const t = useT();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MerchantSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inbox, setInbox] = useState<MerchantInvite[]>([]);
  const [rels, setRels] = useState<MerchantRelationship[]>([]);
  const [allDeals, setAllDeals] = useState<MerchantDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealFilter, setDealFilter] = useState<DealFilter>('all');
  const [loadErrors, setLoadErrors] = useState<{
    invitesInbox: string | null;
    relationships: string | null;
    deals: string | null;
    unreadMessages: string | null;
  }>({
    invitesInbox: null,
    relationships: null,
    deals: null,
    unreadMessages: null,
  });

  // Invite dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<MerchantSearchResult | null>(null);
  const [inviteForm, setInviteForm] = useState({ purpose: '', role: 'partner', message: '' });

  // Unread messages per relationship (lightweight — just counts, no full message load)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return fallback;
  };

  const reload = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.invites.inbox(),
      api.relationships.list(),
      api.deals.list(),
    ]);

    const nextErrors = {
      invitesInbox: null as string | null,
      relationships: null as string | null,
      deals: null as string | null,
      unreadMessages: null as string | null,
    };

    const [inboxRes, relationshipsRes, dealsRes] = results;

    if (inboxRes.status === 'fulfilled') {
      setInbox(inboxRes.value.invites);
    } else {
      const message = getErrorMessage(inboxRes.reason, 'Invites inbox could not be loaded');
      console.error('[NetworkPage] failed to load invites inbox', inboxRes.reason);
      setInbox([]);
      nextErrors.invitesInbox = message;
      toast.error(message);
    }


    const loadedRelationships = relationshipsRes.status === 'fulfilled' ? relationshipsRes.value.relationships : [];
    if (relationshipsRes.status === 'fulfilled') {
      setRels(loadedRelationships);
    } else {
      const message = getErrorMessage(relationshipsRes.reason, 'Relationships data could not be loaded');
      console.error('[NetworkPage] failed to load relationships', relationshipsRes.reason);
      setRels([]);
      nextErrors.relationships = message;
      toast.error(message);
    }


    if (dealsRes.status === 'fulfilled') {
      setAllDeals(dealsRes.value.deals);
    } else {
      const message = getErrorMessage(dealsRes.reason, 'Deals data could not be loaded');
      console.error('[NetworkPage] failed to load deals', dealsRes.reason);
      setAllDeals([]);
      nextErrors.deals = message;
      toast.error(message);
    }

    const uMap: Record<string, number> = {};
    const unreadResults = await Promise.allSettled(loadedRelationships.map(async (rel) => {
      const { messages } = await api.messages.list(rel.id);
      return {
        relationshipId: rel.id,
        unread: messages.filter(m => !m.is_read && m.sender_user_id !== userId).length,
      };
    }));

    unreadResults.forEach((result, index) => {
      const relId = loadedRelationships[index]?.id;
      if (!relId) return;
      if (result.status === 'fulfilled') {
        uMap[relId] = result.value.unread;
      } else {
        console.error('[NetworkPage] failed to load unread messages', { relationshipId: relId, error: result.reason });
        uMap[relId] = 0;
        nextErrors.unreadMessages = nextErrors.unreadMessages || 'Unread message counts could not be loaded for some relationships';
      }
    });
    setUnreadMap(uMap);

    setLoadErrors(nextErrors);
    setLoading(false);
  }, [t, userId]);

  useEffect(() => { reload(); }, [reload]);
  useRealtimeRefresh(reload, ['new_message', 'new_invite', 'invite_update', 'approval_update', 'deal_update']);

  // Auto-redirect to workspace if only one relationship
  useEffect(() => {
    if (!loading && rels.length === 1 && inbox.filter(i => i.status === 'pending').length === 0) {
      navigate(`/network/relationships/${rels[0].id}`, { replace: true });
    }
  }, [loading, rels, inbox, navigate]);

  /* ─── Handlers ─── */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length < 2) { toast.error(t('enterMin2Chars')); return; }
    try {
      const res = await api.merchant.search(query);
      setResults(res.results);
      setSearched(true);
      setSearchOpen(true);
    } catch (err: any) { toast.error(err.message); }
  };
  const openInviteDialog = (m: MerchantSearchResult) => { setInviteTarget(m); setInviteForm({ purpose: '', role: 'partner', message: '' }); setInviteDialogOpen(true); };
  const handleSendInvite = async () => {
    if (!inviteTarget) return;

    try {
      const sendInvite =
        typeof api.invites.send === 'function'
          ? api.invites.send
          : typeof api.invites.create === 'function'
            ? api.invites.create
            : null;

      if (!sendInvite) {
        throw new Error('Invite API client is out of sync. Missing invites.send/create');
      }

      await sendInvite({
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
  const handleWithdraw = async (id: string) => { try { await api.invites.withdraw(id); toast.success(t('inviteWithdrawn')); await reload(); } catch (err: any) { toast.error(err.message); } };

  /* ─── Derived ─── */
  const totalUnread = Object.values(unreadMap).reduce((s, n) => s + n, 0);
  const pendingDeals = allDeals.filter(d => d.status === 'pending');
  const activeDeals = allDeals.filter(d => d.status === 'approved');

  const filteredDeals = useMemo(() => {
    if (dealFilter === 'all') return allDeals;
    return allDeals.filter(d => normalizeDealStatus(d.status) === dealFilter);
  }, [allDeals, dealFilter]);

  const summary = useMemo(() => {
    const vol = allDeals.reduce((s, d) => s + d.amount, 0);
    const pnl = allDeals.reduce((s, d) => s + (d.realized_pnl ?? 0), 0);
    const incoming = allDeals.filter(d => d.created_by !== userId).length;
    const outcome = allDeals.filter(d => d.created_by === userId).length;
    return { vol, pnl, active: activeDeals.length, pending: pendingDeals.length, incoming, outcome };
  }, [allDeals, activeDeals, pendingDeals, userId]);

  // Lookup: deal → relationship → counterparty name
  const relMap = useMemo(() => {
    const m: Record<string, MerchantRelationship> = {};
    rels.forEach(r => { m[r.id] = r; });
    return m;
  }, [rels]);

  if (loading) return (
    <div className="flex h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Briefcase className="w-5 h-5 text-primary" /></div>
          <Loader2 className="absolute -top-1 -right-1 w-4 h-4 animate-spin text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">{t('networkTitle')}</p>
      </div>
    </div>
  );

  return (
    <div dir={t.isRTL ? 'rtl' : 'ltr'} className="mx-1 my-1 flex min-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-border/50 bg-card md:h-[calc(100vh-3.5rem)]">

      {/* ─── TOP BAR ─── */}
      <div className="shrink-0 flex flex-wrap items-start gap-2.5 border-b border-border bg-card px-3 py-3 sm:px-4 md:min-h-12 md:items-center md:py-2">
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
          <Briefcase className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="shrink-0">
          <h1 className="text-[13px] font-medium leading-tight">{t('networkTitle')}</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">{rels.length} partners · {allDeals.length} deals</p>
        </div>
        <div className="flex-1" />

        {/* Merchant chips — each is a link to workspace */}
        <div className="order-4 flex w-full flex-wrap items-center gap-1.5 md:order-none md:w-auto">
          {rels.map(rel => {
            const name = rel.counterparty?.display_name || 'Unknown';
            const hasUnread = (unreadMap[rel.id] || 0) > 0;
            return (
              <button
                key={rel.id}
                onClick={() => navigate(`/network/relationships/${rel.id}`)}
                className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border hover:border-blue-500/50 hover:bg-blue-500/5 transition-all relative group"
              >
                <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-[11px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate text-[12px] font-medium">{name}</span>
                <ArrowUpRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                {hasUnread && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 border border-card" />
                )}
              </button>
            );
          })}
        </div>


        {/* Search / Add partner */}
        <form onSubmit={handleSearch} className="relative order-3 w-full md:order-none md:w-auto">
          <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 text-[12px] text-muted-foreground md:min-w-[180px]">
            <Search className="w-[13px] h-[13px] opacity-50 shrink-0" />
            <input
              placeholder="Add partner..."
              value={query}
              onChange={e => { setQuery(e.target.value); if (!e.target.value) { setSearched(false); setSearchOpen(false); } }}
              className="bg-transparent border-0 outline-none w-full text-foreground placeholder:text-muted-foreground text-[12px]"
            />
          </div>
        </form>
      </div>

      {/* Search results dropdown */}
      {searched && searchOpen && results.length > 0 && (
        <div className="absolute right-2 top-16 z-50 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-xl md:right-4 md:top-14">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{results.length} {t('searchResults')}</p>
            <button onClick={() => { setSearchOpen(false); setSearched(false); setQuery(''); }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {results.map(r => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.display_name}</p>
                  <p className="text-[10px] text-muted-foreground">@{r.nickname} · {r.region} · <span className="font-mono">{r.merchant_id}</span></p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1 h-7 text-xs rounded-lg ml-2" onClick={() => { openInviteDialog(r); setSearchOpen(false); }}>
                  <UserPlus className="w-3 h-3" /> {t('invite')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── KPI STRIP ─── */}
      {(loadErrors.deals || loadErrors.relationships || loadErrors.invitesInbox || loadErrors.unreadMessages) && (
        <div className="shrink-0 border-b border-border px-3 py-2 lg:px-4 space-y-2">
          {loadErrors.deals && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">Deals data could not be loaded. {loadErrors.deals}</div>}
          {loadErrors.relationships && <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Relationships data could not be loaded. Merchant labels and workspace links may be incomplete.</div>}
          {loadErrors.invitesInbox && <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Invites inbox could not be loaded.</div>}
          {loadErrors.unreadMessages && <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">{loadErrors.unreadMessages}</div>}
        </div>
      )}
      <div className="shrink-0 grid grid-cols-2 gap-2 border-b border-border px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:px-4">
        <div className="px-3 py-2 rounded-lg bg-blue-500/10">
          <p className="text-[11px] text-blue-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Incoming</p>
          <p className="text-xl font-medium leading-tight mt-0.5 text-blue-600">{summary.incoming}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-emerald-500/10">
          <p className="text-[11px] text-emerald-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Outcome</p>
          <p className="text-xl font-medium leading-tight mt-0.5 text-emerald-600">{summary.outcome}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">{t('activeDeals')}</p>
          <p className="text-xl font-medium leading-tight mt-0.5">{summary.active}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">Pending deals</p>
          <p className="text-xl font-medium leading-tight mt-0.5">{summary.pending}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">Volume</p>
          <p className="text-xl font-medium leading-tight mt-0.5 font-mono">${summary.vol.toLocaleString()}</p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-secondary">
          <p className="text-[11px] text-muted-foreground">Net P&L</p>
          <p className={`text-xl font-medium leading-tight mt-0.5 font-mono ${summary.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {summary.pnl >= 0 ? '+' : ''}${summary.pnl.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ─── FILTER BAR ─── */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 lg:px-4">
        <Filter className="w-[13px] h-[13px] text-muted-foreground shrink-0" />
        {(['all', 'pending', 'approved'] as DealFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setDealFilter(f)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors capitalize ${
              dealFilter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? `All (${allDeals.length})` : `${f} (${allDeals.filter(d => normalizeDealStatus(d.status) === f).length})`}
          </button>
        ))}
      </div>

      {/* ─── DEALS TABLE (full width, the main content) ─── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredDeals.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3">
              <Briefcase className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('noDeals')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-secondary sticky top-0 z-[1]">
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Deal</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Direction</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Merchant</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dates</th>
                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-right px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map(deal => {
                const cfg = DEAL_TYPE_CONFIGS[deal.deal_type];
                const rel = relMap[deal.relationship_id];
                const cpName = rel?.counterparty?.display_name || (loadErrors.relationships ? 'Relationship unavailable' : '—');
                const net = deal.realized_pnl ?? 0;
                const isIncoming = deal.created_by !== userId;
                return (
                  <tr
                    key={deal.id}
                    className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer relative group"
                    onClick={() => rel && navigate(`/network/relationships/${rel.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 ${
                          deal.status === 'approved' ? 'bg-emerald-500/10' : 'bg-secondary'
                        }`}>
                          {cfg?.icon || '📋'}
                        </div>
                        <div>
                          <p className="font-medium">{cfg?.label || deal.deal_type}</p>
                          <p className="text-[11px] text-muted-foreground">{deal.title || deal.id.slice(0, 12)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {isIncoming ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          <TrendingDown className="w-3 h-3" /> Incoming
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <TrendingUp className="w-3 h-3" /> Outcome
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                          {cpName.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{cpName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${dealStatusStyle(normalizeDealStatus(deal.status))}`}>{normalizeDealStatus(deal.status)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                      {deal.issue_date}{deal.due_date ? ` → ${deal.due_date}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium">${deal.amount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {net !== 0 ? (
                        <span className={net >= 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                          {net >= 0 ? '+' : ''}${net.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ─── INVITE DIALOG ─── */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><UserPlus className="w-4 h-4 text-blue-600" /></div>
              {t('sendInviteTo')} {inviteTarget?.display_name}
            </DialogTitle>
            <DialogDescription>
              Send a collaboration invitation with a role and optional note for the selected merchant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('purpose')}</Label>
              <Input placeholder={t('purposePlaceholder')} value={inviteForm.purpose} onChange={e => setInviteForm(f => ({ ...f, purpose: e.target.value }))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('requestedRole')}</Label>
              <Select value={inviteForm.role} onValueChange={v => setInviteForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">{t('partner')}</SelectItem>
                  <SelectItem value="lender">{t('lender')}</SelectItem>
                  <SelectItem value="borrower">{t('borrower')}</SelectItem>
                  <SelectItem value="operator">{t('operator')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('messageOptional')}</Label>
              <Textarea placeholder={t('addANote')} value={inviteForm.message} onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))} rows={3} className="rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)} className="rounded-lg">{t('cancel')}</Button>
            <Button onClick={handleSendInvite} className="rounded-lg gap-1.5"><Send className="w-3.5 h-3.5" /> {t('sendInvite')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
