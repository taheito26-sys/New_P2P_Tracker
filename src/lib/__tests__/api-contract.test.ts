import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvals, invites, relationships } from '@/lib/api';

const mockResponse = (body: unknown = { ok: true }) => ({
  ok: true,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

describe('api client contract', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(mockResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes backward-compatible invite, approval, and relationship methods', () => {
    expect(invites.create).toBeTypeOf('function');
    expect(invites.send).toBeTypeOf('function');
    expect(invites.accept).toBeTypeOf('function');
    expect(invites.reject).toBeTypeOf('function');
    expect(invites.withdraw).toBeTypeOf('function');

    expect(approvals.approve).toBeTypeOf('function');
    expect(approvals.reject).toBeTypeOf('function');

    expect(relationships.get).toBeTypeOf('function');
    expect(relationships.detail).toBeTypeOf('function');
  });

  it('keeps invites.send and invites.create on the same endpoint contract', async () => {
    const payload = { to_merchant_id: 'merchant_123', purpose: 'Partner', requested_role: 'partner' };

    await invites.create(payload);
    await invites.send(payload);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/merchant/invites', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/merchant/invites', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  });

  it('routes invite aliases to the existing invite action endpoints', async () => {
    await invites.accept('invite-1');
    await invites.reject('invite-2');
    await invites.withdraw('invite-3');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/merchant/invites/invite-1/accept', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/merchant/invites/invite-2/reject', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/merchant/invites/invite-3/withdraw', expect.objectContaining({ method: 'POST' }));
  });

  it('routes approval aliases through the existing approve/reject endpoints', async () => {
    await approvals.approve('approval-1', 'looks good');
    await approvals.reject('approval-2', 'needs changes');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/merchant/approvals/approval-1/approve', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ note: 'looks good' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/merchant/approvals/approval-2/reject', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ note: 'needs changes' }),
    }));
  });

  it('aliases relationships.get to the detail endpoint', async () => {
    await relationships.detail('rel-1');
    await relationships.get('rel-2');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/merchant/relationships/rel-1', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/merchant/relationships/rel-2', expect.any(Object));
  });
});
