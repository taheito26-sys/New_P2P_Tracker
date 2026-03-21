import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as api from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Users } from 'lucide-react';
import type { MerchantMessage } from '@/types/domain';

interface ConversationSummary {
  relationshipId: string;
  counterpartyName: string;
  counterpartyMerchantId: string;
  lastMessage: MerchantMessage | null;
  unreadCount: number;
}

export default function MessagesPage() {
  const { userId } = useAuth();
  const t = useT();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { relationships } = await api.relationships.list();
      const summaries = await Promise.all(relationships.map(async (relationship) => {
        const { messages } = await api.messages.list(relationship.id);
        return {
          relationshipId: relationship.id,
          counterpartyName: relationship.counterparty?.display_name || relationship.counterparty?.nickname || 'Unknown',
          counterpartyMerchantId: relationship.counterparty?.merchant_id || '',
          lastMessage: messages[messages.length - 1] || null,
          unreadCount: messages.filter((message) => !message.is_read && message.sender_user_id !== userId).length,
        };
      }));
      summaries.sort((a, b) => {
        const left = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
        const right = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
        return right - left;
      });
      setConversations(summaries);
    } catch {
      toast.error(t('failedLoadMessages'));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => { void reload(); }, [reload]);

  const totalUnread = useMemo(() => conversations.reduce((sum, convo) => sum + convo.unreadCount, 0), [conversations]);

  return (
    <div className="app-page-shell" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <div className="app-page-content space-y-4">
        <PageHeader title={t('messagesLabel')} description={`Open a relationship-centric thread in Network${totalUnread > 0 ? ` · ${totalUnread} ${t('unread')}` : ''}`} />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('noConversations')}</p>
            <p className="text-xs mt-1">{t('messagesAppear')}</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {conversations.map((convo) => (
              <Link key={convo.relationshipId} to={`/network?relationship=${encodeURIComponent(convo.relationshipId)}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{convo.counterpartyName}</p>
                          <Badge variant="outline" className="text-[10px] font-mono">{convo.counterpartyMerchantId}</Badge>
                          {convo.unreadCount > 0 && <Badge>{convo.unreadCount}</Badge>}
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {convo.lastMessage ? convo.lastMessage.body : t('noMessagesShort')}
                        </p>
                        {convo.lastMessage && <p className="mt-2 text-[11px] text-muted-foreground">{new Date(convo.lastMessage.created_at).toLocaleString()}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
