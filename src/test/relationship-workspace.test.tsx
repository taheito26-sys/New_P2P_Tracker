import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    MockApiError,
    relationshipsGet: vi.fn(),
    messagesList: vi.fn(),
    approvalsInbox: vi.fn(),
    approvalsSent: vi.fn(),
    dealsList: vi.fn(),
    markRead: vi.fn(),
    t: Object.assign((key: string) => key, { isRTL: false }),
  };
});

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: 'rel_missing' }), useNavigate: () => vi.fn() }));
vi.mock('@/lib/api', () => ({
  ApiError: mocks.MockApiError,
  relationships: { get: (...args: unknown[]) => mocks.relationshipsGet(...args) },
  messages: { list: (...args: unknown[]) => mocks.messagesList(...args), markRead: (...args: unknown[]) => mocks.markRead(...args), send: vi.fn() },
  approvals: { inbox: (...args: unknown[]) => mocks.approvalsInbox(...args), sent: (...args: unknown[]) => mocks.approvalsSent(...args), approve: vi.fn(), reject: vi.fn() },
  deals: { list: (...args: unknown[]) => mocks.dealsList(...args), update: vi.fn(), submitSettlement: vi.fn(), recordProfit: vi.fn(), close: vi.fn() },
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ userId: 'user_1', isAuthenticated: true }) }));
vi.mock('@/lib/i18n', () => ({ useT: () => mocks.t }));
vi.mock('@/lib/tracker-demo-data', () => ({ createTrackerState: () => ({ state: { customers: [], batches: [] } }) }));
vi.mock('@/lib/theme-context', () => ({ useTheme: () => ({ settings: { lowStockThreshold: 1, priceAlertThreshold: 1, range: '7d', currency: 'QAR' } }) }));
vi.mock('@/hooks/use-realtime', () => ({ useRealtimeRefresh: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/tooltip', () => ({ Tooltip: ({ children }: any) => <>{children}</>, TooltipContent: ({ children }: any) => <>{children}</>, TooltipTrigger: ({ children }: any) => <>{children}</>, TooltipProvider: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children }: any) => <label>{children}</label> }));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: any) => <textarea {...props} /> }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ children }: any) => <div>{children}</div>, DialogContent: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/deals/CreateDealDialog', () => ({ CreateDealDialog: () => null }));

import RelationshipWorkspace from '@/pages/merchant/RelationshipWorkspace';

describe('RelationshipWorkspace', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        value.mockReset();
      }
    });
    mocks.relationshipsGet.mockRejectedValue(new mocks.MockApiError(404, 'Relationship not found'));
  });

  it('shows honest 404 messaging instead of availability delay text', async () => {
    render(<RelationshipWorkspace />);

    expect(await screen.findByText('This relationship could not be opened.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
  }, 7000);

  it('shows deal detail fields and incoming approval actions in the workspace', async () => {
    mocks.relationshipsGet.mockResolvedValue({
      relationship: {
        id: 'rel_1',
        merchant_a_id: 'merchant_a',
        merchant_b_id: 'merchant_b',
        invite_id: null,
        relationship_type: 'general',
        status: 'active',
        shared_fields: [],
        approval_policy: {},
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
        counterparty: { merchant_id: 'merchant_b', display_name: 'Taho', nickname: 'Taho' },
        my_role: 'owner',
        summary: { totalDeals: 1, activeExposure: 1820, realizedProfit: 0, pendingApprovals: 1 },
      },
    });
    mocks.messagesList.mockResolvedValue({ messages: [] });
    mocks.dealsList.mockResolvedValue({
      deals: [{
        id: 'deal_1',
        relationship_id: 'rel_1',
        deal_type: 'partnership',
        title: 'Profit Share',
        amount: 1820,
        currency: 'USD',
        status: 'pending',
        metadata: { partner_ratio: 50, merchant_ratio: 50, margin_pct: 12.5 },
        issue_date: '2026-03-21T00:00:00.000Z',
        due_date: null,
        close_date: null,
        expected_return: 225,
        realized_pnl: null,
        created_by: 'user_2',
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      }],
    });
    mocks.approvalsInbox.mockResolvedValue({
      approvals: [{
        id: 'approval_1',
        relationship_id: 'rel_1',
        target_entity_type: 'deal',
        target_entity_id: 'deal_1',
        type: 'deal_create',
        status: 'pending',
        proposed_payload: {},
        submitted_by_user_id: 'user_2',
        submitted_by_merchant_id: 'merchant_b',
        reviewer_user_id: 'user_1',
        resolution_note: null,
        submitted_at: '2026-03-21T00:00:00.000Z',
        resolved_at: null,
        created_at: '2026-03-21T00:00:00.000Z',
        updated_at: '2026-03-21T00:00:00.000Z',
      }],
    });
    mocks.approvalsSent.mockResolvedValue({ approvals: [] });
    mocks.markRead.mockResolvedValue(undefined);

    render(<RelationshipWorkspace relationshipId="rel_1" embedded />);

    expect(await screen.findByText('Deal type')).toBeInTheDocument();
    expect(screen.getByText('Ratio')).toBeInTheDocument();
    expect(screen.getByText('50% / 50%')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getAllByText('$1,820').length).toBeGreaterThan(0);
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject, modify, and send back/i })).toBeInTheDocument();
  });
});
