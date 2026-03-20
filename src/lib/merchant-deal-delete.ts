export type LinkedApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | null;
export type LinkedRecordKind = 'settlement' | 'profit';

export interface LinkedFinancialRecord {
  id: string;
  deal_id: string;
  status: string | null;
  approval_status: LinkedApprovalStatus;
  approval_id: string | null;
}

export interface DealDeleteDiagnostics {
  blockers: Array<{
    kind: LinkedRecordKind;
    id: string;
    reason: 'approved_record' | 'pending_approval';
  }>;
  ignored: Array<{
    kind: LinkedRecordKind;
    id: string;
    reason: 'rejected_record' | 'cancelled_record' | 'expired_record' | 'orphaned_pending_record' | 'duplicate_stale_record';
  }>;
}

function classifyRecord(
  kind: LinkedRecordKind,
  record: LinkedFinancialRecord,
): DealDeleteDiagnostics['blockers'][number] | DealDeleteDiagnostics['ignored'][number] {
  const normalizedStatus = (record.status || '').toLowerCase();
  const approvalStatus = record.approval_status;

  if (normalizedStatus === 'approved' || approvalStatus === 'approved') {
    return { kind, id: record.id, reason: 'approved_record' };
  }

  if (approvalStatus === 'pending') {
    return { kind, id: record.id, reason: 'pending_approval' };
  }

  if (approvalStatus === 'rejected' || normalizedStatus === 'rejected') {
    return { kind, id: record.id, reason: 'rejected_record' };
  }

  if (approvalStatus === 'cancelled' || normalizedStatus === 'cancelled') {
    return { kind, id: record.id, reason: 'cancelled_record' };
  }

  if (approvalStatus === 'expired' || normalizedStatus === 'expired') {
    return { kind, id: record.id, reason: 'expired_record' };
  }

  if (normalizedStatus === 'pending') {
    return { kind, id: record.id, reason: 'orphaned_pending_record' };
  }

  return { kind, id: record.id, reason: 'duplicate_stale_record' };
}

export function analyzeDealDeleteDiagnostics(input: {
  dealId: string;
  settlements: LinkedFinancialRecord[];
  profits: LinkedFinancialRecord[];
}): DealDeleteDiagnostics {
  const blockers: DealDeleteDiagnostics['blockers'] = [];
  const ignored: DealDeleteDiagnostics['ignored'] = [];

  for (const settlement of input.settlements.filter((row) => row.deal_id === input.dealId)) {
    const classified = classifyRecord('settlement', settlement);
    if (classified.reason === 'approved_record' || classified.reason === 'pending_approval') blockers.push(classified);
    else ignored.push(classified);
  }

  for (const profit of input.profits.filter((row) => row.deal_id === input.dealId)) {
    const classified = classifyRecord('profit', profit);
    if (classified.reason === 'approved_record' || classified.reason === 'pending_approval') blockers.push(classified);
    else ignored.push(classified);
  }

  return { blockers, ignored };
}
