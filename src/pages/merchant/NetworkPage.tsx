import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { merchant as merchantApi, invites as invitesApi, relationships as relApi, approvals as approvalsApi } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Search, UserPlus, Check, X, RotateCcw, Mail, Users,
  ExternalLink, CheckSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantSearchResult, MerchantInvite, MerchantRelationship, MerchantApproval } from '@/types/domain';

const inviteStatusColors: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  accepted: 'bg-success text-success-foreground',
  rejected: 'bg-destructive text-destructive-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
  expired: 'bg-muted text-muted-foreground',
};

const relStatusColors: Record<string, string> = {
  active: 'bg-success text-success-foreground',
  restricted: 'bg-warning text-warning-foreground',
  suspended: 'bg-destructive text-destructive-foreground',
  terminated: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};

const approvalStatusColors: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  approved: 'bg-success text-success-foreground',
  rejected: 'bg-destructive text-destructive-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  expired: 'bg-muted text-muted-foreground',
};

export default function NetworkPage() {
  // Directory
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MerchantSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Invitations
  const [inbox, setInbox] = useState<MerchantInvite[]>([]);
  const [sent, setSent] = useState<MerchantInvite[]>([]);
  const [invLoading, setInvLoading] = useState(true);

  // Relationships
  const [rels, setRels] = useState<MerchantRelationship[]>([]);
  const [relLoading, setRelLoading] = useState(true);

  // Approvals
  const [aprInbox, setAprInbox] = useState<MerchantApproval[]>([]);
  const [aprSent, setAprSent] = useState<MerchantApproval[]>([]);
  const [aprLoading, setAprLoading] = useState(true);

  const loadInvites = async () => {
    setInvLoading(true);
    try {
      const [i, s] = await Promise.all([invitesApi.inbox(), invitesApi.sent()]);
      setInbox(i.invites);
      setSent(s.invites);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load invites');
    } finally {
      setInvLoading(false);
    }
  };

  const loadRels = async () => {
    setRelLoading(true);
    try {
      const { relationships } = await relApi.list();
      setRels(relationships);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load relationships');
    } finally {
      setRelLoading(false);
    }
  };

  const loadApprovals = async () => {
    setAprLoading(true);
    try {
      const [i, s] = await Promise.all([approvalsApi.inbox(), approvalsApi.sent()]);
      setAprInbox(i.approvals);
      setAprSent(s.approvals);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAprLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
    loadRels();
    loadApprovals();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length < 2) { toast.error('Enter at least 2 characters'); return; }
    setSearchLoading(true);
    try {
      const { results: r } = await merchantApi.search(query);
      setResults(r);
      setSearched(true);
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAcceptInvite = async (id: string) => {
    try { await invitesApi.accept(id); toast.success('Invite accepted!'); loadInvites(); loadRels(); } catch (err: any) { toast.error(err.message); }
  };
  const handleRejectInvite = async (id: string) => {
    try { await invitesApi.reject(id); toast.success('Invite rejected'); loadInvites(); } catch (err: any) { toast.error(err.message); }
  };
  const handleWithdrawInvite = async (id: string) => {
    try { await invitesApi.withdraw(id); toast.success('Invite withdrawn'); loadInvites(); } catch (err: any) { toast.error(err.message); }
  };
  const handleApprove = async (id: string) => {
    try { await approvalsApi.approve(id); toast.success('Approved'); loadApprovals(); } catch (err: any) { toast.error(err.message); }
  };
  const handleReject = async (id: string) => {
    try { await approvalsApi.reject(id); toast.success('Rejected'); loadApprovals(); } catch (err: any) { toast.error(err.message); }
  };

  const pendingInvites = inbox.filter(i => i.status === 'pending').length;
  const pendingApprovals = aprInbox.filter(a => a.status === 'pending').length;

  return (
    <div>
      <PageHeader title="Network" description="Directory, invitations, relationships & approvals" />
      <div className="p-6">
        <Tabs defaultValue="directory">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="directory">
              <Search className="w-3.5 h-3.5 mr-1.5" /> Directory
            </TabsTrigger>
            <TabsTrigger value="invitations">
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Invites
              {pendingInvites > 0 && <Badge className="ml-1.5 bg-warning text-warning-foreground text-[10px] px-1.5 py-0">{pendingInvites}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="relationships">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Relationships
            </TabsTrigger>
            <TabsTrigger value="approvals">
              <CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Approvals
              {pendingApprovals > 0 && <Badge className="ml-1.5 bg-warning text-warning-foreground text-[10px] px-1.5 py-0">{pendingApprovals}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ── DIRECTORY ── */}
          <TabsContent value="directory" className="mt-4 space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by Merchant ID, nickname, or name..." value={query} onChange={e => setQuery(e.target.value)} className="pl-10" />
              </div>
              <Button type="submit" disabled={searchLoading}>
                {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </Button>
            </form>
            {searched && results.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No merchants found matching "{query}"</p>
              </div>
            )}
            <div className="grid gap-3">
              {results.map(r => (
                <Card key={r.id} className="glass hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{r.display_name}</p>
                        <Badge variant="outline" className="font-mono text-xs">{r.merchant_type}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-mono text-primary">{r.merchant_id}</span>
                        <span className="text-xs text-muted-foreground">@{r.nickname}</span>
                        {r.region && <span className="text-xs text-muted-foreground">{r.region}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1"><UserPlus className="w-3.5 h-3.5" /> Invite</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── INVITATIONS ── */}
          <TabsContent value="invitations" className="mt-4">
            <Tabs defaultValue="inv-inbox">
              <TabsList>
                <TabsTrigger value="inv-inbox">Inbox ({inbox.length})</TabsTrigger>
                <TabsTrigger value="inv-sent">Sent ({sent.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="inv-inbox" className="mt-3 space-y-3">
                {invLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
                {!invLoading && inbox.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No invitations in your inbox</p>
                  </div>
                )}
                {inbox.map(inv => (
                  <Card key={inv.id} className="glass">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{inv.from_display_name}</p>
                          <Badge className={inviteStatusColors[inv.status]}>{inv.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {inv.purpose && <span>{inv.purpose} • </span>}
                          Role: {inv.requested_role} • From: @{inv.from_nickname}
                        </p>
                        {inv.message && <p className="text-sm mt-2 text-muted-foreground italic">"{inv.message}"</p>}
                      </div>
                      {inv.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAcceptInvite(inv.id)} className="gap-1"><Check className="w-3.5 h-3.5" /> Accept</Button>
                          <Button size="sm" variant="outline" onClick={() => handleRejectInvite(inv.id)} className="gap-1"><X className="w-3.5 h-3.5" /> Reject</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="inv-sent" className="mt-3 space-y-3">
                {!invLoading && sent.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No sent invitations</p>
                  </div>
                )}
                {sent.map(inv => (
                  <Card key={inv.id} className="glass">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">To: {inv.to_display_name || inv.to_merchant_id}</p>
                          <Badge className={inviteStatusColors[inv.status]}>{inv.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{inv.purpose || 'General collaboration'}</p>
                      </div>
                      {inv.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => handleWithdrawInvite(inv.id)} className="gap-1">
                          <RotateCcw className="w-3.5 h-3.5" /> Withdraw
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ── RELATIONSHIPS ── */}
          <TabsContent value="relationships" className="mt-4 space-y-3">
            {relLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
            {!relLoading && rels.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No relationships yet</p>
                <p className="text-xs mt-1">Accept an invite or send one from the Directory to start collaborating.</p>
              </div>
            )}
            {rels.map(rel => (
              <Link key={rel.id} to={`/network/relationships/${rel.id}`}>
                <Card className="glass hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{rel.counterparty?.display_name || 'Unknown'}</p>
                        <Badge className={relStatusColors[rel.status]}>{rel.status}</Badge>
                        <Badge variant="outline" className="font-mono text-xs">{rel.relationship_type}</Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>ID: {rel.counterparty?.merchant_id}</span>
                        <span>Role: {rel.my_role}</span>
                        {rel.summary && (
                          <>
                            <span>{rel.summary.totalDeals} deals</span>
                            <span>Exposure: ${rel.summary.activeExposure.toLocaleString()}</span>
                            {rel.summary.pendingApprovals > 0 && (
                              <Badge className="bg-warning text-warning-foreground text-[10px]">
                                {rel.summary.pendingApprovals} pending
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </TabsContent>

          {/* ── APPROVALS ── */}
          <TabsContent value="approvals" className="mt-4">
            <Tabs defaultValue="apr-inbox">
              <TabsList>
                <TabsTrigger value="apr-inbox">To Review ({aprInbox.filter(a => a.status === 'pending').length})</TabsTrigger>
                <TabsTrigger value="apr-sent">Submitted ({aprSent.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="apr-inbox" className="mt-3 space-y-3">
                {aprLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}
                {!aprLoading && aprInbox.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>No approvals to review</p>
                  </div>
                )}
                {aprInbox.map(a => (
                  <Card key={a.id} className="glass">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{a.type.replace(/_/g, ' ')}</p>
                          <Badge className={approvalStatusColors[a.status]}>{a.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Target: {a.target_entity_type} • Submitted: {new Date(a.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                      {a.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(a.id)} className="gap-1"><Check className="w-3.5 h-3.5" /> Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => handleReject(a.id)} className="gap-1"><X className="w-3.5 h-3.5" /> Reject</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
              <TabsContent value="apr-sent" className="mt-3 space-y-3">
                {aprSent.map(a => (
                  <Card key={a.id} className="glass">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{a.type.replace(/_/g, ' ')}</p>
                          <Badge className={approvalStatusColors[a.status]}>{a.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Submitted: {new Date(a.submitted_at).toLocaleDateString()}
                          {a.resolution_note && ` • Note: ${a.resolution_note}`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
