import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context, MiddlewareHandler } from 'hono';

type Bindings = {
  DB: D1Database;
  P2P_KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
};

type Variables = {
  userId: string;
};

type MerchantProfile = {
  id: string;
  user_id: string;
  merchant_id: string;
  nickname: string;
  display_name: string;
  merchant_type: string;
  region: string | null;
  default_currency: string;
  discoverability: string;
  bio: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Relationship = {
  id: string;
  merchant_a_id: string;
  merchant_b_id: string;
  invite_id: string | null;
  relationship_type: string;
  status: string;
  shared_fields: string;
  approval_policy: string;
  created_at: string;
  updated_at: string;
};

type Approval = {
  id: string;
  relationship_id: string;
  type: string;
  target_entity_type: string;
  target_entity_id: string;
  proposed_payload: string;
  status: string;
  submitted_by_user_id: string;
  submitted_by_merchant_id: string;
  reviewer_user_id: string;
  resolution_note: string | null;
  submitted_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type RelationshipAccess = {
  relationship: Relationship;
  myProfile: MerchantProfile;
  myMerchantId: string;
  counterpartyMerchantId: string;
  counterpartyProfile: MerchantProfile | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SESSION_COOKIE_NAME = '__Host-session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const LOCAL_DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5000',
]);

function appEnv(c: Context<{ Bindings: Bindings }>): string {
  return (c.env.APP_ENV || 'development').trim().toLowerCase();
}

function isProductionEnv(c: Context<{ Bindings: Bindings }>): boolean {
  return appEnv(c) === 'production';
}

function requestOrigin(c: Context<{ Bindings: Bindings }>): string {
  const url = new URL(c.req.url);
  return url.origin;
}

function allowedOrigins(c: Context<{ Bindings: Bindings }>): string[] {
  const configured = (c.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const sanitized = configured.filter((origin) => origin !== '*');
  const sameOrigin = requestOrigin(c);

  if (sanitized.length > 0) {
    return Array.from(new Set([...sanitized, sameOrigin]));
  }

  if (isProductionEnv(c)) {
    return [sameOrigin];
  }

  return Array.from(new Set([...LOCAL_DEV_ORIGINS, sameOrigin]));
}

function originAllowed(origins: string[], origin: string | undefined): boolean {
  if (!origin) return true;
  if (origins.length === 0) return false;
  return origins.includes(origin);
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function requestIsSecure(c: Context<{ Bindings: Bindings }>): boolean {
  const forwardedProto = c.req.header('X-Forwarded-Proto') || c.req.header('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.toLowerCase() === 'https';
  const url = new URL(c.req.url);
  return url.protocol === 'https:';
}

function sessionCookie(value: string, secure: boolean, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Strict',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PBKDF2_ITERATIONS = 100_000;
const MAX_SUBTLE_PBKDF2_ITERATIONS = 100_000;

async function derivePbkdf2Sha256(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function derivePbkdf2Sha256Fallback(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const block = new Uint8Array(salt.length + 4);
  block.set(salt, 0);
  block.set([0, 0, 0, 1], salt.length);

  let u = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, block));
  const output = u.slice();

  for (let i = 1; i < iterations; i += 1) {
    u = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, u));
    for (let j = 0; j < output.length; j += 1) {
      output[j] ^= u[j];
    }
  }

  return output;
}

async function hashPassword(password: string): Promise<string> {
  const iterations = PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePbkdf2Sha256(password, salt, iterations);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(bits).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${iterations}$${saltHex}$${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.includes('$')) {
    return storedHash === await sha256Hex(password);
  }

  const [scheme, rawIterations, saltHex, expectedHash] = storedHash.split('$');
  if (scheme !== 'pbkdf2' || !rawIterations || !saltHex || !expectedHash) return false;

  const iterations = Number(rawIterations);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) || []);
  const bits = iterations > MAX_SUBTLE_PBKDF2_ITERATIONS
    ? await derivePbkdf2Sha256Fallback(password, salt, iterations)
    : await derivePbkdf2Sha256(password, salt, iterations);

  const actualHash = Array.from(bits).map((b) => b.toString(16).padStart(2, '0')).join('');
  return actualHash === expectedHash;
}

function isMissingRateLimitTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table: auth_rate_limits');
}

