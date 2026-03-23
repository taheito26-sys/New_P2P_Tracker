const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer, TableOfContents
} = require('docx');
const fs = require('fs');

// ─── HELPERS ────────────────────────────────────────────────────────────────

const BLUE = '1F4E79';
const LIGHT_BLUE = 'D6E4F0';
const LIGHT_GRAY = 'F5F5F5';
const BORDER_GRAY = 'CCCCCC';
const CODE_BG = 'F0F0F0';
const ACCENT = '2E75B6';

const border = (color = BORDER_GRAY) => ({ style: BorderStyle.SINGLE, size: 1, color });
const cellBorders = (color = BORDER_GRAY) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 36, color: BLUE, font: 'Arial' })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: '2E5F8A', font: 'Arial' })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: '1A3D5C', font: 'Arial' })]
  });
}

function h4(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, color: '1A3D5C', font: 'Arial' })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })]
  });
}

function pBold(text) {
  return p(text, { bold: true });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial' })]
  });
}

function codeBlock(lines) {
  const blocks = [];
  // opening spacer
  blocks.push(new Paragraph({ spacing: { before: 80, after: 0 }, children: [] }));
  for (const line of lines) {
    blocks.push(new Paragraph({
      spacing: { before: 0, after: 0 },
      shading: { fill: CODE_BG, type: ShadingType.CLEAR },
      indent: { left: 360 },
      children: [new TextRun({ text: line === '' ? ' ' : line, font: 'Courier New', size: 18, color: '1A1A1A' })]
    }));
  }
  // closing spacer
  blocks.push(new Paragraph({ spacing: { before: 0, after: 80 }, children: [] }));
  return blocks;
}

function code(text) {
  return new TextRun({ text, font: 'Courier New', size: 20, color: '8B0000' });
}

function inlineCode(text) {
  return new TextRun({ text: ` ${text} `, font: 'Courier New', size: 20, color: '8B0000', shading: { fill: CODE_BG, type: ShadingType.CLEAR } });
}

function spacer(n = 1) {
  return Array.from({ length: n }, () => new Paragraph({ spacing: { before: 40, after: 40 }, children: [] }));
}

function sectionDivider() {
  return new Paragraph({
    spacing: { before: 240, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 2 } },
    children: []
  });
}

function twoColTable(col1Width, col2Width, rows) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [col1Width, col2Width],
    rows: rows.map(([c1, c2], i) =>
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders(),
            width: { size: col1Width, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            shading: { fill: i === 0 ? LIGHT_BLUE : LIGHT_GRAY, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: c1, bold: i === 0, size: 20, font: 'Arial' })] })]
          }),
          new TableCell({
            borders: cellBorders(),
            width: { size: col2Width, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            shading: { fill: i === 0 ? LIGHT_BLUE : 'FFFFFF', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: c2, bold: i === 0, size: 20, font: 'Arial' })] })]
          }),
        ]
      })
    )
  });
}

// ─── DOCUMENT CONTENT ───────────────────────────────────────────────────────

