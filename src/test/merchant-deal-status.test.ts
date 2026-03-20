import { describe, expect, it } from 'vitest';
import { assertDealStatusTransition, canTransitionDealStatus, getAllowedDealStatusTransitions } from '../lib/merchant-deal-status';

describe('merchant deal status machine', () => {
  it('allows the canonical happy-path transitions', () => {
    expect(canTransitionDealStatus('pending', 'approved')).toBe(true);
  });

  it('keeps duplicate sync or replay idempotent', () => {
    expect(canTransitionDealStatus('pending', 'pending')).toBe(true);
    expect(canTransitionDealStatus('approved', 'approved')).toBe(true);
  });

  it('rejects attempts to move an approved deal back to pending', () => {
    expect(canTransitionDealStatus('approved', 'pending')).toBe(false);
    expect(() => assertDealStatusTransition('approved', 'pending')).toThrow(/approved -> pending/);
  });

  it('rejects inventing removed intermediate statuses', () => {
    expect(canTransitionDealStatus('approved', 'approved')).toBe(true);
    expect(() => assertDealStatusTransition('pending', 'approved')).not.toThrow();
  });

  it('exposes the same allowed transitions for all clients from one canonical model', () => {
    expect(getAllowedDealStatusTransitions('pending')).toEqual(['approved']);
    expect(getAllowedDealStatusTransitions('approved')).toEqual([]);
  });
});