async function applyRateLimit(
  c: Context<{ Bindings: Bindings }>,
  action: 'login' | 'signup' | 'reset-password',
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const normalizedIdentifier = identifier.trim().toLowerCase() || 'anonymous';
  const scope = `${action}:${ip}:${normalizedIdentifier}`;
  const now = Date.now();
  const windowStartedAt = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();

  try {
    await c.env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_started_at < datetime("now", "-2 hours")').run();

    const existing = await c.env.DB.prepare(
      'SELECT id, attempts FROM auth_rate_limits WHERE action = ? AND scope = ? AND window_started_at = ?',
    ).bind(action, scope, windowStartedAt).first<{ id: string; attempts: number }>();

    if (!existing) {
      await c.env.DB.prepare(
        'INSERT INTO auth_rate_limits (id, action, scope, attempts, window_started_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(`arl_${crypto.randomUUID()}`, action, scope, 1, windowStartedAt).run();
      return null;
    }

    if (existing.attempts >= limit) {
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    await c.env.DB.prepare('UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE id = ?')
      .bind(existing.id)
      .run();
    return null;
  } catch (error) {
    if (isMissingRateLimitTableError(error)) {
      console.warn('auth_rate_limits table is missing; skipping rate limiting until migration 003 is applied');
      return null;
    }
    throw error;
  }
}

app.use('*', async (c, next) => {
  const origins = allowedOrigins(c);
  return cors({
    origin: (origin) => {
      if (!origin) return '';
      if (originAllowed(origins, origin)) return origin;
      return '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  })(c, next);
});

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const origins = allowedOrigins(c);
  if (origin && !originAllowed(origins, origin)) {
    return c.json({ error: 'Origin not allowed' }, 403);
  }
  await next();
});

async function sessionForRequest(c: Context<{ Bindings: Bindings }>) {
  const cookieToken = parseCookie(c.req.header('Cookie'), SESSION_COOKIE_NAME);
  if (!cookieToken) return null;

  const tokenHash = await sha256Hex(cookieToken);
  const session = await c.env.DB.prepare(
    'SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > datetime("now")',
  ).bind(tokenHash).first<SessionRow>();

  if (session) {
    return session;
  }

  const legacySession = await c.env.DB.prepare(
    'SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > datetime("now")',
  ).bind(cookieToken).first<SessionRow>();

  if (!legacySession) return null;

  await c.env.DB.prepare('UPDATE sessions SET id = ? WHERE id = ?')
    .bind(tokenHash, cookieToken)
    .run();

  return { ...legacySession, id: tokenHash };
}

const requireAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const session = await sessionForRequest(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user_id);
  await next();
};

async function cleanupSessions(c: Context<{ Bindings: Bindings }>) {
  await c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= datetime("now")').run();
}

async function profileByUser(c: Context<{ Bindings: Bindings }>, userId: string) {
  return await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE user_id = ?').bind(userId).first<MerchantProfile>();
}

async function profileByMerchantId(c: Context<{ Bindings: Bindings }>, merchantId: string) {
  return await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE merchant_id = ?').bind(merchantId).first<MerchantProfile>();
}

async function requireProfile(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  return await profileByUser(c, c.get('userId'));
}

async function relationshipAccess(c: Context<{ Bindings: Bindings; Variables: Variables }>, relationshipId: string): Promise<RelationshipAccess | null> {
  const myProfile = await requireProfile(c);
  if (!myProfile) return null;

  const relationship = await c.env.DB.prepare('SELECT * FROM merchant_relationships WHERE id = ?')
    .bind(relationshipId)
    .first<Relationship>();
  if (!relationship) return null;

  const isA = relationship.merchant_a_id === myProfile.merchant_id;
  const isB = relationship.merchant_b_id === myProfile.merchant_id;
  if (!isA && !isB) return null;

  const counterpartyMerchantId = isA ? relationship.merchant_b_id : relationship.merchant_a_id;
  return {
    relationship,
    myProfile,
    myMerchantId: myProfile.merchant_id,
    counterpartyMerchantId,
    counterpartyProfile: await profileByMerchantId(c, counterpartyMerchantId),
  };
}

async function summaryForRelationship(c: Context<{ Bindings: Bindings; Variables: Variables }>, relationshipId: string, myMerchantId: string) {
  const deals = await c.env.DB.prepare('SELECT amount, status, realized_pnl FROM merchant_deals WHERE relationship_id = ?')
    .bind(relationshipId)
    .all<{ amount: number; status: string; realized_pnl: number | null }>();
  const approvals = await c.env.DB.prepare(
    'SELECT count(id) as c FROM merchant_approvals WHERE relationship_id = ? AND submitted_by_merchant_id != ? AND status = ?',
  ).bind(relationshipId, myMerchantId, 'pending').first<{ c: number }>();

  let activeExposure = 0;
  let realizedProfit = 0;
  for (const deal of deals.results) {
    if (['active', 'due', 'overdue'].includes(deal.status)) activeExposure += deal.amount || 0;
    realizedProfit += deal.realized_pnl || 0;
  }

  return {
    totalDeals: deals.results.length,
    activeExposure,
    realizedProfit,
    pendingApprovals: approvals?.c || 0,
  };
}

async function reviewerForRelationship(c: Context<{ Bindings: Bindings; Variables: Variables }>, relationshipId: string, submitterMerchantId: string) {
  const rel = await c.env.DB.prepare('SELECT merchant_a_id, merchant_b_id FROM merchant_relationships WHERE id = ?')
    .bind(relationshipId)
    .first<{ merchant_a_id: string; merchant_b_id: string }>();
  if (!rel) return null;
  const reviewerMerchantId = rel.merchant_a_id === submitterMerchantId ? rel.merchant_b_id : rel.merchant_a_id;
  const reviewer = await profileByMerchantId(c, reviewerMerchantId);
  return reviewer?.user_id || null;
}

async function auditLog(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  input: {
    relationshipId?: string | null;
    actorUserId: string;
    actorMerchantId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    detail?: Record<string, unknown>;
  },
) {
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, relationship_id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `aud_${crypto.randomUUID()}`,
    input.relationshipId || null,
    input.actorUserId,
    input.actorMerchantId || null,
    input.entityType,
    input.entityId,
    input.action,
    JSON.stringify(input.detail || {}),
  ).run();
}

function approvalResponse(approval: Approval) {
  return {
    ...approval,
    proposed_payload: parseJson<Record<string, unknown>>(approval.proposed_payload, {}),
  };
}

type P2POffer = {
  price: number;
  min: number;
  max: number;
  nick: string;
  methods: string[];
  available: number;
};

type P2PSnapshot = {
  ts: number;
  sellAvg: number | null;
  buyAvg: number | null;
  bestSell: number | null;
  bestBuy: number | null;
  sellDepth: number;
  buyDepth: number;
  spread: number | null;
  spreadPct: number | null;
  sellOffers: P2POffer[];
  buyOffers: P2POffer[];
};

type P2PHistoryPoint = {
  ts: number;
  sellAvg: number | null;
  buyAvg: number | null;
  spread: number | null;
  spreadPct: number | null;
};

const TRACKER_LATEST_KEY = 'p2p:latest';
const TRACKER_HISTORY_KEY = 'p2p:history';
const TRACKER_HISTORY_LIMIT = 24 * 12 * 15;

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function generateOffers(seed: number, side: 'sell' | 'buy', basePrice: number): P2POffer[] {
  const rng = createSeededRandom(seed);
  const methods = ['Bank Transfer', 'QNB', 'QIB', 'Vodafone Cash', 'CB Pay', 'Cash'];
  const names = ['DohaDesk', 'QatarFlow', 'MENA-X', 'OTC Gulf', 'Desk 72', 'Capital Link'];
  const offers = Array.from({ length: 10 }, (_, index) => {
    const priceOffset = rng() * 0.025;
    const price = side === 'sell'
      ? basePrice + priceOffset
      : Math.max(0, basePrice - priceOffset);
    return {
      price: Math.round(price * 100) / 100,
      min: Math.round((200 + rng() * 4000) / 10) * 10,
      max: Math.round((4000 + rng() * 50000) / 100) * 100,
      nick: `${names[index % names.length]}-${index + 1}`,
      methods: [methods[index % methods.length], methods[(index + 2) % methods.length]],
      available: Math.round((500 + rng() * 10000) * 100) / 100,
    };
  });

  offers.sort((a, b) => side === 'sell' ? b.price - a.price : a.price - b.price);
  return offers;
}

function buildTrackerSnapshot(now: number): P2PSnapshot {
  const dayBucket = Math.floor(now / (5 * 60 * 1000));
  const rng = createSeededRandom(dayBucket);
  const sellBase = 3.74 + Math.sin(dayBucket / 18) * 0.05 + (rng() - 0.5) * 0.02;
  const buyBase = sellBase - 0.06 - rng() * 0.02;
  const sellOffers = generateOffers(dayBucket, 'sell', sellBase);
  const buyOffers = generateOffers(dayBucket + 7, 'buy', buyBase);
  const topSell = sellOffers.slice(0, 5);
  const topBuy = buyOffers.slice(0, 5);
  const sellAvg = topSell.reduce((sum, offer) => sum + offer.price, 0) / topSell.length;
  const buyAvg = topBuy.reduce((sum, offer) => sum + offer.price, 0) / topBuy.length;
  const spread = sellAvg - buyAvg;

  return {
    ts: now,
    sellAvg: Math.round(sellAvg * 1000) / 1000,
    buyAvg: Math.round(buyAvg * 1000) / 1000,
    bestSell: sellOffers[0]?.price ?? null,
    bestBuy: buyOffers[0]?.price ?? null,
    sellDepth: Math.round(topSell.reduce((sum, offer) => sum + offer.available, 0)),
    buyDepth: Math.round(topBuy.reduce((sum, offer) => sum + offer.available, 0)),
    spread: Math.round(spread * 1000) / 1000,
    spreadPct: buyAvg > 0 ? Math.round(((spread / buyAvg) * 100) * 1000) / 1000 : null,
    sellOffers,
    buyOffers,
  };
}

async function loadTrackerHistory(kv: KVNamespace): Promise<P2PHistoryPoint[]> {
  const history = await kv.get(TRACKER_HISTORY_KEY, 'json');
  return Array.isArray(history) ? history as P2PHistoryPoint[] : [];
}

async function persistTrackerSnapshot(env: Bindings, snapshot: P2PSnapshot): Promise<void> {
  const history = await loadTrackerHistory(env.P2P_KV);
  const nextPoint: P2PHistoryPoint = {
    ts: snapshot.ts,
    sellAvg: snapshot.sellAvg,
    buyAvg: snapshot.buyAvg,
    spread: snapshot.spread,
    spreadPct: snapshot.spreadPct,
  };

  const trimmedHistory = [...history, nextPoint].slice(-TRACKER_HISTORY_LIMIT);
  await Promise.all([
    env.P2P_KV.put(TRACKER_LATEST_KEY, JSON.stringify(snapshot)),
    env.P2P_KV.put(TRACKER_HISTORY_KEY, JSON.stringify(trimmedHistory)),
  ]);
}

async function ensureTrackerState(env: Bindings): Promise<{ snapshot: P2PSnapshot; history: P2PHistoryPoint[] }> {
  const latest = await env.P2P_KV.get(TRACKER_LATEST_KEY, 'json') as P2PSnapshot | null;
  const history = await loadTrackerHistory(env.P2P_KV);

  if (latest && history.length > 0) {
    return { snapshot: latest, history };
  }

  const snapshot = buildTrackerSnapshot(Date.now());
  await persistTrackerSnapshot(env, snapshot);
  return {
    snapshot,
    history: await loadTrackerHistory(env.P2P_KV),
  };
}

app.get('/api/status', (c) => c.json({ ok: true, lastUpdate: new Date().toISOString() }));

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

auth.post('/signup', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}));
  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';
  const limited = await applyRateLimit(c, 'signup', email, 5, 15 * 60);
  if (limited) return limited;

  if (!email || !password || password.length < 8) {
    return c.json({ error: 'Email and password (min 8 chars) are required' }, 400);
  }

  try {
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(crypto.randomUUID(), email, await hashPassword(password))
      .run();
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (message.includes('UNIQUE constraint failed')) return c.json({ error: 'Email already registered' }, 400);
    return c.json({ error: message }, 500);
  }
});

