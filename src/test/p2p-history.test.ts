import { describe, expect, it } from 'vitest';
import { computeDailySummaries } from '@/lib/p2p-history';

describe('computeDailySummaries', () => {
  it('returns an empty array when no real history points exist', () => {
    expect(computeDailySummaries([])).toEqual([]);
  });
});
