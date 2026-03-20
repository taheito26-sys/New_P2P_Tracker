import { describe, expect, it } from 'vitest';
import { analyzeDealDeleteDiagnostics, type LinkedFinancialRecord } from '../lib/merchant-deal-delete';

function rec(overrides: Partial<LinkedFinancialRecord> = {}): LinkedFinancialRecord {
  return {
    id: overrides.id || 'row_1',
    deal_id: overrides.deal_id || 'deal_1',
    status: overrides.status ?? 'pending',
    approval_status: overrides.approval_status ?? null,
    approval_id: overrides.approval_id ?? null,
  };
}

describe('merchant deal delete diagnostics', () => {
  it('allows deleting a deal with no linked financial records', () => {
    const result = analyzeDealDeleteDiagnostics({ dealId: 'deal_1', settlements: [], profits: [] });
    expect(result.blockers).toEqual([]);
  });

  it('blocks deleting a deal with a real approved settlement', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [rec({ id: 'stl_1', status: 'approved', approval_status: 'approved' })],
      profits: [],
    });
    expect(result.blockers).toEqual([{ kind: 'settlement', id: 'stl_1', reason: 'approved_record' }]);
  });

  it('blocks deleting a deal with a real approved profit record', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [],
      profits: [rec({ id: 'prf_1', status: 'approved', approval_status: 'approved' })],
    });
    expect(result.blockers).toEqual([{ kind: 'profit', id: 'prf_1', reason: 'approved_record' }]);
  });

  it('blocks deleting a deal with a pending settlement approval still in flight', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [rec({ id: 'stl_2', status: 'pending', approval_status: 'pending', approval_id: 'apr_1' })],
      profits: [],
    });
    expect(result.blockers).toEqual([{ kind: 'settlement', id: 'stl_2', reason: 'pending_approval' }]);
  });

  it('ignores unrelated orphaned pending rows that have no active approval', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [rec({ id: 'stl_orphan', status: 'pending', approval_status: null })],
      profits: [rec({ id: 'prf_orphan', status: 'pending', approval_status: null })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.ignored).toEqual([
      { kind: 'settlement', id: 'stl_orphan', reason: 'orphaned_pending_record' },
      { kind: 'profit', id: 'prf_orphan', reason: 'orphaned_pending_record' },
    ]);
  });

  it('ignores rejected stale rows so a deletable deal is not falsely blocked', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [rec({ id: 'stl_rej', status: 'pending', approval_status: 'rejected', approval_id: 'apr_rej' })],
      profits: [rec({ id: 'prf_rej', status: 'rejected', approval_status: 'rejected', approval_id: 'apr_rej2' })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.ignored).toEqual([
      { kind: 'settlement', id: 'stl_rej', reason: 'rejected_record' },
      { kind: 'profit', id: 'prf_rej', reason: 'rejected_record' },
    ]);
  });

  it('ignores duplicate stale rows while still blocking the real approved record', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [
        rec({ id: 'stl_live', status: 'approved', approval_status: 'approved' }),
        rec({ id: 'stl_dup', status: 'void', approval_status: null }),
      ],
      profits: [],
    });
    expect(result.blockers).toEqual([{ kind: 'settlement', id: 'stl_live', reason: 'approved_record' }]);
    expect(result.ignored).toContainEqual({ kind: 'settlement', id: 'stl_dup', reason: 'duplicate_stale_record' });
  });

  it('ignores unrelated records from another deal even if a broad query leaks them in', () => {
    const result = analyzeDealDeleteDiagnostics({
      dealId: 'deal_1',
      settlements: [rec({ id: 'stl_other', deal_id: 'deal_2', status: 'approved', approval_status: 'approved' })],
      profits: [rec({ id: 'prf_other', deal_id: 'deal_2', status: 'approved', approval_status: 'approved' })],
    });
    expect(result.blockers).toEqual([]);
    expect(result.ignored).toEqual([]);
  });
});
