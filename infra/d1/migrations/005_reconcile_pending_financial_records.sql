-- Reconcile stale settlement/profit rows left behind by rejected/cancelled/expired approvals.
-- These child rows were created before approval resolution, so legacy rejected flows may have
-- left them stuck in "pending" even though they should no longer block deal deletion.

UPDATE merchant_settlements
SET status = 'rejected',
    updated_at = datetime('now')
WHERE status = 'pending'
  AND id IN (
    SELECT target_entity_id
    FROM merchant_approvals
    WHERE target_entity_type = 'settlement'
      AND status IN ('rejected', 'cancelled', 'expired')
  );

UPDATE merchant_profit_records
SET status = 'rejected',
    updated_at = datetime('now')
WHERE status = 'pending'
  AND id IN (
    SELECT target_entity_id
    FROM merchant_approvals
    WHERE target_entity_type = 'profit'
      AND status IN ('rejected', 'cancelled', 'expired')
  );
