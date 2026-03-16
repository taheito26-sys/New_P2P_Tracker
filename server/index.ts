import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  P2P_KV: KVNamespace;
};

type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Email'],
  credentials: true,
}));

const hashPassword = async (password: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Basic status check
app.get('/api/status', (c) => {
  return c.json({ ok: true, lastUpdate: new Date().toISOString() });
});

// Auth Routes
const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();
auth.post('/signup', async (c) => {
  try {
    const { email, password } = await c.req.json();
    const userId = crypto.randomUUID();
    const passHash = await hashPassword(password);
    
    await c.env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(userId, email, passHash)
      .run();
    
    return c.json({ ok: true, user_id: userId });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Email already registered' }, 400);
    }
    return c.json({ error: e.message }, 500);
  }
});

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<{id: string, password_hash: string}>();

  if (!user || user.password_hash !== await hashPassword(password)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expiresAt)
    .run();

  return c.json({ ok: true, token, user_id: user.id });
});

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  }
  return c.json({ ok: true });
});

const requireAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  let userId = c.req.header('X-User-Id');
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")')
      .bind(token).first<{user_id: string}>();
    if (session) userId = session.user_id;
  }
  
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', userId);
  await next();
};

auth.get('/session', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{email: string}>();
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user_id: userId, email: user.email });
});

app.route('/api/auth', auth);

// Merchant Routes
const merchant = new Hono<{ Bindings: Bindings; Variables: Variables }>();
merchant.use('*', requireAuth);

merchant.get('/profile/me', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE user_id = ?').bind(userId).first();
  return c.json({ profile });
});

merchant.post('/profile/ensure', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = `pro_${crypto.randomUUID()}`;
  const merchantId = Math.floor(10000 + Math.random() * 90000).toString(); // 5 digit
  
  try {
    await c.env.DB.prepare(`
      INSERT INTO merchant_profiles (id, user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, merchantId, body.nickname, body.display_name, 
      body.merchant_type || 'independent', body.region || null, 
      body.default_currency || 'USDT', body.discoverability || 'public', 
      body.bio || null
    ).run();

    const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE user_id = ?').bind(userId).first();
    return c.json({ profile });
  } catch (e: any) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Nickname or Merchant ID already taken' }, 400);
    }
    return c.json({ error: e.message }, 500);
  }
});

merchant.get('/relationships', (c) => c.json({ relationships: [] }));
merchant.get('/deals', (c) => c.json({ deals: [] }));
merchant.get('/messages/:id/messages', (c) => c.json({ messages: [] }));
merchant.get('/approvals/inbox', (c) => c.json({ approvals: [] }));
merchant.get('/approvals/sent', (c) => c.json({ approvals: [] }));
merchant.get('/audit/activity', (c) => c.json({ logs: [] }));

app.route('/api/merchant', merchant);

// Additional Mock Routes
app.get('/api/merchant/notifications', (c) => c.json({ notifications: [] }));
app.get('/api/batches', (c) => c.json({ batches: [] }));
app.get('/api/trades', (c) => c.json({ trades: [] }));
app.get('/api/latest', (c) => c.json({
  ts: Date.now(),
  sellAvg: 3.65, buyAvg: 3.64, bestSell: 3.66, bestBuy: 3.63,
  sellDepth: 1000, buyDepth: 1000, spread: 0.01, spreadPct: 0.27,
  sellOffers: [], buyOffers: []
}));
app.get('/api/history', (c) => c.json([]));

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
