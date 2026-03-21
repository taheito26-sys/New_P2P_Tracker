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
});
