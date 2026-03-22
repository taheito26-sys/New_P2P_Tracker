import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from '@/pages/trading/OrdersPage';
import NetworkPage from '@/pages/merchant/NetworkPage';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  ordersList: vi.fn(),
  merchantAgreementsList: vi.fn(),
  merchantAgreementsRemove: vi.fn(),
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
  merchantAgreements: { list: (...args: unknown[]) => mocks.merchantAgreementsList(...args), remove: (...args: unknown[]) => mocks.merchantAgreementsRemove(...args) },
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
const secondaryApprovedAgreement = {
  ...baseAgreement,
  id: 'mag-2',
  templateId: 'tpl-2',
  agreementType: 'fixed_margin',
  title: 'Northwind Fixed Margin',
};
const pendingAgreement = {
  ...baseAgreement,
  id: 'mag-3',
  title: 'Northwind Pending',
  status: 'pending',
};
const otherMerchantAgreement = {
  ...baseAgreement,
  id: 'mag-4',
  merchantId: 'm-2',
  merchantName: 'Orbit',
  title: 'Orbit Approved',
};

beforeEach(() => {
  mocks.ordersList.mockResolvedValue({ orders: [] });
  mocks.merchantAgreementsList.mockResolvedValue({ agreements: [baseAgreement, secondaryApprovedAgreement, pendingAgreement, otherMerchantAgreement] });
  mocks.merchantAgreementsRemove.mockResolvedValue({ ok: true, mode: 'delete' });
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


  it('keeps the existing Agreement Type path but fills it from approved agreements for the selected merchant only', async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText(/newSale/i);

    const selects = screen.getAllByRole('combobox');
    const merchantSelect = selects[1];
    const agreementTypeSelect = selects[2];

    fireEvent.change(merchantSelect, { target: { value: 'm-1' } });

    expect(screen.getByRole('option', { name: /Northwind v1 · profit_share/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Northwind Fixed Margin · fixed_margin/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Northwind Pending/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Orbit Approved/i })).not.toBeInTheDocument();

    fireEvent.change(agreementTypeSelect, { target: { value: 'mag-2' } });
    expect((agreementTypeSelect as HTMLSelectElement).value).toBe('mag-2');
  });

  it('leaves Network page layout available', async () => {
    render(<MemoryRouter><NetworkPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /networkTitle/i })).toBeInTheDocument();
  });
});
