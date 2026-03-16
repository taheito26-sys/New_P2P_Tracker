import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { relationships as relApi, messages as msgApi, deals as dealsApi, approvals as approvalsApi, audit as auditApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Send, Users, Briefcase, DollarSign, CheckSquare, Shield, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { MerchantRelationship, MerchantMessage, MerchantDeal, MerchantApproval, AuditLog } from '@/types/domain';

export default function RelationshipWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useAuth();
  const [rel, setRel] = useState<MerchantRelationship | null>(null);
  const [msgs, setMsgs] = useState<MerchantMessage[]>([]);
  const [relDeals, setRelDeals] = useState<MerchantDeal[]>([]);
  const [relApprovals, setRelApprovals] = useState<MerchantApproval[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [r, m, d] = await Promise.all([
          relApi.get(id),
          msgApi.list(id),
          dealsApi.list(id),
        ]);
        setRel(r.relationship);
        setMsgs(m.messages);
        setRelDeals(d.deals);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !id) return;
    try {
      const { message } = await msgApi.send(id, msgInput.trim());
      setMsgs(prev => [...prev, message]);
      setMsgInput('');
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!rel) return <div className="p-6 text-center text-muted-foreground">Relationship not found</div>;

  return (
    <div>
      <PageHeader title={rel.counterparty?.display_name || 'Workspace'} description={`Merchant ID: ${rel.counterparty?.merchant_id} • Role: ${rel.my_role}`}>
        <Badge className={rel.status === 'active' ? 'bg-success text-success-foreground' : 'bg-warning text-warning-foreground'}>{rel.status}</Badge>
      </PageHeader>

      <div className="p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Deals" value={rel.summary?.totalDeals || 0} icon={Briefcase} />
          <StatCard label="Active Exposure" value={`$${(rel.summary?.activeExposure || 0).toLocaleString()}`} icon={DollarSign} />
          <StatCard label="Realized Profit" value={`$${(rel.summary?.realizedProfit || 0).toLocaleString()}`} icon={Users} />
          <StatCard label="Pending Approvals" value={rel.summary?.pendingApprovals || 0} icon={CheckSquare} />
        </div>

        {/* Workspace Tabs */}
        <Tabs defaultValue="messages">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card className="glass">
              <CardHeader><CardTitle className="text-sm font-display">Relationship Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{rel.relationship_type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Your Role</span><span>{rel.my_role}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Shared Fields</span><span>{rel.shared_fields?.join(', ') || 'All'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(rel.created_at).toLocaleDateString()}</span></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="mt-4">
            <Card className="glass">
              <CardContent className="p-0">
                <div className="h-80 overflow-y-auto p-4 space-y-3">
                  {msgs.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No messages yet</p>}
                  {msgs.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_user_id === userId ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                        msg.message_type === 'system'
                          ? 'bg-muted text-muted-foreground text-center w-full text-xs italic'
                          : msg.sender_user_id === userId
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {msg.message_type !== 'system' && <p className="text-[10px] font-mono opacity-70 mb-0.5">{msg.sender_name || msg.sender_merchant_id}</p>}
                        <p>{msg.body}</p>
                        <p className="text-[10px] opacity-50 mt-0.5">{new Date(msg.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="border-t p-3 flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  />
                  <Button onClick={sendMessage} size="icon"><Send className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deals" className="mt-4 space-y-3">
            {relDeals.length === 0 && <p className="text-center text-muted-foreground py-8">No deals in this relationship</p>}
            {relDeals.map(deal => (
              <Card key={deal.id} className="glass">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{deal.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{deal.deal_type}</Badge>
                        <Badge className={deal.status === 'active' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>{deal.status}</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold">${deal.amount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{deal.currency}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            <p className="text-center text-muted-foreground py-8">View approvals on the dedicated Approvals page</p>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <Card className="glass">
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>Analytics will populate as deals and settlements are recorded.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card className="glass">
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>Audit trail will display here once actions are performed.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