const children = [

  // ── TITLE PAGE ──
  new Paragraph({
    spacing: { before: 1440, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Merchant Features', bold: true, size: 72, color: BLUE, font: 'Arial' })]
  }),
  new Paragraph({
    spacing: { before: 0, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'End-to-End Implementation Specification', bold: true, size: 44, color: ACCENT, font: 'Arial' })]
  }),
  new Paragraph({
    spacing: { before: 0, after: 800 },
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 4 } },
    children: [new TextRun({ text: 'Zero-Deviation Implementation Guide for AI-Assisted Development', size: 28, color: '555555', italics: true, font: 'Arial' })]
  }),
  new Paragraph({
    spacing: { before: 400, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'P2P Tracker — Merchant Module', size: 26, font: 'Arial', color: '333333' })]
  }),
  new Paragraph({
    spacing: { before: 0, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Date: 2026-03-23', size: 22, font: 'Arial', color: '666666' })]
  }),
  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ── TABLE OF CONTENTS ──
  h1('Table of Contents'),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: SYSTEM OVERVIEW
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 1: System Overview'),

  h2('1.1 Purpose'),
  p('This document specifies every function, feature, workflow, process, and relationship in the P2P Tracker Merchant system. It is written so that an AI (e.g. Lovable) can implement the full merchant feature set end-to-end with zero deviation from the existing design.'),

  h2('1.2 Technology Stack'),
  ...['Frontend: React + TypeScript + Vite',
    'Backend: Cloudflare Workers (Hono framework)',
    'Database: Cloudflare D1 (SQLite dialect)',
    'Auth: JWT-based sessions',
    'Styling: Tailwind CSS + shadcn/ui'].map(bullet),

  h2('1.3 High-Level Architecture'),
  p('The merchant system has five layers:'),
  ...['Database Layer — D1 SQL tables (infra/d1/migrations/)',
    'Server Layer — Hono routes in server/index.ts and server/trading-routes.ts',
    'API Client Layer — src/lib/api.ts',
    'Business Logic Layer — src/lib/ utilities',
    'UI Layer — src/pages/merchant/ and src/pages/trading/'].map((t) => numbered(t, 0)),

  h2('1.4 File Structure'),
  ...codeBlock([
    'src/',
    '├── types/',
    '│   └── domain.ts                    # All domain interfaces and types',
    '├── lib/',
    '│   ├── api.ts                       # API client functions',
    '│   ├── deal-engine.ts               # Deal logic, allocation, summaries',
    '│   ├── merchant-deal-status.ts      # Status state machine',
    '│   ├── merchant-deal-delete.ts      # Delete diagnostics',
    '│   ├── deal-templates.ts            # Deal template helpers',
    '│   └── trading/',
    '│       ├── types.ts                 # Trading domain types',
    '│       ├── profit-service.ts        # Profit calculation',
    '│       ├── utils.ts                 # ID generation, order building',
    '│       └── demo-data.ts             # Development/test data',
    '├── pages/',
    '│   └── merchant/',
    '│       ├── MerchantHubPage.tsx      # Main hub',
    '│       ├── OnboardingPage.tsx       # Profile creation wizard',
    '│       ├── DashboardPage.tsx        # KPI dashboard',
    '│       ├── RelationshipWorkspace.tsx',
    '│       ├── InvitationsPage.tsx',
    '│       ├── RelationshipsPage.tsx',
    '│       ├── ApprovalsPage.tsx',
    '│       ├── MessagesPage.tsx',
    '│       ├── SettingsPage.tsx',
    '│       ├── AnalyticsPage.tsx',
    '│       ├── AuditPage.tsx',
    '│       ├── CRMPage.tsx',
    '│       ├── DirectoryPage.tsx',
    '│       ├── NetworkPage.tsx',
    '│       └── DealsPage.tsx',
    '│   └── trading/',
    '│       └── OrdersPage.tsx',
    '└── test/',
    '    ├── merchant-deal-delete.test.ts',
    '    ├── merchant-deal-status.test.ts',
    '    ├── invitations-page.test.tsx',
    '    ├── relationship-workspace.test.tsx',
    '    └── trading/',
    '        ├── order-workflow.test.ts',
    '        └── agreement-delete.test.ts',
    '',
    'server/',
    '├── index.ts                         # Core merchant routes',
    '└── trading-routes.ts                # Agreement template + order routes',
    '',
    'infra/d1/migrations/',
    '├── 001_initial.sql',
    '└── 004_merchant_deal_statuses.sql',
  ]),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: DATABASE SCHEMA
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 2: Database Schema'),
  p('All tables use Cloudflare D1 (SQLite dialect). IDs are TEXT PRIMARY KEY (UUID or prefixed random string). All timestamps are TEXT stored as ISO-8601 via datetime(\'now\').'),

  h2('2.1 merchant_profiles'),
  ...codeBlock([
    'CREATE TABLE merchant_profiles (',
    '  id TEXT PRIMARY KEY,',
    '  user_id TEXT NOT NULL UNIQUE,',
    '  email TEXT UNIQUE,',
    '  merchant_id TEXT NOT NULL UNIQUE,   -- Format: MRC-XXXXXXXX',
    '  nickname TEXT NOT NULL UNIQUE,',
    '  display_name TEXT NOT NULL,',
    "  merchant_type TEXT NOT NULL DEFAULT 'independent',",
    '  region TEXT,',
    "  default_currency TEXT NOT NULL DEFAULT 'USDT',",
    "  discoverability TEXT NOT NULL DEFAULT 'public',",
    '  bio TEXT,',
    "  status TEXT NOT NULL DEFAULT 'active',",
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_profiles_user_id ON merchant_profiles(user_id);',
    'CREATE INDEX idx_merchant_profiles_nickname ON merchant_profiles(nickname);',
    'CREATE INDEX idx_merchant_profiles_merchant_id ON merchant_profiles(merchant_id);',
  ]),
  p('Constraints:'),
  ...['merchant_type IN (independent, desk, partner, other)',
    'discoverability IN (public, merchant_id_only, hidden)',
    'status IN (active, restricted, suspended, archived)'].map(bullet),

  h2('2.2 merchant_invites'),
  ...codeBlock([
    'CREATE TABLE merchant_invites (',
    '  id TEXT PRIMARY KEY,',
    '  from_merchant_id TEXT NOT NULL,',
    '  to_merchant_id TEXT NOT NULL,',
    "  status TEXT NOT NULL DEFAULT 'pending',",
    '  purpose TEXT,',
    "  requested_role TEXT NOT NULL DEFAULT 'operator',",
    '  message TEXT,',
    "  requested_scope TEXT NOT NULL DEFAULT '[]',",
    '  expires_at TEXT,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_invites_to ON merchant_invites(to_merchant_id);',
    'CREATE INDEX idx_merchant_invites_from_status ON merchant_invites(from_merchant_id, status);',
  ]),
  p('status IN (pending, accepted, rejected, withdrawn, expired)'),

  h2('2.3 merchant_relationships'),
  ...codeBlock([
    'CREATE TABLE merchant_relationships (',
    '  id TEXT PRIMARY KEY,',
    '  merchant_a_id TEXT NOT NULL,',
    '  merchant_b_id TEXT NOT NULL,',
    '  invite_id TEXT,',
    "  relationship_type TEXT NOT NULL DEFAULT 'general',",
    "  status TEXT NOT NULL DEFAULT 'active',",
    "  shared_fields TEXT NOT NULL DEFAULT '[]',",
    "  approval_policy TEXT NOT NULL DEFAULT '{}',",
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_relationships_a ON merchant_relationships(merchant_a_id);',
    'CREATE INDEX idx_merchant_relationships_b ON merchant_relationships(merchant_b_id);',
  ]),
  p('relationship_type IN (general, lending, arbitrage, capital, strategic)'),
  p('status IN (active, restricted, suspended, terminated, archived)'),

  h2('2.4 merchant_roles'),
  ...codeBlock([
    'CREATE TABLE merchant_roles (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    '  merchant_id TEXT NOT NULL,',
    '  user_id TEXT NOT NULL,',
    "  role TEXT NOT NULL DEFAULT 'viewer',",
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_roles_rel ON merchant_roles(relationship_id);',
    'CREATE INDEX idx_merchant_roles_user ON merchant_roles(user_id);',
  ]),

  h2('2.5 merchant_deals'),
  ...codeBlock([
    'CREATE TABLE merchant_deals (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    "  deal_type TEXT NOT NULL DEFAULT 'general',",
    '  title TEXT NOT NULL,',
    '  amount REAL NOT NULL DEFAULT 0,',
    "  currency TEXT NOT NULL DEFAULT 'USDT',",
    "  status TEXT NOT NULL DEFAULT 'pending',",
    "  metadata TEXT NOT NULL DEFAULT '{}',",
    '  issue_date TEXT,',
    '  due_date TEXT,',
    '  close_date TEXT,',
    '  expected_return REAL,',
    '  realized_pnl REAL,',
    '  created_by TEXT NOT NULL,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_deals_rel ON merchant_deals(relationship_id);',
  ]),
  p('deal_type IN (lending, arbitrage, partnership, capital_placement, general)'),
  p('status IN (pending, approved)  — Only pending and approved are valid deal statuses.'),

  h2('2.6 merchant_settlements'),
  ...codeBlock([
    'CREATE TABLE merchant_settlements (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    '  deal_id TEXT NOT NULL,',
    '  submitted_by_user_id TEXT NOT NULL,',
    '  amount REAL NOT NULL,',
    "  currency TEXT NOT NULL DEFAULT 'USDT',",
    '  note TEXT,',
    "  status TEXT NOT NULL DEFAULT 'pending',",
    "  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),",
    '  approved_at TEXT,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
  ]),

  h2('2.7 merchant_profit_records'),
  ...codeBlock([
    'CREATE TABLE merchant_profit_records (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    '  deal_id TEXT NOT NULL,',
    '  period_key TEXT NOT NULL,   -- format: YYYY-MM',
    '  amount REAL NOT NULL,',
    "  currency TEXT NOT NULL DEFAULT 'USDT',",
    '  note TEXT,',
    "  status TEXT NOT NULL DEFAULT 'pending',",
    '  submitted_by_user_id TEXT NOT NULL,',
    '  approved_at TEXT,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
  ]),

  h2('2.8 merchant_approvals'),
  ...codeBlock([
    'CREATE TABLE merchant_approvals (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    '  type TEXT NOT NULL,',
    '  target_entity_type TEXT NOT NULL,',
    '  target_entity_id TEXT NOT NULL,',
    "  proposed_payload TEXT NOT NULL DEFAULT '{}',",
    "  status TEXT NOT NULL DEFAULT 'pending',",
    '  submitted_by_user_id TEXT NOT NULL,',
    '  submitted_by_merchant_id TEXT NOT NULL,',
    '  reviewer_user_id TEXT NOT NULL,',
    '  resolution_note TEXT,',
    "  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),",
    '  resolved_at TEXT,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now')),",
    "  updated_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_approvals_reviewer ON merchant_approvals(reviewer_user_id, status);',
  ]),
  p('type IN (deal_create, settlement_submit, profit_record_submit, capital_adjustment, deal_close, relationship_suspend, relationship_terminate, permissions_change)'),
  p('status IN (pending, approved, rejected, cancelled, expired)'),

  h2('2.9 merchant_messages'),
  ...codeBlock([
    'CREATE TABLE merchant_messages (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT NOT NULL,',
    '  sender_user_id TEXT NOT NULL,',
    '  sender_merchant_id TEXT,',
    '  body TEXT NOT NULL,',
    "  message_type TEXT NOT NULL DEFAULT 'text',",
    "  metadata TEXT NOT NULL DEFAULT '{}',",
    "  created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_messages_rel ON merchant_messages(relationship_id, created_at);',
  ]),
  p('message_type IN (text, system, request-note)'),

  h2('2.10 merchant_message_reads'),
  ...codeBlock([
    'CREATE TABLE merchant_message_reads (',
    '  id TEXT PRIMARY KEY,',
    '  message_id TEXT NOT NULL,',
    '  user_id TEXT NOT NULL,',
    "  read_at TEXT NOT NULL DEFAULT (datetime('now')),",
    '  UNIQUE(message_id, user_id)',
    ');',
  ]),

  h2('2.11 merchant_notifications'),
  ...codeBlock([
    'CREATE TABLE merchant_notifications (',
    '  id TEXT PRIMARY KEY,',
    '  user_id TEXT NOT NULL,',
    '  relationship_id TEXT,',
    "  category TEXT NOT NULL DEFAULT 'system',",
    '  title TEXT NOT NULL,',
    '  body TEXT,',
    "  data_json TEXT NOT NULL DEFAULT '{}',",
    '  read_at TEXT,',
    "  created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_notifications_user ON merchant_notifications(user_id, read_at, created_at);',
  ]),

  h2('2.12 merchant_audit_logs'),
  ...codeBlock([
    'CREATE TABLE merchant_audit_logs (',
    '  id TEXT PRIMARY KEY,',
    '  relationship_id TEXT,',
    '  actor_user_id TEXT,',
    '  actor_merchant_id TEXT,',
    '  entity_type TEXT NOT NULL,',
    '  entity_id TEXT NOT NULL,',
    '  action TEXT NOT NULL,',
    "  detail_json TEXT NOT NULL DEFAULT '{}',",
    "  created_at TEXT NOT NULL DEFAULT (datetime('now'))",
    ');',
    'CREATE INDEX idx_merchant_audit_actor ON merchant_audit_logs(actor_user_id, created_at);',
  ]),

  h2('2.13 Trading Tables (In-Memory / KV)'),
  p('The agreement_templates, merchant_agreements, and orders tables are stored in-memory/KV in the current implementation. Their logical schema is:'),
  pBold('agreement_templates:'),
  ...codeBlock([
    '{ id, name, agreementType, calculationMethod, calculationConfig (JSON),',
    '  defaultCurrency, notes, createdByUserId, version, isActive, createdAt, updatedAt }',
  ]),
  pBold('merchant_agreements:'),
  ...codeBlock([
    '{ id, templateId, merchantId, merchantName, agreementType, title, status,',
    '  approvedByUserId, approvedAt, resolvedTermsSnapshot (JSON), version, isActive, createdAt, updatedAt }',
  ]),
  pBold('orders:'),
  ...codeBlock([
    '{ id, direction, merchantId, merchantName, buyerId, buyerName, merchantAgreementId,',
    '  agreementTemplateId, agreementType, agreementSnapshot (JSON), quantity, unitPrice,',
    '  totalAmount, currency, computedNetProfit, status, createdByUserId, createdAt, updatedAt }',
  ]),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 3: TYPE DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 3: Type Definitions'),
  p('All types live in src/types/domain.ts (core domain) and src/lib/trading/types.ts (trading domain).'),

  h2('3.1 Core Domain Types — src/types/domain.ts'),

  h3('Merchant Profile Types'),
  ...codeBlock([
    "export type MerchantType = 'independent' | 'desk' | 'partner' | 'other';",
    "export type Discoverability = 'public' | 'merchant_id_only' | 'hidden';",
    "export type MerchantStatus = 'active' | 'restricted' | 'suspended' | 'archived';",
    '',
    'export interface MerchantProfile {',
    '  id: string;',
    '  owner_user_id: string;',
    '  merchant_id: string;        // Format: MRC-XXXXXXXX or 5-digit',
    '  nickname: string;',
    '  display_name: string;',
    '  merchant_type: MerchantType;',
    '  region: string;',
    '  default_currency: string;',
    '  discoverability: Discoverability;',
    '  bio: string | null;',
    '  status: MerchantStatus;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    'export interface MerchantSearchResult {',
    '  id: string;',
    '  merchant_id: string;',
    '  nickname: string;',
    '  display_name: string;',
    '  merchant_type: string;',
    '  region: string;',
    '}',
  ]),

  h3('Invite & Relationship Types'),
  ...codeBlock([
    "export type InviteStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';",
    '',
    'export interface MerchantInvite {',
    '  id: string;',
    '  from_merchant_id: string;',
    '  to_merchant_id: string;',
    '  status: InviteStatus;',
    '  purpose: string;',
    '  requested_role: string;',
    '  message: string;',
    '  requested_scope: string[];',
    '  expires_at: string;',
    '  created_at: string;',
    '  updated_at: string;',
    '  from_display_name?: string;',
    '  from_nickname?: string;',
    '  from_public_id?: string;',
    '  to_display_name?: string;',
    '  to_nickname?: string;',
    '  to_public_id?: string;',
    '}',
    '',
    "export type RelationshipType = 'general' | 'lending' | 'arbitrage' | 'capital' | 'strategic';",
    "export type RelationshipStatus = 'active' | 'restricted' | 'suspended' | 'terminated' | 'archived';",
    '',
    'export interface ApprovalPolicy {',
    '  settlement_submit?: string;',
    '  profit_record_submit?: string;',
    '  deal_close?: string;',
    '  capital_changes?: boolean;',
    '  closures?: boolean;',
    '}',
    '',
    'export interface MerchantRelationship {',
    '  id: string;',
    '  merchant_a_id: string;',
    '  merchant_b_id: string;',
    '  invite_id: string;',
    '  relationship_type: RelationshipType;',
    '  status: RelationshipStatus;',
    '  shared_fields: string[];',
    '  approval_policy: ApprovalPolicy;',
    '  created_at: string;',
    '  updated_at: string;',
    '  my_role?: string;',
    '  counterparty?: Partial<MerchantProfile>;',
    '  summary?: RelationshipSummary;',
    '}',
    '',
    'export interface RelationshipSummary {',
    '  totalDeals: number;',
    '  activeExposure: number;',
    '  realizedProfit: number;',
    '  pendingApprovals: number;',
    '}',
  ]),

  h3('Deal Types'),
  ...codeBlock([
    "export type DealType = 'lending' | 'arbitrage' | 'partnership' | 'capital_placement' | 'general';",
    "export type SupportedDealType = 'arbitrage' | 'partnership';",
    "export type DealStatus = 'pending' | 'approved';",
    '',
    'export interface MerchantDeal {',
    '  id: string;',
    '  relationship_id: string;',
    '  deal_type: DealType;',
    '  title: string;',
    '  amount: number;',
    '  currency: string;',
    '  status: DealStatus;',
    '  metadata: Record<string, unknown>;',
    '  issue_date: string;',
    '  due_date: string | null;',
    '  close_date: string | null;',
    '  expected_return: number | null;',
    '  realized_pnl: number | null;',
    '  created_by: string;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
  ]),

  h3('Approval, Message, Settlement & Profit Types'),
  ...codeBlock([
    'export type ApprovalType =',
    "  | 'deal_create' | 'settlement_submit' | 'profit_record_submit'",
    "  | 'capital_adjustment' | 'deal_close'",
    "  | 'relationship_suspend' | 'relationship_terminate' | 'permissions_change';",
    "export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';",
    '',
    'export interface MerchantApproval {',
    '  id: string;',
    '  relationship_id: string;',
    '  type: ApprovalType;',
    '  target_entity_type: string;',
    '  target_entity_id: string;',
    '  proposed_payload: Record<string, unknown>;',
    '  status: ApprovalStatus;',
    '  submitted_by_user_id: string;',
    '  submitted_by_merchant_id: string;',
    '  reviewer_user_id: string;',
    '  resolution_note: string | null;',
    '  submitted_at: string;',
    '  resolved_at: string | null;',
    '  created_at: string;',
    '  updated_at: string;',
    '}',
    '',
    "export type MessageType = 'text' | 'system' | 'request-note';",
    '',
    'export interface MerchantMessage {',
    '  id: string;',
    '  relationship_id: string;',
    '  sender_user_id: string;',
    '  sender_merchant_id: string;',
    '  body: string;',
    '  message_type: MessageType;',
    '  metadata: Record<string, unknown>;',
    '  is_read: boolean;',
    '  created_at: string;',
    '  sender_name?: string;',
    '}',
    '',
    'export interface MerchantSettlement {',
    '  id: string; relationship_id: string; deal_id: string;',
    '  submitted_by_user_id: string; amount: number; currency: string;',
    '  note: string; status: string; submitted_at: string;',
    '  approved_at: string | null; created_at: string; updated_at: string;',
    '}',
    '',
    'export interface ProfitRecord {',
    '  id: string; relationship_id: string; deal_id: string;',
    '  period_key: string; amount: number; currency: string;',
    '  note: string; status: string; submitted_by_user_id: string;',
    '  approved_at: string | null; created_at: string; updated_at: string;',
    '}',
  ]),

  h2('3.2 Trading Types — src/lib/trading/types.ts'),
  ...codeBlock([
    "export type AgreementType = 'profit_share' | 'fixed_margin' | 'spread' | 'commission' | 'custom';",
    'export type CalculationMethod = AgreementType;',
    "export type MerchantAgreementStatus = 'pending' | 'approved' | 'rejected' | 'archived';",
    "export type OrderDirection = 'incoming' | 'outgoing';",
    "export type OrderStatus = 'draft' | 'confirmed' | 'cancelled' | 'archived';",
    '',
    'export interface CalculationConfig {',
    '  profitSharePercent?: number;',
    '  fixedMarginAmount?: number;',
    '  spreadPercent?: number;',
    '  commissionPercent?: number;',
    '  customFormulaLabel?: string;',
    '  percentages?: Record<string, number>;',
    '  fixedValues?: Record<string, number>;',
    '  currencyAssumptions?: string[];',
    '}',
    '',
    'export interface AgreementSnapshot extends CalculationConfig {',
    '  templateId: string;',
    '  agreementId: string;',
    '  version: number;',
    '  agreementType: AgreementType;',
    '}',
    '',
    'export interface AgreementTemplate {',
    '  id: string; name: string; agreementType: AgreementType;',
    '  calculationMethod: CalculationMethod; calculationConfig: CalculationConfig;',
    '  defaultCurrency: string; notes: string; createdByUserId: string;',
    '  version: number; isActive: boolean; createdAt: string; updatedAt: string;',
    '}',
    '',
    'export interface MerchantAgreement {',
    '  id: string; templateId: string; merchantId: string; merchantName: string;',
    '  agreementType: AgreementType; title: string; status: MerchantAgreementStatus;',
    '  approvedByUserId: string | null; approvedAt: string | null;',
    '  resolvedTermsSnapshot: AgreementSnapshot;',
    '  version: number; isActive: boolean; createdAt: string; updatedAt: string;',
    '}',
    '',
    'export interface Order {',
    '  id: string; direction: OrderDirection;',
    '  merchantId: string; merchantName: string;',
    '  buyerId: string; buyerName: string;',
    '  merchantAgreementId: string; agreementTemplateId: string;',
    '  agreementType: AgreementType; agreementSnapshot: AgreementSnapshot;',
    '  quantity: number; unitPrice: number; totalAmount: number;',
    '  currency: string; computedNetProfit: number;',
    '  status: OrderStatus; createdByUserId: string;',
    '  createdAt: string; updatedAt: string;',
    '}',
    '',
    'export interface OrderDraft {',
    '  direction: OrderDirection; merchantId: string; merchantName: string;',
    '  buyerId: string; buyerName: string; merchantAgreementId: string;',
    '  quantity: number; unitPrice: number; currency: string; status?: OrderStatus;',
    '}',
  ]),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4: BUSINESS LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 4: Business Logic'),

  h2('4.1 Deal Status State Machine — src/lib/merchant-deal-status.ts'),
  p('Only two statuses exist. The only valid forward transition is pending → approved.'),
  ...codeBlock([
    'export const DEAL_STATUS_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {',
    "  pending: ['approved'],",
    '  approved: [],',
    '};',
  ]),

  twoColTable(3000, 6360, [
    ['Function', 'Signature & Behaviour'],
    ['getAllowedDealStatusTransitions', 'getAllowedDealStatusTransitions(status: DealStatus): DealStatus[]\nReturns allowed next states. pending→[approved], approved→[]'],
    ['normalizeDealStatus', "normalizeDealStatus(status: string | null | undefined): DealStatus\nReturns 'approved' if status==='approved', else 'pending'"],
    ['canTransitionDealStatus', 'canTransitionDealStatus(current: DealStatus, next: DealStatus): boolean\nReturns true if in DEAL_STATUS_TRANSITIONS[current] OR current===next'],
    ['assertDealStatusTransition', 'assertDealStatusTransition(current: DealStatus, next: DealStatus): void\nThrows: "Illegal merchant deal status transition: {current} -> {next}"'],
  ]),
  ...spacer(1),

  h2('4.2 Deal Engine — src/lib/deal-engine.ts'),

  h3('SUPPORTED_DEAL_TYPES'),
  ...codeBlock(["export const SUPPORTED_DEAL_TYPES: DealType[] = ['partnership', 'arbitrage'];"]),
  p('Only these two types are shown in the creation UI. Legacy types (lending, capital_placement, general) exist in DB for backward compatibility but isLegacy=true and are hidden from UI.'),

  h3('Deal Type Configurations — DEAL_TYPE_CONFIGS'),
  twoColTable(2600, 6760, [
    ['Field', 'partnership (Profit Share)'],
    ['label', 'Profit Share'],
    ['icon', '\uD83E\uDD1D'],
    ['requiredFields', "['title', 'amount', 'metadata.partner_ratio']"],
    ['optionalFields', "['metadata.settlement_period', 'metadata.min_profit_threshold']"],
    ['allocationBase', 'net_profit'],
    ['eligibleOrderSides', "['sell']"],
    ['requiresApproval', 'true'],
    ['isLegacy', 'false'],
    ['ruleSummaryTemplate', 'Net profit shared {partner_ratio}% to {counterparty_name}, {merchant_ratio}% to merchant. Calculated {settlement_period}.'],
  ]),
  ...spacer(1),
  twoColTable(2600, 6760, [
    ['Field', 'arbitrage (Sales Deal)'],
    ['label', 'Sales Deal'],
    ['icon', '\uD83D\uDCCA'],
    ['requiredFields', "['title', 'amount', 'metadata.counterparty_share_pct']"],
    ['optionalFields', "['due_date', 'metadata.merchant_share_pct', 'metadata.min_order_amount']"],
    ['allocationBase', 'sale_economics'],
    ['eligibleOrderSides', "['sell']"],
    ['requiresApproval', 'true'],
    ['isLegacy', 'false'],
    ['ruleSummaryTemplate', 'Allocates {counterparty_share_pct}% of sale-linked economics to {counterparty_name}, {merchant_share_pct}% to merchant.'],
  ]),
  ...spacer(1),

  h3('calculateNetProfit({ quantity, unitPrice, snapshot }): number'),
  p('Calculates net profit. total = quantity * unitPrice. All rounding uses Math.round((value + Number.EPSILON) * 100) / 100.'),
  twoColTable(2800, 6560, [
    ['agreementType', 'Formula'],
    ['profit_share', 'round(total * profitSharePercent / 100)'],
    ['fixed_margin', 'round(quantity * fixedMarginAmount)'],
    ['spread', 'round(total * spreadPercent / 100)'],
    ['commission', 'round(total * commissionPercent / 100)'],
    ['custom', 'round(sum(fixedValues) + total * sum(percentages) / 100)'],
    ['default', '0'],
  ]),
  ...spacer(1),

  h3('calculateAllocation(deal, orderAmount, orderCurrency, netProfit?): AllocationResult | null'),
  p('sharePct = meta.counterparty_share_pct ?? meta.pool_owner_share_pct ?? meta.partner_ratio ?? 0'),
  ...['partnership: base = netProfit ?? 0; counterpartyAmount = base * sharePct / 100',
    'arbitrage & legacy: base = orderAmount; counterpartyAmount = base * sharePct / 100',
    'merchantAmount = base - counterpartyAmount',
    'Returns: { counterpartyAmount, merchantAmount, allocationBase }'].map(bullet),

  h3('calculateOutstanding(deal): OutstandingResult'),
  p('Returns: { principal, expectedReturn, realizedPnl, outstanding, isOverdue }'),

  h2('4.3 Deal Delete Diagnostics — src/lib/merchant-deal-delete.ts'),
  ...codeBlock([
    'export interface DealDeleteDiagnostics {',
    "  blockers: Array<{ kind: 'settlement' | 'profit'; id: string;",
    "    reason: 'approved_record' | 'pending_approval' }>;",
    "  ignored: Array<{ kind: 'settlement' | 'profit'; id: string;",
    "    reason: 'rejected_record' | 'cancelled_record' | 'expired_record'",
    "           | 'orphaned_pending_record' | 'duplicate_stale_record' }>;",
    '}',
  ]),
  p('analyzeDealDeleteDiagnostics({ dealId, settlements, profits }): DealDeleteDiagnostics'),
  p('Classification rules:'),
  ...['BLOCKER: record.status === "approved" → reason: "approved_record"',
    'BLOCKER: approval_status === "pending" → reason: "pending_approval"',
    'IGNORED: record.status ∈ {rejected, cancelled, expired} → reason: "{status}_record"',
    'IGNORED: orphaned pending (no approval_id) → reason: "orphaned_pending_record"',
    'IGNORED: duplicate stale → reason: "duplicate_stale_record"'].map(bullet),

  h2('4.4 Trading Utilities — src/lib/trading/utils.ts'),
  twoColTable(3200, 6160, [
    ['Function', 'Implementation'],
    ['createId(prefix)', 'Returns `${prefix}-${Math.random().toString(36).slice(2, 10)}`'],
    ['economicTermsChanged(current, next)', 'Returns JSON.stringify(current) !== JSON.stringify(next)'],
    ['createMerchantAgreementSnapshot(template, agreementId, version, overrides?)', 'Merges template.calculationConfig with overrides, adds templateId, agreementId, version, agreementType'],
    ['getMerchantAgreementDeleteMode(agreement, usedAgreementIds)', "Returns 'archive' if agreement.id in usedAgreementIds, else 'delete'"],
    ['buildOrderFromDraft(draft, agreement, userId)', "Validates: agreement.status='approved', isActive=true, merchantId match. Creates Order with immutable agreementSnapshot and calculated computedNetProfit."],
  ]),
  ...spacer(1),
  p('buildOrderFromDraft validation errors (thrown as Error):'),
  ...['Agreement must be approved and active',
    'agreement.merchantId must equal draft.merchantId'].map(bullet),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 5: API CLIENT
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 5: API Client — src/lib/api.ts'),
  p('Base request function prepends /api, attaches Authorization: Bearer {JWT}, throws on non-2xx.'),

  h2('5.1 Merchant Profile'),
  ...codeBlock([
    'merchant.getMyProfile()           // GET /api/merchant/profile/me',
    'merchant.ensureProfile(data)      // POST /api/merchant/profile/ensure',
    'merchant.search(q: string)        // GET /api/merchant/search?q={q}',
    'merchant.checkNickname(nickname)  // GET /api/merchant/check-nickname?nickname={nickname}',
  ]),

  h2('5.2 Invites'),
  ...codeBlock([
    'invites.inbox()            // GET /api/merchant/invites/inbox',
    'invites.sent()             // GET /api/merchant/invites/sent',
    'invites.send(data)         // POST /api/merchant/invites',
    'invites.accept(id)         // POST /api/merchant/invites/{id}/accept',
    'invites.reject(id)         // POST /api/merchant/invites/{id}/reject',
    'invites.withdraw(id)       // POST /api/merchant/invites/{id}/withdraw',
  ]),

  h2('5.3 Relationships'),
  ...codeBlock([
    'relationships.list()       // GET /api/merchant/relationships',
    'relationships.get(id)      // GET /api/merchant/relationships/{id}',
  ]),

  h2('5.4 Deals'),
  ...codeBlock([
    'deals.list(relationshipId?)                   // GET /api/merchant/deals?relationship_id={id}',
    'deals.create(data)                            // POST /api/merchant/deals',
    'deals.update(id, data)                        // PATCH /api/merchant/deals/{id}',
    'deals.delete(id)                              // DELETE /api/merchant/deals/{id}',
    'deals.submitSettlement(dealId, data)          // POST /api/merchant/deals/{dealId}/submit-settlement',
    'deals.recordProfit(dealId, data)              // POST /api/merchant/deals/{dealId}/record-profit',
    'deals.close(dealId, data)                     // POST /api/merchant/deals/{dealId}/close',
  ]),

  h2('5.5 Messages, Approvals, Audit, Notifications'),
  ...codeBlock([
    '// Messages',
    'messages.list(relationshipId)                 // GET /api/merchant/messages/{relId}/messages',
    'messages.send(relId, body, type?, meta?)       // POST /api/merchant/messages/{relId}/messages',
    'messages.markRead(messageId)                  // POST /api/merchant/messages/mark-read/{id}',
    '',
    '// Approvals',
    'approvals.inbox()                             // GET /api/merchant/approvals/inbox',
    'approvals.sent()                              // GET /api/merchant/approvals/sent',
    'approvals.approve(id, note?)                  // POST /api/merchant/approvals/{id}/approve',
    'approvals.reject(id, note?)                   // POST /api/merchant/approvals/{id}/reject',
    '',
    '// Audit',
    'audit.relationship(relationshipId)            // GET /api/merchant/audit/relationship/{id}',
    'audit.activity()                              // GET /api/merchant/audit/activity',
    '',
    '// Notifications',
    'notifications.list(limit?, unread?)           // GET /api/merchant/notifications',
    'notifications.count()                         // GET /api/merchant/notifications/count',
    'notifications.markRead(id)                    // POST /api/merchant/notifications/{id}/read',
    'notifications.markAllRead()                   // POST /api/merchant/notifications/read-all',
  ]),

  h2('5.6 Agreement Templates'),
  ...codeBlock([
    'agreementTemplates.list()             // GET /api/agreement-templates',
    'agreementTemplates.get(id)            // GET /api/agreement-templates/{id}',
    'agreementTemplates.create(data)       // POST /api/agreement-templates',
    'agreementTemplates.update(id, data)   // PATCH /api/agreement-templates/{id}',
    'agreementTemplates.archive(id)        // POST /api/agreement-templates/{id}/archive',
  ]),

  h2('5.7 Merchant Agreements'),
  ...codeBlock([
    'merchantAgreements.list()                     // GET /api/merchant-agreements',
    'merchantAgreements.get(id)                    // GET /api/merchant-agreements/{id}',
    'merchantAgreements.create(data)               // POST /api/merchant-agreements',
    'merchantAgreements.submitForApproval(id)      // POST /api/merchant-agreements/{id}/submit',
    'merchantAgreements.approve(id)                // POST /api/merchant-agreements/{id}/approve',
    'merchantAgreements.reject(id)                 // POST /api/merchant-agreements/{id}/reject',
    'merchantAgreements.archive(id)                // POST /api/merchant-agreements/{id}/archive',
    'merchantAgreements.remove(id)                 // DELETE /api/merchant-agreements/{id}',
    'merchantAgreements.approvedByMerchant(mId)    // GET /api/merchant-agreements/approved?merchantId={id}',
  ]),

  h2('5.8 Orders'),
  ...codeBlock([
    'orders.list()              // GET /api/orders',
    'orders.get(id)             // GET /api/orders/{id}',
    'orders.create(data)        // POST /api/orders',
    'orders.update(id, data)    // PATCH /api/orders/{id}',
    'orders.remove(id)          // DELETE /api/orders/{id}',
    'orders.cancel(id)          // POST /api/orders/{id}/cancel',
    'orders.incoming()          // GET /api/orders/incoming',
    'orders.outgoing()          // GET /api/orders/outgoing',
  ]),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 6: SERVER ROUTES
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 6: Server Routes'),

  h2('6.1 Core Merchant Routes — server/index.ts'),

  h3('Profile Endpoints'),
  twoColTable(3600, 5760, [
    ['Route', 'Description'],
    ['POST /api/merchant/profile/ensure', "Upsert profile. Generates merchant_id='MRC-'+8chars if new. Returns { profile }"],
    ['GET /api/merchant/profile/me', 'Auth required. Returns { profile } or 404'],
    ['GET /api/merchant/search?q={q}', "Returns { results: MerchantSearchResult[] }. Only discoverability='public'."],
    ['GET /api/merchant/check-nickname', 'Returns { available: boolean }'],
  ]),
  ...spacer(1),

  h3('Invite Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/invites/inbox', 'Auth required. Returns invites where to_merchant_id=mine'],
    ['GET /api/merchant/invites/sent', 'Auth required. Returns invites where from_merchant_id=mine'],
    ['POST /api/merchant/invites', 'Body: { to_merchant_id, purpose, requested_role?, message?, requested_scope?, expires_at? }. Creates invite with status=pending'],
    ['POST /api/merchant/invites/:id/accept', "Must be recipient. Creates MerchantRelationship, sets invite status='accepted'. Returns { ok, relationship_id }"],
    ['POST /api/merchant/invites/:id/reject', "Must be recipient. Sets status='rejected'. Returns { ok }"],
    ['POST /api/merchant/invites/:id/withdraw', "Must be sender. Sets status='withdrawn'. Returns { ok }"],
  ]),
  ...spacer(1),

  h3('Relationship Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/relationships', 'Returns { relationships } with counterparty profile and summary'],
    ['GET /api/merchant/relationships/:id', 'Must be participant. Returns full { relationship }'],
  ]),
  ...spacer(1),

  h3('Deal Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/deals?relationship_id={id}', 'Returns { deals }'],
    ['POST /api/merchant/deals', "Body: { relationship_id, deal_type, title, amount, currency?, metadata?, issue_date?, due_date?, expected_return?, created_by }. Validates SUPPORTED_DEAL_TYPES + required metadata. Creates deal status='pending' + deal_create approval."],
    ['PATCH /api/merchant/deals/:id', 'Updates deal fields. Validates status transition if status included.'],
    ['DELETE /api/merchant/deals/:id', 'Runs analyzeDealDeleteDiagnostics. Returns 409 if blockers exist.'],
    ['POST /api/merchant/deals/:id/submit-settlement', "Body: { amount, currency?, note? }. Creates settlement status='pending' + settlement_submit approval."],
    ['POST /api/merchant/deals/:id/record-profit', "Body: { period_key, amount, currency?, note? }. Creates profit_record status='pending' + profit_record_submit approval."],
    ['POST /api/merchant/deals/:id/close', 'Body: { close_date?, realized_pnl? }. Creates deal_close approval.'],
  ]),
  ...spacer(1),

  h3('Message Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/messages/:relId/messages', 'Returns { messages } with is_read per requesting user'],
    ['POST /api/merchant/messages/:relId/messages', 'Body: { body, message_type?, metadata? }. Inserts message, notifies counterparty.'],
    ['POST /api/merchant/messages/mark-read/:messageId', 'Upserts merchant_message_reads (messageId, userId). Returns { ok }'],
  ]),
  ...spacer(1),

  h3('Approval Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/approvals/inbox', "Returns pending approvals where reviewer_user_id=mine"],
    ['GET /api/merchant/approvals/sent', 'Returns approvals submitted by me'],
    ['POST /api/merchant/approvals/:id/approve', "Body: { note? }. Sets status='approved', resolved_at=now()."],
    ['POST /api/merchant/approvals/:id/reject', "Body: { note? }. Sets status='rejected', resolved_at=now()."],
  ]),
  ...spacer(1),

  h3('Audit & Notification Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant/audit/relationship/:id', 'Returns { logs } for relationship'],
    ['GET /api/merchant/audit/activity', 'Returns all audit logs for my relationships'],
    ['GET /api/merchant/notifications', 'Returns { notifications }. Supports ?limit=N&unread=true'],
    ['GET /api/merchant/notifications/count', 'Returns { count } of unread'],
    ['POST /api/merchant/notifications/:id/read', 'Sets read_at=now()'],
    ['POST /api/merchant/notifications/read-all', 'Marks all as read'],
  ]),
  ...spacer(1),

  h2('6.2 Trading Routes — server/trading-routes.ts'),

  h3('Agreement Template Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/agreement-templates', 'Returns { templates } sorted by createdAt desc'],
    ['GET /api/agreement-templates/:id', 'Returns { template } or 404'],
    ['POST /api/agreement-templates', 'Body: { name, agreementType, calculationMethod, calculationConfig, defaultCurrency, notes }. Creates with version=1, isActive=true.'],
    ['PATCH /api/agreement-templates/:id', 'If used in agreements AND economic terms changed → increment version. Returns { template }.'],
    ['POST /api/agreement-templates/:id/archive', 'Sets isActive=false. Returns { ok }'],
  ]),
  ...spacer(1),

  h3('Merchant Agreement Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/merchant-agreements', 'Returns { agreements }'],
    ['GET /api/merchant-agreements/approved?merchantId={id}', "Returns approved, active agreements for merchantId"],
    ['GET /api/merchant-agreements/:id', 'Returns { agreement } or 404'],
    ['POST /api/merchant-agreements', "Body: { templateId, merchantId, merchantName, title, resolvedTermsSnapshot? }. Creates with status='pending', auto-snapshot from template."],
    ['POST /api/merchant-agreements/:id/submit', "Sets status='pending'"],
    ['POST /api/merchant-agreements/:id/approve', "Sets status='approved', approvedByUserId, approvedAt=now()"],
    ['POST /api/merchant-agreements/:id/reject', "Sets status='rejected'"],
    ['POST /api/merchant-agreements/:id/archive', "Sets status='archived', isActive=false"],
    ['DELETE /api/merchant-agreements/:id', "If used in orders → archive (mode='archive'); else delete (mode='delete'). Returns { ok, mode }."],
  ]),
  ...spacer(1),

  h3('Order Endpoints'),
  twoColTable(3800, 5560, [
    ['Route', 'Description'],
    ['GET /api/orders', 'Returns { orders }'],
    ['GET /api/orders/incoming', "Returns { orders } filtered by direction='incoming'"],
    ['GET /api/orders/outgoing', "Returns { orders } filtered by direction='outgoing'"],
    ['GET /api/orders/:id', 'Returns { order } or 404'],
    ['POST /api/orders', 'Body: OrderDraft. Validates: agreement approved+active, merchantId match. Creates via buildOrderFromDraft().'],
    ['PATCH /api/orders/:id', 'Body: Partial OrderDraft & { status? }. Returns { order }.'],
    ["DELETE /api/orders/:id", "Only allowed if status='draft'. Returns { ok }."],
    ['POST /api/orders/:id/cancel', "Sets status='cancelled'. Returns { order }."],
  ]),
  ...spacer(1),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 7: UI PAGES
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 7: UI Pages'),

  h2('7.1 MerchantHubPage — src/pages/merchant/MerchantHubPage.tsx'),
  p('Main entry point for the merchant feature. On mount: loads profile. If no profile → renders OnboardingPage. If profile exists → loads relationships, deals, invites (inbox), approvals (inbox). Contains tabs: Network, Deals, Analytics, Settings.'),
  twoColTable(2800, 6560, [
    ['State', 'Type'],
    ['activeTab', "string — default 'network'"],
    ['profile', 'MerchantProfile | null'],
    ['relationships', 'MerchantRelationship[]'],
    ['deals', 'MerchantDeal[]'],
    ['invites', 'MerchantInvite[]'],
    ['approvals', 'MerchantApproval[]'],
    ['notifications', 'MerchantNotification[]'],
    ['isLoading', 'boolean'],
    ['error', 'string | null'],
  ]),
  ...spacer(1),

  h2('7.2 OnboardingPage — src/pages/merchant/OnboardingPage.tsx'),
  p('153 lines. Shown when user has no merchant profile. Collects: nickname, display_name, merchant_type, region, default_currency, discoverability, bio. Real-time nickname check on change (debounced). On submit: POST /api/merchant/profile/ensure → navigate to hub.'),
  p('Validation: nickname 3-32 chars /^[a-z0-9_-]+$/i; display_name 2-80 chars required; merchant_type required.'),

  h2('7.3 DashboardPage — src/pages/merchant/DashboardPage.tsx'),
  p('275 lines. KPI dashboard.'),
  twoColTable(3000, 6360, [
    ['KPI Card', 'Calculation'],
    ['Total Active Deals', "count(deals where status='approved')"],
    ['Total Exposure', "sum(amount where status='approved')"],
    ['Realized P&L', 'sum(realized_pnl) across all closed deals'],
    ['Pending Approvals', 'count from approvals inbox'],
  ]),
  ...spacer(1),

  h2('7.4 RelationshipWorkspace — src/pages/merchant/RelationshipWorkspace.tsx'),
  p('400+ lines. Props: { relationshipId: string }. Tabs: deals | messages | audit.'),
  p('State: relationship, deals[], messages[], settlements[], profitRecords[], selectedDeal, activeTab, showCreateDeal, showSubmitSettlement, showRecordProfit, newMessage'),
  p('Actions: createDeal(), updateDealStatus(), submitSettlement(), recordProfit(), closeDeal(), sendMessage(), markMessageRead()'),

  h2('7.5 InvitationsPage — src/pages/merchant/InvitationsPage.tsx'),
  p('189 lines. Tabs: inbox | sent. State: inboxInvites[], sentInvites[], showSendInvite, searchQuery, searchResults[], selectedMerchant, purpose, message, requestedRole.'),
  p('searchMerchants() debounced 300ms. sendInvite() → invites.send(). acceptInvite(id) → invites.accept(id) + reload relationships. rejectInvite(id), withdrawInvite(id).'),

  h2('7.6 RelationshipsPage — src/pages/merchant/RelationshipsPage.tsx'),
  p('86 lines. Lists relationship cards: counterparty name, type, status, summary stats. Click → opens RelationshipWorkspace.'),

  h2('7.7 ApprovalsPage — src/pages/merchant/ApprovalsPage.tsx'),
  p('Tabs: inbox | sent. approve(id, note?) and reject(id, note?) actions.'),

  h2('7.8 MessagesPage — src/pages/merchant/MessagesPage.tsx'),
  p('Auto-polls for new messages every 30 seconds. Marks messages as read on view. State: messages[], newMessageBody, selectedRelationshipId.'),

  h2('7.9 SettingsPage — src/pages/merchant/SettingsPage.tsx'),
  p('400+ lines. Sections: Profile Info, Privacy (discoverability), Currency, Danger Zone. Save: PATCH /api/merchant/profile/me with changed fields only.'),

  h2('7.10–7.14 Other Pages'),
  twoColTable(3200, 6160, [
    ['Page', 'Purpose'],
    ['AnalyticsPage', 'Charts: volume over time, deal type breakdown, top counterparties'],
    ['AuditPage', 'Audit log from audit.activity(). Groups by date. Filterable by relationship/action.'],
    ['CRMPage', 'Counterparty relationship management'],
    ['DirectoryPage', "Public merchant directory. Search merchants with discoverability='public'"],
    ['NetworkPage', 'Network visualization of relationships and connections'],
  ]),
  ...spacer(1),

  h2('7.15 OrdersPage — src/pages/trading/OrdersPage.tsx'),
  p('Tabs: all | incoming | outgoing. State: orders[], agreements[], showCreateOrder, selectedOrder.'),
  p('Actions: loadOrders(), createOrder(draft) → orders.create(), cancelOrder(id), deleteOrder(id) [only if status=draft].'),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 8: WORKFLOWS
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 8: Workflows'),

  h2('8.1 Merchant Onboarding'),
  ...['User navigates to /merchant',
    'System calls GET /api/merchant/profile/me',
    'If 404 → show OnboardingPage',
    'User fills: nickname, display_name, merchant_type, region, default_currency, discoverability, bio',
    'Real-time nickname check: GET /api/merchant/check-nickname?nickname={value} (debounced)',
    'On submit: POST /api/merchant/profile/ensure',
    "Server generates merchant_id = 'MRC-' + 8 random alphanumeric chars",
    "Profile created with status='active'",
    'Redirect to MerchantHubPage'].map(t => numbered(t, 0)),

  h2('8.2 Invite & Relationship Creation'),
  ...['Merchant A navigates to InvitationsPage',
    'A searches for B: GET /api/merchant/search?q={query}',
    'A selects B from results, fills: purpose, message, requested_role',
    'POST /api/merchant/invites → invite created with status=pending',
    'B sees invite in inbox: GET /api/merchant/invites/inbox',
    'B reviews invite (purpose, role, message)',
    'B accepts: POST /api/merchant/invites/{id}/accept',
    'Server creates MerchantRelationship (merchant_a_id=A, merchant_b_id=B, status=active)',
    "Server updates invite status='accepted', creates audit log entry",
    'Both parties see relationship in RelationshipsPage'].map(t => numbered(t, 0)),
  p('Alternatives: B rejects → status=rejected; A withdraws → status=withdrawn'),

  h2('8.3 Deal Creation Workflow'),
  ...['In RelationshipWorkspace, user clicks "Create Deal"',
    'User selects deal type (partnership or arbitrage; legacy types hidden)',
    'User fills form per deal type (see validation rules in Part 10)',
    'POST /api/merchant/deals',
    'Server validates required metadata fields',
    "Deal inserted with status='pending'",
    'Server creates MerchantApproval (type=deal_create, reviewer=counterparty user)',
    'Counterparty sees approval in ApprovalsPage inbox',
    'Counterparty approves: POST /api/merchant/approvals/{id}/approve',
    "Server updates deal status='approved'",
    'Deal is now active and can receive settlements/profits'].map(t => numbered(t, 0)),

  h2('8.4 Settlement Submission'),
  ...['User selects approved deal in RelationshipWorkspace',
    '"Submit Settlement" → fills: amount, currency, note',
    'POST /api/merchant/deals/{dealId}/submit-settlement',
    "Server inserts merchant_settlement (status='pending')",
    'Server creates MerchantApproval (type=settlement_submit)',
    "Counterparty approves → settlement status='approved'"].map(t => numbered(t, 0)),

  h2('8.5 Profit Recording'),
  ...['User selects approved deal',
    '"Record Profit" → fills: period_key (YYYY-MM), amount, currency, note',
    'POST /api/merchant/deals/{dealId}/record-profit',
    "Server inserts merchant_profit_records (status='pending')",
    'Server creates MerchantApproval (type=profit_record_submit)',
    "Counterparty approves → profit record status='approved'"].map(t => numbered(t, 0)),

  h2('8.6 Deal Delete'),
  ...['User clicks delete',
    'DELETE /api/merchant/deals/{id}',
    'Server fetches all settlements + profit records for deal',
    'Server fetches approval statuses for each record',
    'analyzeDealDeleteDiagnostics() runs → classifies blockers and ignored',
    'If blockers.length > 0: return 409 with blocker details',
    'If no blockers: delete deal (ignored records are soft-orphaned)'].map(t => numbered(t, 0)),

  h2('8.7 Agreement Template → Order Workflow'),
  ...['Create template: POST /api/agreement-templates (version=1, isActive=true)',
    'Create agreement: POST /api/merchant-agreements (status=pending, snapshot from template)',
    'Approve agreement: POST /api/merchant-agreements/{id}/approve (status=approved)',
    'Create order: POST /api/orders with OrderDraft referencing the approved agreement',
    'Server: buildOrderFromDraft() creates Order with immutable agreementSnapshot',
    'computedNetProfit calculated and stored on the Order',
    'Order status=confirmed (or draft if specified)'].map(t => numbered(t, 0)),

  h2('8.8 Profit Calculation Examples'),
  p('Given: quantity=100, unitPrice=10 (total=1000)'),
  twoColTable(4000, 5360, [
    ['Agreement Type', 'Calculation & Result'],
    ['profit_share (20%)', 'round(1000 * 0.20) = 200.00'],
    ['fixed_margin (2 per unit)', 'round(100 * 2) = 200.00'],
    ['spread (1.5%)', 'round(1000 * 0.015) = 15.00'],
    ['commission (5%)', 'round(1000 * 0.05) = 50.00'],
    ['custom (percentages={fee:2}, fixedValues={base:10})', 'round(10 + 1000 * 0.02) = 30.00'],
  ]),
  ...spacer(1),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 9: ENTITY RELATIONSHIPS
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 9: Entity Relationships'),

  twoColTable(4200, 5160, [
    ['Relationship', 'Foreign Key / Join'],
    ['User (1) → (1) MerchantProfile', 'merchant_profiles.user_id'],
    ['MerchantProfile (2) → MerchantInvite', 'from_merchant_id or to_merchant_id'],
    ['MerchantInvite (1) → (0..1) MerchantRelationship', 'merchant_relationships.invite_id'],
    ['MerchantProfile (2) → (n) MerchantRelationship', 'merchant_a_id or merchant_b_id'],
    ['MerchantRelationship (1) → (n) MerchantDeal', 'merchant_deals.relationship_id'],
    ['MerchantRelationship (1) → (n) MerchantApproval', 'merchant_approvals.relationship_id'],
    ['MerchantRelationship (1) → (n) MerchantMessage', 'merchant_messages.relationship_id'],
    ['MerchantRelationship (1) → (n) MerchantRole', 'merchant_roles.relationship_id'],
    ['MerchantDeal (1) → (n) MerchantSettlement', 'merchant_settlements.deal_id'],
    ['MerchantDeal (1) → (n) ProfitRecord', 'merchant_profit_records.deal_id'],
    ['MerchantDeal (1) → (n) MerchantApproval', "target_entity_id where target_entity_type='deal'"],
    ['AgreementTemplate (1) → (n) MerchantAgreement', 'merchant_agreements.templateId'],
    ['MerchantAgreement (1) → (n) Order', 'orders.merchantAgreementId'],
    ['Order (1) → (1) AgreementSnapshot', 'orders.agreementSnapshot (embedded JSON, immutable)'],
    ['User (1) → (n) MerchantNotification', 'merchant_notifications.user_id'],
    ['User (1) → (n) MerchantAuditLog', 'merchant_audit_logs.actor_user_id'],
  ]),
  ...spacer(1),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 10: VALIDATION RULES
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 10: Validation Rules'),

  h2('10.1 MerchantProfile'),
  twoColTable(3000, 6360, [
    ['Field', 'Rule'],
    ['nickname', '3-32 chars, /^[a-zA-Z0-9_-]+$/, must be unique'],
    ['display_name', '2-80 chars, required'],
    ['merchant_type', 'one of: independent, desk, partner, other'],
    ['discoverability', 'one of: public, merchant_id_only, hidden'],
    ['default_currency', "non-empty string, default 'USDT'"],
    ['status', 'one of: active, restricted, suspended, archived'],
  ]),
  ...spacer(1),

  h2('10.2 MerchantDeal'),
  twoColTable(3000, 6360, [
    ['Field', 'Rule'],
    ['deal_type', 'SUPPORTED_DEAL_TYPES only (arbitrage, partnership) for creation'],
    ['title', 'required, non-empty'],
    ['amount', 'required, number >= 0'],
    ['metadata.partner_ratio', "required if deal_type='partnership', number 0-100"],
    ['metadata.counterparty_share_pct', "required if deal_type='arbitrage', number 0-100"],
    ['currency', "default 'USDT'"],
  ]),
  ...spacer(1),

  h2('10.3 Order'),
  twoColTable(3000, 6360, [
    ['Field', 'Rule'],
    ['merchantAgreementId', 'must reference existing agreement'],
    ['agreement.status', "must be 'approved'"],
    ['agreement.isActive', 'must be true'],
    ['agreement.merchantId', 'must equal draft.merchantId'],
    ['quantity', 'required, number > 0'],
    ['unitPrice', 'required, number >= 0'],
    ['currency', 'required, non-empty'],
  ]),
  ...spacer(1),

  h2('10.4 AgreementTemplate'),
  twoColTable(3000, 6360, [
    ['Field', 'Rule'],
    ['name', 'required, non-empty'],
    ['agreementType', 'one of: profit_share, fixed_margin, spread, commission, custom'],
    ['calculationConfig', 'object with relevant numeric fields per type'],
    ['defaultCurrency', 'required'],
  ]),
  ...spacer(1),

  h2('10.5 Settlement & Profit Record'),
  twoColTable(3000, 6360, [
    ['Field', 'Rule'],
    ['amount', 'required, number > 0'],
    ['period_key (profit)', "format: 'YYYY-MM'"],
    ['deal', 'must exist'],
    ['deal.status (settlement)', "must be 'approved'"],
  ]),
  ...spacer(1),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 11: TEST COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 11: Test Coverage'),

  h2('11.1 merchant-deal-status.test.ts'),
  p('Tests: normalizeDealStatus, getAllowedDealStatusTransitions, canTransitionDealStatus, assertDealStatusTransition'),
  twoColTable(3600, 5760, [
    ['Test Case', 'Expected Result'],
    ['pending → approved', 'VALID'],
    ['pending → pending (idempotent)', 'VALID'],
    ['approved → pending', 'INVALID — throws error'],
    ['approved → approved (idempotent)', 'VALID'],
    ["getAllowedDealStatusTransitions('pending')", "=== ['approved']"],
    ["getAllowedDealStatusTransitions('approved')", "=== []"],
  ]),
  ...spacer(1),

  h2('11.2 merchant-deal-delete.test.ts'),
  p('Tests: analyzeDealDeleteDiagnostics'),
  twoColTable(4000, 5360, [
    ['Test Case', 'Classification'],
    ['No records', 'Empty blockers and ignored'],
    ['Approved settlement', 'BLOCKER: approved_record'],
    ['Approved profit record', 'BLOCKER: approved_record'],
    ['Pending approval on settlement', 'BLOCKER: pending_approval'],
    ['Orphaned pending (no approval_id)', 'IGNORED: orphaned_pending_record'],
    ['Rejected/cancelled/expired records', 'IGNORED: {status}_record'],
    ['Duplicate stale state', 'IGNORED: duplicate_stale_record'],
    ['Unrelated deal records', 'Not included in analysis'],
  ]),
  ...spacer(1),

  h2('11.3 order-workflow.test.ts'),
  p('Tests: buildOrderFromDraft'),
  twoColTable(4000, 5360, [
    ['Test Case', 'Expected Result'],
    ['Successful order with profit_share agreement', 'computedNetProfit is correct'],
    ["Agreement status='pending'", 'Throws validation error'],
    ['Merchant mismatch', 'Throws validation error'],
    ['Template terms change after order created', 'Historical agreementSnapshot preserved (immutable)'],
  ]),
  ...spacer(1),

  h2('11.4–11.6 UI & Agreement Tests'),
  twoColTable(4000, 5360, [
    ['Test File', 'Coverage'],
    ['invitations-page.test.tsx', 'Inbox/sent tabs, accept/reject/send actions, form validation, search debounce'],
    ['relationship-workspace.test.tsx', 'Deals list, create deal form, submit settlement, record profit, message thread'],
    ['agreement-delete.test.ts', "getMerchantAgreementDeleteMode: 'delete' when unused, 'archive' when in orders"],
  ]),
  ...spacer(1),

  new Paragraph({ pageBreakBefore: true, children: [] }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 12: DEMO DATA
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 12: Demo Data — src/lib/trading/demo-data.ts'),
  p('117 lines. Used for development and testing.'),
  ...['3 AgreementTemplates: profit_share, fixed_margin, spread types',
    '5 MerchantAgreements: mix of pending, approved, rejected, archived statuses',
    '10 Orders: mix of incoming/outgoing, confirmed/draft/cancelled, varying profit calculations',
    "All IDs generated via createId(). Realistic merchantId and merchantName values used."].map(bullet),

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 13: MIGRATION FILE
  // ═══════════════════════════════════════════════════════════════════════════
  h1('Part 13: Migration — 004_merchant_deal_statuses.sql'),
  ...codeBlock([
    '-- Migration 004: Add merchant deal status history',
    "ALTER TABLE merchant_deals ADD COLUMN IF NOT EXISTS status_history TEXT DEFAULT '[]';",
    '-- No destructive changes to existing data.',
    "-- Ensures pending deals can only transition to 'approved'.",
  ]),

  ...spacer(2),
  sectionDivider(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: 'End of Document — Merchant Features Implementation Specification', size: 20, italics: true, color: '666666', font: 'Arial' })]
  }),
];

// ─── BUILD DOCUMENT ─────────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22 } }
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 }
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: '2E5F8A' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 }
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '1A3D5C' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 }
      },
      {
        id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: '1A3D5C' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 3 }
      },
    ]
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
          children: [
            new TextRun({ text: 'Merchant Features — Implementation Specification', size: 18, font: 'Arial', color: '555555' }),
            new TextRun({ text: '\t', size: 18 }),
            new TextRun({ text: 'P2P Tracker', size: 18, font: 'Arial', color: ACCENT, bold: true }),
          ],
          tabStops: [{ type: 'right', position: 9360 }],
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 18, font: 'Arial', color: '666666' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '666666' }),
            new TextRun({ text: ' of ', size: 18, font: 'Arial', color: '666666' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '666666' }),
          ]
        })]
      })
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(
    'C:/Data/New_P2P_Tracker/.claude/worktrees/brave-dirac/docs/MERCHANT_FEATURES_IMPLEMENTATION.docx',
    buffer
  );
  console.log('SUCCESS: Document written.');
}).catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
