import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invitesInbox: vi.fn(),
  invitesSent: vi.fn(),
  relationshipsList: vi.fn(),
  approvalsInbox: vi.fn(),
  approvalsSent: vi.fn(),
  messagesList: vi.fn(),
  merchantSearch: vi.fn(),
  t: Object.assign((key: string) => key, { isRTL: false }),
}));

vi.mock('@/lib/api', () => ({
  invites: {
    inbox: (...args: unknown[]) => mocks.invitesInbox(...args),
    sent: (...args: unknown[]) => mocks.invitesSent(...args),
    send: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
    withdraw: vi.fn(),
  },
  relationships: { list: (...args: unknown[]) => mocks.relationshipsList(...args) },
  approvals: {
    inbox: (...args: unknown[]) => mocks.approvalsInbox(...args),
    sent: (...args: unknown[]) => mocks.approvalsSent(...args),
  },
  messages: { list: (...args: unknown[]) => mocks.messagesList(...args) },
  merchant: { search: (...args: unknown[]) => mocks.merchantSearch(...args) },
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ userId: 'user_1', isAuthenticated: true }) }));
vi.mock('@/lib/i18n', () => ({ useT: () => mocks.t }));
vi.mock('@/hooks/use-realtime', () => ({ useRealtimeRefresh: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ children }: any) => <div>{children}</div>, DialogContent: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children }: any) => <label>{children}</label> }));
vi.mock('@/components/ui/textarea', () => ({ Textarea: (props: any) => <textarea {...props} /> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/pages/merchant/RelationshipWorkspace', () => ({
  __esModule: true,
  default: () => {
    throw new Error('workspace crash');
  },
}));

import NetworkPage from '@/pages/merchant/NetworkPage';

describe('NetworkPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.invitesInbox.mockResolvedValue({ invites: [] });
    mocks.invitesSent.mockResolvedValue({ invites: [] });
    mocks.relationshipsList.mockResolvedValue({
      relationships: [{
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
        counterparty: { merchant_id: 'merchant_b', display_name: 'Ahmed Saleh', nickname: 'Ahmed' },
        my_role: 'owner',
        summary: { totalDeals: 0, activeExposure: 0, realizedProfit: 0, pendingApprovals: 0 },
      }],
    });
    mocks.approvalsInbox.mockResolvedValue({ approvals: [] });
    mocks.approvalsSent.mockResolvedValue({ approvals: [] });
    mocks.messagesList.mockResolvedValue({ messages: [] });
    mocks.merchantSearch.mockResolvedValue({ results: [] });
  });

  it('shows a fallback instead of blanking the whole page when embedded workspace crashes', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <NetworkPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/relationship switcher/i)).toBeInTheDocument();
    expect(await screen.findByText(/workspace unavailable/i)).toBeInTheDocument();
  });

  it('stops showing the loading spinner when a relationship message summary request hangs', async () => {
    vi.useFakeTimers();
    mocks.messagesList.mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/network']}>
        <NetworkPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/networkTitle/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(screen.getByText(/workspace unavailable/i)).toBeInTheDocument();
  });
});