auth.post('/login', async (c) => {
  await cleanupSessions(c);
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}));
  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';
  const limited = await applyRateLimit(c, 'login', email, 10, 15 * 60);
  if (limited) return limited;

  if (!email || !password) return c.json({ error: 'Email and password are required' }, 400);

  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, user.id, expiresAt)
    .run();

  c.header('Set-Cookie', sessionCookie(token, requestIsSecure(c), SESSION_MAX_AGE_SECONDS));
  return c.json({ ok: true, user_id: user.id });
});

auth.post('/logout', requireAuth, async (c) => {
  const session = await sessionForRequest(c);
  if (session) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(session.id).run();
  }
  c.header('Set-Cookie', sessionCookie('', requestIsSecure(c), 0));
  return c.json({ ok: true });
});

auth.get('/session', requireAuth, async (c) => {
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(c.get('userId'))
    .first<{ email: string }>();
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user_id: c.get('userId'), email: user.email });
});

auth.post('/verify-email', async (c) => {
  return c.json({ error: 'Email verification is not configured for this deployment' }, 501);
});

auth.post('/reset-password', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({}));
  const email = body.email?.trim().toLowerCase() || 'anonymous';
  const limited = await applyRateLimit(c, 'reset-password', email, 5, 15 * 60);
  if (limited) return limited;
  return c.json({ error: 'Password reset is not configured for this deployment' }, 501);
});

