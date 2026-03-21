import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  invitesInbox: vi.fn(),
  approvalsInbox: vi.fn(),
  approvalsSent: vi.fn(),
  dealsList: vi.fn(),
  relationshipsList: vi.fn(),
  messagesList: vi.fn(),
  t: Object.assign((key: string) => {
    const labels: Record<string, string> = {
      noPendingActions: 'No pending actions',
      awaitingCounterpartyApproval: 'Awaiting counterparty approval',
      open: 'Open',
      refresh: 'Refresh',
      partner: 'Partner',
    };
    return labels[key] || key;
  }, { isRTL: false }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/lib/api', () => ({
  invites: { inbox: (...args: unknown[]) => mocks.invitesInbox(...args), accept: vi.fn(), reject: vi.fn() },
  approvals: {
    inbox: (...args: unknown[]) => mocks.approvalsInbox(...args),
    sent: (...args: unknown[]) => mocks.approvalsSent(...args),
    approve: vi.fn(),
    reject: vi.fn(),
  },
  deals: { list: (...args: unknown[]) => mocks.dealsList(...args) },
  relationships: { list: (...args: unknown[]) => mocks.relationshipsList(...args), get: vi.fn() },
  messages: { list: (...args: unknown[]) => mocks.messagesList(...args) },
  ApiError: class MockApiError extends Error { status = 404; },
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ userId: 'user_1', isAuthenticated: true }) }));
vi.mock('@/lib/i18n', () => ({ useT: () => mocks.t }));

import ActivityCenter from '@/components/notifications/ActivityCenter';

describe('ActivityCenter', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
    });

    mocks.invitesInbox.mockResolvedValue({ invites: [] });
    mocks.approvalsInbox.mockResolvedValue({ approvals: [] });
    mocks.approvalsSent.mockResolvedValue({
      approvals: [{
        id: 'apr_1',
        relationship_id: 'rel_1',
        type: 'deal_create',
        target_entity_type: 'deal',
        target_entity_id: 'deal_1',
        proposed_payload: {},
        status: 'pending',
        submitted_by_user_id: 'user_1',
        submitted_by_merchant_id: 'merchant_1',
        reviewer_user_id: 'user_2',
        resolution_note: null,
        submitted_at: '2026-03-21T00:00:00.000Z',
        resolved_at: null,
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      }],
    });
    mocks.dealsList.mockResolvedValue({
      deals: [{
        id: 'deal_1',
        relationship_id: 'rel_1',
        deal_type: 'partnership',
        title: 'Profit Share',
        amount: 1820,
        currency: 'USDT',
        status: 'pending',
        metadata: {},
        issue_date: '2026-03-21',
        due_date: null,
        close_date: null,
        expected_return: null,
        created_by: 'user_1',
        realized_pnl: 0,
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      }],
    });
    mocks.relationshipsList.mockResolvedValue({
      relationships: [{
        id: 'rel_1',
        merchant_a_id: 'merchant_1',
        merchant_b_id: 'merchant_2',
        invite_id: null,
        relationship_type: 'general',
        status: 'active',
        shared_fields: [],
        approval_policy: {},
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
        counterparty: { merchant_id: 'merchant_2', display_name: 'Ahmed Saleh', nickname: 'Ahmed' },
        my_role: 'owner',
        summary: { activeDeals: 0, pendingApprovals: 1, unreadMessages: 0, exposure: 0 },
      }],
    });
    mocks.messagesList.mockResolvedValue({ messages: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('counts outgoing pending approvals in the badge and panel', async () => {
    render(<ActivityCenter triggerLabel="Activity" />);

    expect(await screen.findByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

    expect(await screen.findByText(/Awaiting counterparty approval/i)).toBeInTheDocument();
    expect(screen.getByText(/Profit Share/i)).toBeInTheDocument();
  });
});
