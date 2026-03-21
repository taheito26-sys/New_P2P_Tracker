import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, Mail, AlertCircle, CheckSquare, MessageCircle, X } from 'lucide-react';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { DEAL_TYPE_CONFIGS } from '@/lib/deal-engine';
import type { MerchantApproval, MerchantDeal, MerchantInvite, MerchantMessage, MerchantRelationship } from '@/types/domain';

type NotificationAction = {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  onSelect: () => Promise<void> | void;
};

type NotificationItem = {
  id: string;
  kind: 'invite' | 'approval' | 'message';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description?: string;
  icon: React.ReactNode;
  actions?: NotificationAction[];
};

type UnreadConversation = {
  relationshipId: string;
  counterpartyName: string;
  unreadCount: number;
  latestMessage: MerchantMessage | null;
};

function actionButtonClass(variant: NotificationAction['variant'] = 'secondary') {
  if (variant === 'primary') {
    return 'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50';
  }
  if (variant === 'danger') {
    return 'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40';
  }
  return 'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium border border-border bg-background hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
}

async function waitForRelationship(counterpartyMerchantId: string, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { relationships } = await api.relationships.list();
    const relationship = relationships.find((rel) => rel.counterparty?.merchant_id === counterpartyMerchantId);
    if (relationship) return relationship;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  return null;
}

async function waitForRelationshipWorkspace(relationshipId: string, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await api.relationships.get(relationshipId);
      return true;
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 404) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        continue;
      }
      throw err;
    }
  }

  return false;
}

type ActivityCenterProps = {
  triggerLabel?: string;
  className?: string;
};