app.route('/api/auth', auth);

const merchant = new Hono<{ Bindings: Bindings; Variables: Variables }>();
merchant.use('*', requireAuth);

merchant.get('/profile/me', async (c) => c.json({ profile: await requireProfile(c) }));

merchant.post('/profile/ensure', async (c) => {
  const existing = await requireProfile(c);
  if (existing) return c.json({ profile: existing });

  const body = await c.req.json<{
    nickname?: string;
    display_name?: string;
    merchant_type?: string;
    region?: string;
    default_currency?: string;
    discoverability?: string;
    bio?: string;
  }>();
  if (!body.nickname || !body.display_name) return c.json({ error: 'nickname and display_name are required' }, 400);

  try {
    await c.env.DB.prepare(`
      INSERT INTO merchant_profiles (id, user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `pro_${crypto.randomUUID()}`,
      c.get('userId'),
      Math.floor(10000 + Math.random() * 90000).toString(),
      body.nickname.trim(),
      body.display_name.trim(),
      body.merchant_type || 'independent',
      body.region || null,
      body.default_currency || 'USDT',
      body.discoverability || 'public',
      body.bio || null,
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (message.includes('UNIQUE constraint failed')) return c.json({ error: 'Nickname or Merchant ID already taken' }, 400);
    return c.json({ error: message }, 500);
  }

  return c.json({ profile: await requireProfile(c) });
});

// remaining routes unchanged
merchant.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ results: [] });
  const results = await c.env.DB.prepare(`
    SELECT id, merchant_id, nickname, display_name, merchant_type, region
    FROM merchant_profiles
    WHERE status = 'active' AND (nickname LIKE ? OR display_name LIKE ? OR merchant_id LIKE ?)
    LIMIT 20
  `).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return c.json({ results: results.results });
});

merchant.get('/invites/inbox', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ invites: [] });
  const invites = await c.env.DB.prepare(`
    SELECT i.*, p.display_name as from_display_name, p.nickname as from_nickname
    FROM merchant_invites i
    JOIN merchant_profiles p ON i.from_merchant_id = p.merchant_id
    WHERE i.to_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(profile.merchant_id).all();
  return c.json({ invites: invites.results });
});

merchant.get('/invites/sent', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ invites: [] });
  const invites = await c.env.DB.prepare(`
    SELECT i.*, p.display_name as to_display_name, p.nickname as to_nickname
    FROM merchant_invites i
    LEFT JOIN merchant_profiles p ON i.to_merchant_id = p.merchant_id
    WHERE i.from_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(profile.merchant_id).all();
  return c.json({ invites: invites.results });
});

merchant.post('/invites', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ error: 'Merchant profile required' }, 403);
  const body = await c.req.json<{ to_merchant_id?: string; purpose?: string; requested_role?: string; message?: string }>();
  if (!body.to_merchant_id || body.to_merchant_id === profile.merchant_id) {
    return c.json({ error: 'A valid counterparty merchant is required' }, 400);
  }

  const counterparty = await profileByMerchantId(c, body.to_merchant_id);
  if (!counterparty) return c.json({ error: 'Counterparty merchant not found' }, 404);

  const existing = await c.env.DB.prepare(`
    SELECT id FROM merchant_invites
    WHERE from_merchant_id = ? AND to_merchant_id = ? AND status = 'pending'
  `).bind(profile.merchant_id, body.to_merchant_id).first<{ id: string }>();
  if (existing) return c.json({ error: 'A pending invite already exists' }, 409);

  const inviteId = `inv_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO merchant_invites (id, from_merchant_id, to_merchant_id, purpose, requested_role, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(inviteId, profile.merchant_id, body.to_merchant_id, body.purpose || '', body.requested_role || 'operator', body.message || '').run();

  await auditLog(c, {
    actorUserId: c.get('userId'),
    actorMerchantId: profile.merchant_id,
    entityType: 'invite',
    entityId: inviteId,
    action: 'created',
  });

  return c.json({ ok: true });
});

merchant.post('/invites/:id/accept', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ error: 'Merchant profile required' }, 403);

  const invite = await c.env.DB.prepare(`
    SELECT id, from_merchant_id, to_merchant_id
    FROM merchant_invites
    WHERE id = ? AND to_merchant_id = ? AND status = 'pending'
  `).bind(c.req.param('id'), profile.merchant_id).first<{ id: string; from_merchant_id: string; to_merchant_id: string }>();
  if (!invite) return c.json({ error: 'Invite not found or already processed' }, 404);

  const originator = await profileByMerchantId(c, invite.from_merchant_id);
  if (!originator) return c.json({ error: 'Inviting merchant not found' }, 404);

  const relationshipId = `rel_${crypto.randomUUID()}`;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE merchant_invites SET status = ?, updated_at = datetime("now") WHERE id = ?')
      .bind('accepted', invite.id),
    c.env.DB.prepare('INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, invite_id) VALUES (?, ?, ?, ?)')
      .bind(relationshipId, invite.from_merchant_id, invite.to_merchant_id, invite.id),
    c.env.DB.prepare('INSERT INTO merchant_roles (id, relationship_id, merchant_id, user_id, role) VALUES (?, ?, ?, ?, ?)')
      .bind(`role_${crypto.randomUUID()}`, relationshipId, invite.from_merchant_id, originator.user_id, 'owner'),
    c.env.DB.prepare('INSERT INTO merchant_roles (id, relationship_id, merchant_id, user_id, role) VALUES (?, ?, ?, ?, ?)')
      .bind(`role_${crypto.randomUUID()}`, relationshipId, invite.to_merchant_id, profile.user_id, 'owner'),
  ]);

  await auditLog(c, {
    relationshipId,
    actorUserId: c.get('userId'),
    actorMerchantId: profile.merchant_id,
    entityType: 'relationship',
    entityId: relationshipId,
    action: 'created',
    detail: { invite_id: invite.id },
  });

  return c.json({ ok: true, relationship_id: relationshipId });
});

