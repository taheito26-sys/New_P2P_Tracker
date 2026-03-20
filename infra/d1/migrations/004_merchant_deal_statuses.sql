-- Normalize merchant deal statuses to the strict pending/approved model.
-- Existing legacy states are mapped as follows:
--   draft, cancelled -> pending
--   active, due, overdue, settled, closed -> approved

UPDATE merchant_deals
SET status = CASE
  WHEN status IN ('active', 'due', 'overdue', 'settled', 'closed', 'approved') THEN 'approved'
  ELSE 'pending'
END,
    updated_at = datetime('now')
WHERE status NOT IN ('pending', 'approved')
   OR status IS NULL;
