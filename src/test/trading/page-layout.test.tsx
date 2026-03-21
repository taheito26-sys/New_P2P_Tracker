import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from '@/pages/trading/OrdersPage';
import DealsPage from '@/pages/merchant/DealsPage';
import NetworkPage from '@/pages/merchant/NetworkPage';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  ordersList: vi.fn(),
  merchantAgreementsList: vi.fn(),
  agreementTemplatesList: vi.fn(),
  invitesInbox: vi.fn(),
  invitesSent: vi.fn(),
  relationshipsList: vi.fn(),
  approvalsInbox: vi.fn(),
  approvalsSent: vi.fn(),
  messagesList: vi.fn(),
  merchantSearch: vi.fn(),
  t: Object.assign((key: string) => key, { isRTL: false, lang: 'en' }),
}));

vi.mock('@/lib/api', () => ({
  orders: { list: (...args: unknown[]) => mocks.ordersList(...args) },
  merchantAgreements: { list: (...args: unknown[]) => mocks.merchantAgreementsList(...args) },
  agreementTemplates: { list: (...args: unknown[]) => mocks.agreementTemplatesList(...args) },
  invites: { inbox: (...args: unknown[]) => mocks.invitesInbox(...args), sent: (...args: unknown[]) => mocks.invitesSent(...args), send: vi.fn(), accept: vi.fn(), reject: vi.fn(), withdraw: vi.fn() },
  relationships: { list: (...args: unknown[]) => mocks.relationshipsList(...args) },
  approvals: { inbox: (...args: unknown[]) => mocks.approvalsInbox(...args), sent: (...args: unknown[]) => mocks.approvalsSent(...args) },
  messages: { list: (...args: unknown[]) => mocks.messagesList(...args) },
  merchant: { search: (...args: unknown[]) => mocks.merchantSearch(...args) },
}));

vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ userId: 'user_1', isAuthenticated: true }) }));
vi.mock('@/lib/theme-context', () => ({ useTheme: () => ({ settings: { range: '30d', currency: 'USD', lowStockThreshold: 1, priceAlertThreshold: 1, searchQuery: '' } }) }));
vi.mock('@/lib/i18n', () => ({ useT: () => mocks.t }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-realtime', () => ({ useRealtimeRefresh: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ children }: any) => <div>{children}</div>, DialogContent: ({ children }: any) => <div>{children}</div>, DialogDescription: ({ children }: any) => <div>{children}</div>, DialogFooter: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/pages/merchant/RelationshipWorkspace', () => ({ __esModule: true, default: () => <div>workspace mock</div> }));

const baseAgreement = {
  id: 'mag-1', templateId: 'tpl-1', merchantId: 'm-1', merchantName: 'Northwind', agreementType: 'profit_share', title: 'Northwind v1', status: 'approved', approvedByUserId: 'u1', approvedAt: '2026-03-21T00:00:00.000Z', resolvedTermsSnapshot: { agreementId: 'mag-1', templateId: 'tpl-1', version: 1, agreementType: 'profit_share', profitSharePercent: 12 }, version: 1, isActive: true, createdAt: '2026-03-21T00:00:00.000Z', updatedAt: '2026-03-21T00:00:00.000Z',
};

beforeEach(() => {
  mocks.ordersList.mockResolvedValue({ orders: [] });
  mocks.merchantAgreementsList.mockResolvedValue({ agreements: [baseAgreement] });
  mocks.agreementTemplatesList.mockResolvedValue({ templates: [{ id: 'tpl-1', name: 'Template', agreementType: 'profit_share', calculationMethod: 'profit_share', calculationConfig: { profitSharePercent: 12 }, defaultCurrency: 'USD', notes: '', createdByUserId: 'u1', version: 1, isActive: true, createdAt: '2026-03-21T00:00:00.000Z', updatedAt: '2026-03-21T00:00:00.000Z' }] });
  mocks.invitesInbox.mockResolvedValue({ invites: [] });
  mocks.invitesSent.mockResolvedValue({ invites: [] });
  mocks.relationshipsList.mockResolvedValue({ relationships: [] });
  mocks.approvalsInbox.mockResolvedValue({ approvals: [] });
  mocks.approvalsSent.mockResolvedValue({ approvals: [] });
  mocks.messagesList.mockResolvedValue({ messages: [] });
  mocks.merchantSearch.mockResolvedValue({ results: [] });
});

describe('layout preservation', () => {
  it('keeps Orders page tab bar and two-column shell', async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /myOrders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /incomingOrders/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /outgoingOrders/i })).toBeInTheDocument();
    expect(await screen.findByText(/newSale/i)).toBeInTheDocument();
  });

  it('keeps Deals page table layout and action columns', async () => {
    render(<DealsPage />);
    expect((await screen.findAllByRole('columnheader', { name: /deal/i })).length).toBeGreaterThan(0);
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /merchant/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /actions/i })).toBeInTheDocument();
  });

  it('leaves Network page layout available', async () => {
    render(<MemoryRouter><NetworkPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /networkTitle/i })).toBeInTheDocument();
  });
});