merchant.post('/invites/:id/reject', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ error: 'Merchant profile required' }, 403);

  const result = await c.env.DB.prepare(`
    UPDATE merchant_invites
    SET status = 'rejected', updated_at = datetime("now")
    WHERE id = ? AND to_merchant_id = ? AND status = 'pending'
  `).bind(c.req.param('id'), profile.merchant_id).run();

  if ((result.meta.changes ?? 0) === 0) return c.json({ error: 'Invite not found or not rejectable' }, 404);
  return c.json({ ok: true });
});

merchant.post('/invites/:id/withdraw', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ error: 'Merchant profile required' }, 403);

  const result = await c.env.DB.prepare(`
    UPDATE merchant_invites
    SET status = 'withdrawn', updated_at = datetime("now")
    WHERE id = ? AND from_merchant_id = ? AND status = 'pending'
  `).bind(c.req.param('id'), profile.merchant_id).run();

  if ((result.meta.changes ?? 0) === 0) return c.json({ error: 'Invite not found or not withdrawable' }, 404);
  return c.json({ ok: true });
});

merchant.get('/relationships', async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ relationships: [] });

  const rows = await c.env.DB.prepare(`
    SELECT r.*, p.display_name, p.nickname, p.merchant_id as cp_merchant_id
    FROM merchant_relationships r
    JOIN merchant_profiles p ON p.merchant_id = CASE WHEN r.merchant_a_id = ? THEN r.merchant_b_id ELSE r.merchant_a_id END
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
    ORDER BY r.created_at DESC
  `).bind(profile.merchant_id, profile.merchant_id, profile.merchant_id).all<Relationship & { display_name: string; nickname: string; cp_merchant_id: string }>();

  const relationships = await Promise.all(rows.results.map(async (rel) => ({
    id: rel.id,
    merchant_a_id: rel.merchant_a_id,
    merchant_b_id: rel.merchant_b_id,
    invite_id: rel.invite_id,
    relationship_type: rel.relationship_type,
    status: rel.status,
    shared_fields: parseJson<string[]>(rel.shared_fields, []),
    approval_policy: parseJson<Record<string, unknown>>(rel.approval_policy, {}),
    created_at: rel.created_at,
    updated_at: rel.updated_at,
    counterparty: { merchant_id: rel.cp_merchant_id, display_name: rel.display_name, nickname: rel.nickname },
    my_role: 'owner',
    summary: await summaryForRelationship(c, rel.id, profile.merchant_id),
  })));

  return c.json({ relationships });
});

merchant.get('/relationships/:id', async (c) => {
  const access = await relationshipAccess(c, c.req.param('id'));
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);
  return c.json({
    relationship: {
      ...access.relationship,
      shared_fields: parseJson<string[]>(access.relationship.shared_fields, []),
      approval_policy: parseJson<Record<string, unknown>>(access.relationship.approval_policy, {}),
      counterparty: access.counterpartyProfile ? {
        merchant_id: access.counterpartyProfile.merchant_id,
        display_name: access.counterpartyProfile.display_name,
        nickname: access.counterpartyProfile.nickname,
      } : null,
      my_role: 'owner',
      summary: await summaryForRelationship(c, access.relationship.id, access.myMerchantId),
    },
  });
});

merchant.get('/deals', async (c) => {
  const relationshipId = c.req.query('relationship_id');
  if (relationshipId) {
    const access = await relationshipAccess(c, relationshipId);
    if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);
    const deals = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE relationship_id = ? ORDER BY created_at DESC')
      .bind(relationshipId)
      .all();
    return c.json({ deals: deals.results });
  }

  const profile = await requireProfile(c);
  if (!profile) return c.json({ deals: [] });
  const deals = await c.env.DB.prepare(`
    SELECT d.*
    FROM merchant_deals d
    JOIN merchant_relationships r ON d.relationship_id = r.id
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
    ORDER BY d.created_at DESC
  `).bind(profile.merchant_id, profile.merchant_id).all();
  return c.json({ deals: deals.results });
});

