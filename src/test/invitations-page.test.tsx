import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    navigate: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    inbox: vi.fn(),
    sent: vi.fn(),
    accept: vi.fn(),
    reject: vi.fn(),
    withdraw: vi.fn(),
    relationshipsList: vi.fn(),
    relationshipsGet: vi.fn(),
    t: Object.assign((key: string) => key, { isRTL: false }),
  };
});

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/lib/api', () => ({
  ApiError: mocks.MockApiError,
  invites: {
    inbox: (...args: unknown[]) => mocks.inbox(...args),
    sent: (...args: unknown[]) => mocks.sent(...args),
    accept: (...args: unknown[]) => mocks.accept(...args),
    reject: (...args: unknown[]) => mocks.reject(...args),
    withdraw: (...args: unknown[]) => mocks.withdraw(...args),
  },
  relationships: {
    list: (...args: unknown[]) => mocks.relationshipsList(...args),
    get: (...args: unknown[]) => mocks.relationshipsGet(...args),
  },
}));
vi.mock('@/lib/i18n', () => ({ useT: () => mocks.t }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/ui/card', () => ({ Card: ({ children }: any) => <div>{children}</div>, CardContent: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
}));

import InvitationsPage from '@/pages/merchant/InvitationsPage';

const invite = {
  id: 'inv_1',
  from_merchant_id: 'merchant_from',
  from_display_name: 'Merchant From',
  from_nickname: 'from',
  to_merchant_id: 'merchant_to',
  purpose: 'Partner',
  requested_role: 'partner',
  message: '',
  status: 'pending',
} as any;

describe('InvitationsPage', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        value.mockReset();
      }
    });

    mocks.inbox.mockResolvedValue({ invites: [invite] });
    mocks.sent.mockResolvedValue({ invites: [] });
    mocks.relationshipsList.mockResolvedValue({ relationships: [] });
  });

  it('accept invite + workspace available => navigates', async () => {
    mocks.accept.mockResolvedValue({ ok: true, relationship_id: 'rel_1' });
    mocks.relationshipsGet.mockResolvedValue({ relationship: { id: 'rel_1' } });

    render(<InvitationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /accept/i }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/network/relationships/rel_1'), { timeout: 10000 });
    expect(mocks.toastError).not.toHaveBeenCalled();
  }, 12000);

  it('accept invite + workspace check fails => no navigation, toast shown', async () => {
    mocks.accept.mockResolvedValue({ ok: true, relationship_id: 'rel_1' });
    mocks.relationshipsGet.mockRejectedValue(new mocks.MockApiError(404, 'Relationship not found'));

    render(<InvitationsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /accept/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Relationship workspace could not be opened. Please refresh and try again.'), { timeout: 10000 });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.inbox).toHaveBeenCalledTimes(3);
  }, 12000);
});
