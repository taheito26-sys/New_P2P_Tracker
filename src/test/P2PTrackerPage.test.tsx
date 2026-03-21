import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import P2PTrackerPage from '@/pages/trading/P2PTrackerPage';

const latestMock = vi.fn();
const historyMock = vi.fn();

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
  p2p: {
    latest: (...args: unknown[]) => latestMock(...args),
    history: (...args: unknown[]) => historyMock(...args),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/lib/i18n', () => ({
  useT: () => ({ lang: 'en', isRTL: false }),
}));

const baseSnapshot = {
  ts: Date.now(),
  market: 'qatar',
  source: 'live',
  fetchedAt: '2026-03-21T12:34:56.000Z',
  stale: false,
  status: 'ok',
  sellAvg: 3.8,
  buyAvg: 3.7,
  bestSell: 3.81,
  bestBuy: 3.69,
  sellDepth: 100,
  buyDepth: 100,
  spread: 0.11,
  spreadPct: 2.97,
  sellOffers: [],
  buyOffers: [],
};

const history = [{ ts: Date.now(), market: 'qatar', sellAvg: 3.8, buyAvg: 3.7, spread: 0.1, spreadPct: 2.7 }];

describe('P2PTrackerPage', () => {
  beforeEach(() => {
    latestMock.mockReset();
    historyMock.mockReset();
    latestMock.mockResolvedValue(baseSnapshot);
    historyMock.mockResolvedValue(history);
  });

  it('switching market tabs requests the matching canonical market', async () => {
    render(<P2PTrackerPage />);
    await waitFor(() => expect(latestMock).toHaveBeenCalledWith('qatar'));

    fireEvent.click(screen.getByRole('button', { name: 'UAE' }));
    await waitFor(() => expect(latestMock).toHaveBeenLastCalledWith('uae'));
    expect(historyMock).toHaveBeenLastCalledWith('uae');
  });

  it('status badge reflects backend source and stale state, and last update uses fetchedAt', async () => {
    latestMock.mockResolvedValueOnce({ ...baseSnapshot, source: 'synthetic' });
    render(<P2PTrackerPage />);

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Synthetic sandbox data');
    expect(screen.getByText(/updated/i)).toHaveTextContent('12:34:56');
  });

  it('shows stale cached data state and does not claim live', async () => {
    latestMock.mockResolvedValueOnce({ ...baseSnapshot, stale: true, status: 'degraded' });
    render(<P2PTrackerPage />);

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Stale cached data');
    expect(screen.queryByText('Live provider connected')).not.toBeInTheDocument();
  });

  it('shows a clear warning when selected and returned markets mismatch', async () => {
    latestMock.mockResolvedValueOnce({ ...baseSnapshot, market: 'uae' });
    render(<P2PTrackerPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Selected QATAR but backend returned UAE');
  });
});