export default function ActivityCenter({ triggerLabel, className }: ActivityCenterProps) {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const t = useT();
  const isRTL = !!t.isRTL;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [invites, setInvites] = useState<MerchantInvite[]>([]);
  const [approvals, setApprovals] = useState<MerchantApproval[]>([]);
  const [deals, setDeals] = useState<MerchantDeal[]>([]);
  const [relationships, setRelationships] = useState<MerchantRelationship[]>([]);
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return fallback;
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      api.invites.inbox(),
      api.approvals.inbox(),
      api.deals.list(),
      api.relationships.list(),
    ]);

    const [invitesRes, approvalsRes, dealsRes, relsRes] = results;

    if (invitesRes.status === 'fulfilled') {
      setInvites(invitesRes.value.invites);
    } else {
      setInvites([]);
      setError(getErrorMessage(invitesRes.reason, 'Notifications could not be loaded'));
    }

    if (approvalsRes.status === 'fulfilled') {
      setApprovals(approvalsRes.value.approvals);
    } else {
      setApprovals([]);
      setError(prev => prev || getErrorMessage(approvalsRes.reason, 'Notifications could not be loaded'));
    }

    if (dealsRes.status === 'fulfilled') {
      setDeals(dealsRes.value.deals);
    } else {
      setDeals([]);
    }

    if (relsRes.status === 'fulfilled') {
      setRelationships(relsRes.value.relationships);
    } else {
      setRelationships([]);
    }

    if (relsRes.status === 'fulfilled') {
      const unreadResults = await Promise.allSettled(relsRes.value.relationships.map(async (relationship) => {
        const { messages } = await api.messages.list(relationship.id);
        const unread = messages.filter((message) => !message.is_read && message.sender_user_id !== userId);
        return {
          relationshipId: relationship.id,
          counterpartyName: relationship.counterparty?.display_name || relationship.counterparty?.nickname || 'Relationship',
          unreadCount: unread.length,
          latestMessage: unread[0] || null,
        };
      }));

      setUnreadConversations(unreadResults
        .filter((result): result is PromiseFulfilledResult<UnreadConversation> => result.status === 'fulfilled')
        .map((result) => result.value)
        .filter((conversation) => conversation.unreadCount > 0));
    } else {
      setUnreadConversations([]);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reload();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [reload]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    const firstFocusable = panelRef.current?.querySelector<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pendingInvites = useMemo(
    () => invites.filter(invite => invite.status === 'pending'),
    [invites]
  );

  const pendingApprovals = useMemo(
    () => approvals.filter(approval => approval.status === 'pending'),
    [approvals]
  );

  const relMap = useMemo(() => {
    const map: Record<string, MerchantRelationship> = {};
    relationships.forEach(rel => {
      map[rel.id] = rel;
    });
    return map;
  }, [relationships]);

  const groupedApprovalItems = useMemo(() => {
    const grouped = new Map<string, MerchantApproval[]>();
    const standalone: MerchantApproval[] = [];

    pendingApprovals.forEach(approval => {
      const dealId = approval.target_entity_type === 'deal' && approval.target_entity_id
        ? approval.target_entity_id
        : null;

      if (!dealId) {
        standalone.push(approval);
        return;
      }

      if (!grouped.has(dealId)) grouped.set(dealId, []);
      grouped.get(dealId)!.push(approval);
    });

    return { grouped, standalone };
  }, [pendingApprovals]);

  const runAction = useCallback(async (actionId: string, fn: () => Promise<void>) => {
    try {
      setBusyActionId(actionId);
      await fn();
      await reload();
    } finally {
      setBusyActionId(null);
    }
  }, [reload]);

  const items = useMemo<NotificationItem[]>(() => {
    const inviteItems: NotificationItem[] = pendingInvites.map(invite => ({
      id: `invite-${invite.id}`,
      kind: 'invite',
      priority: 'high',
      title: invite.from_display_name || t('invite'),
      description: `${invite.purpose} · ${invite.requested_role}`,
      icon: <Mail className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />,
      actions: [
        {
          id: `accept-invite-${invite.id}`,
          label: t('accept') || 'Accept',
          variant: 'primary',
          onSelect: () => runAction(`accept-invite-${invite.id}`, async () => {
            const response = await api.invites.accept(invite.id);
            console.info('[ActivityCenter] invite accepted', {
              inviteId: invite.id,
              relationshipId: response.relationship_id,
              counterpartyMerchantId: invite.from_merchant_id,
            });
            setAnnounce(`Invite accepted from ${invite.from_display_name}`);

            const targetRelationshipId = response.relationship_id || (await waitForRelationship(invite.from_merchant_id))?.id;
            if (targetRelationshipId) {
              await waitForRelationshipWorkspace(targetRelationshipId);
              navigate(`/network/relationships/${targetRelationshipId}`);
              setOpen(false);
            }
          }),
        },
        {
          id: `reject-invite-${invite.id}`,
          label: t('reject') || 'Reject',
          variant: 'danger',
          onSelect: () => runAction(`reject-invite-${invite.id}`, async () => {
            await api.invites.reject(invite.id);
            setAnnounce(`Invite rejected from ${invite.from_display_name}`);
          }),
        },
      ],
    }));

    const approvalItems: NotificationItem[] = [];

    groupedApprovalItems.grouped.forEach((group, dealId) => {
      const deal = deals.find(d => d.id === dealId);
      const rel = deal ? relMap[deal.relationship_id] : null;
      const cfg = deal ? DEAL_TYPE_CONFIGS[deal.deal_type] : null;

      const title = deal
        ? `${cfg?.label || deal.deal_type} · ${rel?.counterparty?.display_name || ''}`
        : t('pendingApprovals') || 'Pending approvals';

      const detailParts = group.map(approval => {
        const label = approval.type.replace(/_/g, ' ');
        const amount = approval.proposed_payload?.amount;
        return amount != null ? `${label} · $${Number(amount).toLocaleString()}` : label;
      });

      approvalItems.push({
        id: `approval-group-${dealId}`,
        kind: 'approval',
        priority: 'high',
        title,
        description: detailParts.join(' • '),
        icon: <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />,
        actions: [
          {
            id: `approve-group-${dealId}`,
            label: t('approve') || 'Approve',
            variant: 'primary',
            onSelect: () => runAction(`approve-group-${dealId}`, async () => {
              for (const approval of group) {
                await api.approvals.approve(approval.id);
              }
              setAnnounce(`Approvals completed for ${title}`);
            }),
          },
          {
            id: `reject-group-${dealId}`,
            label: t('reject') || 'Reject',
            variant: 'danger',
            onSelect: () => runAction(`reject-group-${dealId}`, async () => {
              for (const approval of group) {
                await api.approvals.reject(approval.id);
              }
              setAnnounce(`Approvals rejected for ${title}`);
            }),
          },
          {
            id: `open-group-${dealId}`,
            label: t('open') || 'Open',
            variant: 'secondary',
            onSelect: () => {
              if (rel?.id) navigate(`/network/relationships/${rel.id}`);
              setOpen(false);
            },
          },
        ],
      });
    });

    groupedApprovalItems.standalone.forEach(approval => {
      const title = approval.type.replace(/_/g, ' ');
      const description = `${approval.target_entity_type} · ${new Date(approval.submitted_at).toLocaleDateString()}`;

      approvalItems.push({
        id: `approval-${approval.id}`,
        kind: 'approval',
        priority: 'medium',
        title,
        description,
        icon: <CheckSquare className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />,
        actions: [
          {
            id: `approve-${approval.id}`,
            label: t('approve') || 'Approve',
            variant: 'primary',
            onSelect: () => runAction(`approve-${approval.id}`, async () => {
              await api.approvals.approve(approval.id);
              setAnnounce(`Approval completed for ${title}`);
            }),
          },
          {
            id: `reject-${approval.id}`,
            label: t('reject') || 'Reject',
            variant: 'danger',
            onSelect: () => runAction(`reject-${approval.id}`, async () => {
              await api.approvals.reject(approval.id);
              setAnnounce(`Approval rejected for ${title}`);
            }),
          },
        ],
      });
    });

    const messageItems: NotificationItem[] = unreadConversations.map((conversation) => ({
      id: `message-${conversation.relationshipId}`,
      kind: 'message',
      priority: 'medium',
      title: `${conversation.counterpartyName} · ${conversation.unreadCount} unread`,
      description: conversation.latestMessage?.body || (t('unreadMessages') || 'Unread messages'),
      icon: <MessageCircle className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />,
      actions: [
        {
          id: `open-message-${conversation.relationshipId}`,
          label: t('open') || 'Open',
          variant: 'secondary',
          onSelect: () => {
            navigate(`/network/relationships/${conversation.relationshipId}`);
            setOpen(false);
          },
        },
      ],
    }));

    return [...messageItems, ...inviteItems, ...approvalItems];
  }, [pendingInvites, groupedApprovalItems, deals, relMap, navigate, runAction, t, unreadConversations]);

  const unreadCount = items.length;
  void userId;

  return (
    <div className="relative shrink-0" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <button
        ref={buttonRef}
        type="button"
        aria-label={triggerLabel || 'Activity'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="global-activity-panel"
        onClick={() => setOpen(prev => !prev)}
        className={[
          'relative inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          className || '',
        ].join(' ').trim()}
      >
        <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
        {triggerLabel ? <span className="text-sm font-medium text-foreground">{triggerLabel}</span> : null}
        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-medium text-foreground">
          {unreadCount}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="global-activity-panel"
          role="dialog"
          aria-label={triggerLabel || 'Activity'}
          className={[
            'absolute z-50 mt-2 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-xl',
            isRTL ? 'left-0' : 'right-0',
            'max-md:fixed max-md:left-2 max-md:right-2 max-md:top-14 max-md:w-auto',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{triggerLabel || 'Activity'}</p>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} pending` : (t('noPendingActions') || 'No pending actions')}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium border border-border bg-background hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => {
                  setAnnounce('Activity refreshed');
                  void reload();
                }}
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {t('refresh') || 'Refresh'}
              </button>

              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                aria-label={t('close') || 'Close'}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t('loading') || 'Loading'}</span>
              </div>
            ) : error ? (
              <div className="px-4 py-4 text-sm text-destructive">{error}</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('noPendingActions') || 'No pending actions'}
              </div>
            ) : (
              <ul className="divide-y divide-border" role="list">
                {items.map(item => (
                  <li key={item.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{item.icon}</div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                        )}

                        {item.actions?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.actions.map(action => {
                              const busy = busyActionId === action.id;
                              return (
                                <button
                                  key={action.id}
                                  type="button"
                                  className={actionButtonClass(action.variant)}
                                  onClick={() => void action.onSelect()}
                                  disabled={busy}
                                >
                                  {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                                  {action.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
