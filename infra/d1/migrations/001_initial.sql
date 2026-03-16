-- TRACKER Platform D1 Schema Migration 001
-- Core tables for merchant platform

-- Users & Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  theme TEXT NOT NULL DEFAULT 'dark',
  default_currency TEXT NOT NULL DEFAULT 'USDT',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  last_page TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merchant Profiles
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  merchant_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  merchant_type TEXT NOT NULL DEFAULT 'independent',
  region TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USDT',
  discoverability TEXT NOT NULL DEFAULT 'public',
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_user ON merchant_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_nickname ON merchant_profiles(nickname);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_merchant_id ON merchant_profiles(merchant_id);

-- Invites
CREATE TABLE IF NOT EXISTS merchant_invites (
  id TEXT PRIMARY KEY,
  from_merchant_id TEXT NOT NULL,
  to_merchant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  purpose TEXT,
  requested_role TEXT NOT NULL DEFAULT 'operator',
  message TEXT,
  requested_scope TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invites_to ON merchant_invites(to_merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_from ON merchant_invites(from_merchant_id, status);

-- Relationships
CREATE TABLE IF NOT EXISTS merchant_relationships (
  id TEXT PRIMARY KEY,
  merchant_a_id TEXT NOT NULL,
  merchant_b_id TEXT NOT NULL,
  invite_id TEXT,
  relationship_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  shared_fields TEXT NOT NULL DEFAULT '[]',
  approval_policy TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rel_a ON merchant_relationships(merchant_a_id);
CREATE INDEX IF NOT EXISTS idx_rel_b ON merchant_relationships(merchant_b_id);

-- Roles
CREATE TABLE IF NOT EXISTS merchant_roles (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_roles_rel ON merchant_roles(relationship_id, user_id);

-- Deals
CREATE TABLE IF NOT EXISTS merchant_deals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  deal_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata TEXT NOT NULL DEFAULT '{}',
  issue_date TEXT,
  due_date TEXT,
  close_date TEXT,
  expected_return REAL,
  realized_pnl REAL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_rel ON merchant_deals(relationship_id);

-- Settlements
CREATE TABLE IF NOT EXISTS merchant_settlements (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profit Records
CREATE TABLE IF NOT EXISTS merchant_profit_records (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by_user_id TEXT NOT NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Approvals
CREATE TABLE IF NOT EXISTS merchant_approvals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  proposed_payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_merchant_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  resolution_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_reviewer ON merchant_approvals(reviewer_user_id, status);

-- Messages
CREATE TABLE IF NOT EXISTS merchant_messages (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_merchant_id TEXT,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_rel ON merchant_messages(relationship_id, created_at);

CREATE TABLE IF NOT EXISTS merchant_message_reads (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS merchant_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  relationship_id TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON merchant_notifications(user_id, read_at, created_at);

-- Audit Logs
CREATE TABLE IF NOT EXISTS merchant_audit_logs (
  id TEXT PRIMARY KEY,
  relationship_id TEXT,
  actor_user_id TEXT,
  actor_merchant_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON merchant_audit_logs(actor_user_id, created_at);

-- Trading: Batches
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_user ON batches(user_id, asset_symbol);

-- Trading: Trades
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  traded_at TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  source_batch_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, asset_symbol);

-- Trading: FIFO Allocations
CREATE TABLE IF NOT EXISTS trade_allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trade_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  allocated_qty REAL NOT NULL CHECK (allocated_qty > 0),
  batch_unit_cost REAL NOT NULL CHECK (batch_unit_cost >= 0),
  allocated_cost REAL NOT NULL CHECK (allocated_cost >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(trade_id, batch_id)
);

-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version, description) VALUES ('001', 'Initial schema with all platform tables');