merchant.post('/deals', async (c) => {
  const body = await c.req.json<{
    relationship_id?: string;
    deal_type?: string;
    title?: string;
    amount?: number;
    currency?: string;
    due_date?: string;
    expected_return?: number;
  }>();
  if (!body.relationship_id || !body.title) return c.json({ error: 'relationship_id and title are required' }, 400);
  const access = await relationshipAccess(c, body.relationship_id);
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);

  const dealId = `deal_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, created_by, due_date, expected_return)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    dealId,
    body.relationship_id,
    body.deal_type || 'general',
    body.title,
    body.amount || 0,
    body.currency || 'USDT',
    'draft',
    c.get('userId'),
    body.due_date || null,
    body.expected_return ?? null,
  ).run();

  await auditLog(c, {
    relationshipId: body.relationship_id,
    actorUserId: c.get('userId'),
    actorMerchantId: access.myMerchantId,
    entityType: 'deal',
    entityId: dealId,
    action: 'created',
  });

  return c.json({ ok: true, deal: await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first() });
});

merchant.patch('/deals/:id', async (c) => {
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ relationship_id: string }>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const access = await relationshipAccess(c, deal.relationship_id);
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);

  const body = await c.req.json<{ status?: string }>();
  if (!body.status || !['draft', 'active', 'due', 'settled', 'closed', 'overdue', 'cancelled'].includes(body.status)) {
    return c.json({ error: 'Only valid status updates are supported' }, 400);
  }

  await c.env.DB.prepare('UPDATE merchant_deals SET status = ?, updated_at = datetime("now") WHERE id = ?')
    .bind(body.status, c.req.param('id'))
    .run();

  return c.json({ ok: true, deal: await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(c.req.param('id')).first() });
});

merchant.post('/deals/:id/close', async (c) => {
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ relationship_id: string }>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const access = await relationshipAccess(c, deal.relationship_id);
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);
  const reviewerUserId = await reviewerForRelationship(c, deal.relationship_id, access.myMerchantId);
  if (!reviewerUserId) return c.json({ error: 'Unable to resolve reviewer' }, 409);

  const approvalId = `apr_${crypto.randomUUID()}`;
  const payload = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, reviewer_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, 'deal_close', 'deal', c.req.param('id'), JSON.stringify(payload), 'pending', c.get('userId'), access.myMerchantId, reviewerUserId).run();

  return c.json({ ok: true, approval_id: approvalId });
});

merchant.post('/deals/:id/submit-settlement', async (c) => {
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ relationship_id: string }>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);
  const access = await relationshipAccess(c, deal.relationship_id);
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);

  const body = await c.req.json<{ amount?: number; currency?: string; note?: string }>();
  if (typeof body.amount !== 'number' || body.amount <= 0) return c.json({ error: 'A positive amount is required' }, 400);

  const reviewerUserId = await reviewerForRelationship(c, deal.relationship_id, access.myMerchantId);
  if (!reviewerUserId) return c.json({ error: 'Unable to resolve reviewer' }, 409);

  const settlementId = `stl_${crypto.randomUUID()}`;
  const approvalId = `apr_${crypto.randomUUID()}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO merchant_settlements (id, relationship_id, deal_id, submitted_by_user_id, amount, currency, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(settlementId, deal.relationship_id, c.req.param('id'), c.get('userId'), body.amount, body.currency || 'USDT', body.note || '', 'pending'),
    c.env.DB.prepare(`
      INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, reviewer_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(approvalId, deal.relationship_id, 'settlement_submit', 'settlement', settlementId, JSON.stringify(body), 'pending', c.get('userId'), access.myMerchantId, reviewerUserId),
  ]);

  return c.json({ ok: true, settlement_id: settlementId, approval_id: approvalId });
});

merchant.post('/deals/:id/record-profit', async (c) => {
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ relationship_id: string }>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);
  const access = await relationshipAccess(c, deal.relationship_id);
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);

  const body = await c.req.json<{ amount?: number; period_key?: string; currency?: string; note?: string }>();
  if (typeof body.amount !== 'number') return c.json({ error: 'Profit amount is required' }, 400);

  const reviewerUserId = await reviewerForRelationship(c, deal.relationship_id, access.myMerchantId);
  if (!reviewerUserId) return c.json({ error: 'Unable to resolve reviewer' }, 409);

  const profitId = `prf_${crypto.randomUUID()}`;
  const approvalId = `apr_${crypto.randomUUID()}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO merchant_profit_records (id, relationship_id, deal_id, period_key, amount, currency, note, status, submitted_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(profitId, deal.relationship_id, c.req.param('id'), body.period_key || new Date().toISOString().slice(0, 7), body.amount, body.currency || 'USDT', body.note || '', 'pending', c.get('userId')),
    c.env.DB.prepare(`
      INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, reviewer_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(approvalId, deal.relationship_id, 'profit_record_submit', 'profit', profitId, JSON.stringify(body), 'pending', c.get('userId'), access.myMerchantId, reviewerUserId),
  ]);

  return c.json({ ok: true, profit_id: profitId, approval_id: approvalId });
});

merchant.get('/messages/:id/messages', async (c) => {
  const access = await relationshipAccess(c, c.req.param('id'));
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);
  const messages = await c.env.DB.prepare(`
    SELECT m.*, p.display_name as sender_name
    FROM merchant_messages m
    LEFT JOIN merchant_profiles p ON m.sender_user_id = p.user_id
    WHERE m.relationship_id = ?
    ORDER BY m.created_at ASC
  `).bind(c.req.param('id')).all();

  return c.json({
    messages: messages.results.map((message) => ({
      ...message,
      metadata: parseJson<Record<string, unknown>>((message as { metadata?: string }).metadata, {}),
      is_read: true,
    })),
  });
});

merchant.post('/messages/:id/messages', async (c) => {
  const access = await relationshipAccess(c, c.req.param('id'));
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);

  const body = await c.req.json<{ body?: string; message_type?: string }>();
  if (!body.body?.trim()) return c.json({ error: 'Message body is required' }, 400);

  const messageId = `msg_${crypto.randomUUID()}`;
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, body, message_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(messageId, c.req.param('id'), c.get('userId'), access.myMerchantId, body.body.trim(), body.message_type || 'text').run();

  return c.json({ ok: true, message: await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(messageId).first() });
});

merchant.get('/approvals/inbox', async (c) => {
  const approvals = await c.env.DB.prepare('SELECT * FROM merchant_approvals WHERE reviewer_user_id = ? ORDER BY created_at DESC')
    .bind(c.get('userId'))
    .all<Approval>();
  return c.json({ approvals: approvals.results.map(approvalResponse) });
});

merchant.get('/approvals/sent', async (c) => {
  const approvals = await c.env.DB.prepare('SELECT * FROM merchant_approvals WHERE submitted_by_user_id = ? ORDER BY created_at DESC')
    .bind(c.get('userId'))
    .all<Approval>();
  return c.json({ approvals: approvals.results.map(approvalResponse) });
});

merchant.post('/approvals/:id/approve', async (c) => {
  const approval = await c.env.DB.prepare('SELECT * FROM merchant_approvals WHERE id = ? AND status = ?')
    .bind(c.req.param('id'), 'pending')
    .first<Approval>();
  if (!approval) return c.json({ error: 'Approval not found' }, 404);
  if (approval.reviewer_user_id !== c.get('userId')) return c.json({ error: 'Forbidden' }, 403);

  await c.env.DB.prepare('UPDATE merchant_approvals SET status = ?, resolved_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind('approved', approval.id)
    .run();

  if (approval.target_entity_type === 'settlement') {
    await c.env.DB.prepare('UPDATE merchant_settlements SET status = ?, approved_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
      .bind('approved', approval.target_entity_id)
      .run();
    const settlement = await c.env.DB.prepare('SELECT deal_id FROM merchant_settlements WHERE id = ?')
      .bind(approval.target_entity_id)
      .first<{ deal_id: string }>();
    if (settlement) {
      await c.env.DB.prepare('UPDATE merchant_deals SET status = ?, updated_at = datetime("now") WHERE id = ?')
        .bind('settled', settlement.deal_id)
        .run();
    }
  } else if (approval.target_entity_type === 'profit') {
    await c.env.DB.prepare('UPDATE merchant_profit_records SET status = ?, approved_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
      .bind('approved', approval.target_entity_id)
      .run();
    const profit = await c.env.DB.prepare('SELECT deal_id, amount FROM merchant_profit_records WHERE id = ?')
      .bind(approval.target_entity_id)
      .first<{ deal_id: string; amount: number }>();
    if (profit) {
      await c.env.DB.prepare('UPDATE merchant_deals SET realized_pnl = coalesce(realized_pnl, 0) + ?, updated_at = datetime("now") WHERE id = ?')
        .bind(profit.amount, profit.deal_id)
        .run();
    }
  } else if (approval.type === 'deal_close') {
    await c.env.DB.prepare('UPDATE merchant_deals SET status = ?, close_date = date("now"), updated_at = datetime("now") WHERE id = ?')
      .bind('closed', approval.target_entity_id)
      .run();
  }

  return c.json({ ok: true });
});

merchant.post('/approvals/:id/reject', async (c) => {
  const approval = await c.env.DB.prepare('SELECT * FROM merchant_approvals WHERE id = ? AND status = ?')
    .bind(c.req.param('id'), 'pending')
    .first<Approval>();
  if (!approval) return c.json({ error: 'Approval not found' }, 404);
  if (approval.reviewer_user_id !== c.get('userId')) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
  await c.env.DB.prepare(`
    UPDATE merchant_approvals
    SET status = ?, resolution_note = ?, resolved_at = datetime("now"), updated_at = datetime("now")
    WHERE id = ?
  `).bind('rejected', body.note || null, approval.id).run();
  return c.json({ ok: true });
});

merchant.get('/audit/relationship/:id', async (c) => {
  const access = await relationshipAccess(c, c.req.param('id'));
  if (!access) return c.json({ error: 'Relationship not found or inaccessible' }, 404);
  const logs = await c.env.DB.prepare(`
    SELECT * FROM merchant_audit_logs
    WHERE relationship_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(c.req.param('id')).all();
  return c.json({
    logs: logs.results.map((log) => ({
      ...log,
      detail_json: parseJson<Record<string, unknown>>((log as { detail_json?: string }).detail_json, {}),
    })),
  });
});

merchant.get('/audit/activity', async (c) => {
  const logs = await c.env.DB.prepare(`
    SELECT * FROM merchant_audit_logs
    WHERE actor_user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(c.get('userId')).all();
  return c.json({
    logs: logs.results.map((log) => ({
      ...log,
      detail_json: parseJson<Record<string, unknown>>((log as { detail_json?: string }).detail_json, {}),
    })),
  });
});

app.route('/api/merchant', merchant);

app.get('/api/merchant/notifications', requireAuth, async (c) => {
  const notifications = await c.env.DB.prepare(`
    SELECT *
    FROM merchant_notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(c.get('userId')).all();
  return c.json({ notifications: notifications.results });
});
app.get('/api/merchant/notifications/count', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT count(id) as unread
    FROM merchant_notifications
    WHERE user_id = ? AND read_at IS NULL
  `).bind(c.get('userId')).first<{ unread: number }>();
  return c.json({ unread: result?.unread || 0 });
});
app.post('/api/merchant/notifications/:id/read', requireAuth, async (c) => {
  await c.env.DB.prepare(`
    UPDATE merchant_notifications
    SET read_at = datetime("now")
    WHERE id = ? AND user_id = ?
  `).bind(c.req.param('id'), c.get('userId')).run();
  return c.json({ ok: true });
});
app.post('/api/merchant/notifications/read-all', requireAuth, async (c) => {
  await c.env.DB.prepare(`
    UPDATE merchant_notifications
    SET read_at = datetime("now")
    WHERE user_id = ? AND read_at IS NULL
  `).bind(c.get('userId')).run();
  return c.json({ ok: true });
});
app.get('/api/batches', requireAuth, (c) => c.json({ batches: [] }));
app.get('/api/trades', requireAuth, (c) => c.json({ trades: [] }));
app.get('/api/latest', async (c) => {
  const { snapshot } = await ensureTrackerState(c.env);
  return c.json(snapshot);
});
app.get('/api/history', async (c) => {
  const { history } = await ensureTrackerState(c.env);
  return c.json(history);
});

app.get('/api/analytics', requireAuth, async (c) => {
  const profile = await requireProfile(c);
  if (!profile) return c.json({ error: 'Merchant profile required' }, 403);

  const relationships = await c.env.DB.prepare(`
    SELECT r.*, p.merchant_id as cp_merchant_id, p.display_name as cp_name
    FROM merchant_relationships r
    JOIN merchant_profiles p ON p.merchant_id = CASE WHEN r.merchant_a_id = ? THEN r.merchant_b_id ELSE r.merchant_a_id END
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
  `).bind(profile.merchant_id, profile.merchant_id, profile.merchant_id).all<Relationship & { cp_merchant_id: string; cp_name: string }>();

  const deals = await c.env.DB.prepare(`
    SELECT d.*
    FROM merchant_deals d
    JOIN merchant_relationships r ON d.relationship_id = r.id
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
  `).bind(profile.merchant_id, profile.merchant_id).all<{ relationship_id: string; amount: number; status: string; realized_pnl: number | null; deal_type: string; due_date: string | null }>();

  let totalDeployed = 0;
  let activeDeployed = 0;
  let returnedCapital = 0;
  let realizedProfit = 0;
  let unsettledExposure = 0;
  let overdueDeals = 0;
  const dealsByType: Record<string, number> = {};
  const cpMap = new Map<string, { name: string; deployed: number; returned: number; profit: number }>();

  relationships.results.forEach((rel) => {
    cpMap.set(rel.id, { name: rel.cp_name || rel.cp_merchant_id, deployed: 0, returned: 0, profit: 0 });
  });

  const today = new Date().toISOString().split('T')[0];
  deals.results.forEach((deal) => {
    const isActive = ['active', 'due', 'overdue'].includes(deal.status);
    const isSettled = ['settled', 'closed'].includes(deal.status);
    const isOverdue = deal.status === 'overdue' || Boolean(deal.due_date && deal.due_date < today && isActive);
    if (isOverdue) overdueDeals += 1;

    totalDeployed += deal.amount || 0;
    if (isActive) {
      activeDeployed += deal.amount || 0;
      unsettledExposure += deal.amount || 0;
    }
    if (isSettled) returnedCapital += deal.amount || 0;
    realizedProfit += deal.realized_pnl || 0;
    dealsByType[deal.deal_type] = (dealsByType[deal.deal_type] || 0) + 1;

    const cp = cpMap.get(deal.relationship_id);
    if (cp) {
      cp.deployed += deal.amount || 0;
      if (isSettled) cp.returned += deal.amount || 0;
      cp.profit += deal.realized_pnl || 0;
    }
  });

  const capitalByCounterparty = [...cpMap.values()].map((cp) => ({
    ...cp,
    roi: cp.deployed > 0 ? (cp.profit / cp.deployed) * 100 : 0,
  }));

  const riskIndicators: { type: string; severity: 'high' | 'medium' | 'low'; message: string }[] = [];
  if (overdueDeals > 0) riskIndicators.push({ type: 'overdue', severity: 'high', message: `${overdueDeals} deal(s) overdue.` });
  capitalByCounterparty.forEach((cp) => {
    const pct = totalDeployed > 0 ? (cp.deployed / totalDeployed) * 100 : 0;
    if (pct > 50) {
      riskIndicators.push({ type: 'concentration', severity: 'medium', message: `${cp.name} represents ${pct.toFixed(0)}% of exposure` });
    }
  });

  const pendingApprovals = await c.env.DB.prepare(
    'SELECT count(id) as c FROM merchant_approvals WHERE reviewer_user_id = ? AND status = ?',
  ).bind(c.get('userId'), 'pending').first<{ c: number }>();

  return c.json({
    totalDeployed,
    activeDeployed,
    returnedCapital,
    realizedProfit,
    unsettledExposure,
    overdueDeals,
    activeRelationships: relationships.results.filter((rel) => rel.status === 'active').length,
    pendingApprovals: pendingApprovals?.c || 0,
    capitalByCounterparty,
    dealsByType,
    riskIndicators,
  });
});

app.onError((error, c) => c.json({ error: error.message }, 500));

const worker = {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Bindings, _ctx: ExecutionContext) => {
    const snapshot = buildTrackerSnapshot(Date.now());
    await persistTrackerSnapshot(env, snapshot);
  },
};

export default worker;
