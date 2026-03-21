# Merchant Trading Workflow Schema

## Core tables

```sql
CREATE TABLE agreement_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agreement_type TEXT NOT NULL,
  calculation_method TEXT NOT NULL,
  calculation_config_json TEXT NOT NULL,
  default_currency TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE merchant_agreements (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES agreement_templates(id),
  merchant_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  agreement_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  resolved_terms_snapshot_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_merchant_agreements_version
  ON merchant_agreements (merchant_id, template_id, version);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  merchant_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  merchant_agreement_id TEXT NOT NULL REFERENCES merchant_agreements(id),
  agreement_template_id TEXT NOT NULL REFERENCES agreement_templates(id),
  agreement_type TEXT NOT NULL,
  agreement_snapshot_json TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  computed_net_profit REAL NOT NULL,
  status TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Migration notes

1. Stop deriving orders from `trades`, relationship objects, or client-only arrays.
2. Migrate every historical deal into a real `orders` row with a frozen `agreement_snapshot_json` and `computed_net_profit`.
3. Split legacy deal definitions into:
   - `agreement_templates` for reusable formulas.
   - `merchant_agreements` for merchant-specific approval records.
4. Mark legacy mixed records archived after migration rather than mutating financial history in place.
5. When agreement economics change, insert a new version row instead of updating old order snapshots.
