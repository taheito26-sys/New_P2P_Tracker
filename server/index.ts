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
    .first() as {id: string, password_hash: string} | null;

  if (!user || user.password_hash !== await hashPassword(password)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expiresAt)
    .run();
    
  c.header('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);

  return c.json({ ok: true, token, user_id: user.id });
});

auth.post('/logout', async (c) => {
  let token = null;
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    const cookieHeader = c.req.header('Cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/session=([^;]+)/);
      if (match) token = match[1];
    }
  }
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run();
  }
  c.header('Set-Cookie', `session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  return c.json({ ok: true });
});

const requireAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  let userId = c.req.header('X-User-Id');
  
  // Try finding session ID from cookie if explicit headers are missing
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // Basic cookie parsing
    const cookieHeader = c.req.header('Cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/session=([^;]+)/);
      if (match) token = match[1];
    }
  }
  
  if (token) {
    const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")')
      .bind(token).first() as {user_id: string} | null;
    if (session) userId = session.user_id;
  }
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  c.set('userId', userId);
  await next();
};

auth.get('/session', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first() as {email: string} | null;
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

merchant.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ results: [] });
  const results = await c.env.DB.prepare(
    `SELECT id, merchant_id, nickname, display_name, merchant_type, region 
     FROM merchant_profiles 
     WHERE nickname LIKE ? OR display_name LIKE ? OR merchant_id LIKE ? LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all();
  return c.json({ results: results.results });
});

merchant.get('/invites/inbox', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ invites: [] });
  
  const results = await c.env.DB.prepare(`
    SELECT i.*, p.display_name as from_display_name, p.nickname as from_nickname
    FROM merchant_invites i
    JOIN merchant_profiles p ON i.from_merchant_id = p.merchant_id
    WHERE i.to_merchant_id = ? ORDER BY i.created_at DESC
  `).bind(profile.merchant_id).all();
  
  return c.json({ invites: results.results });
});

merchant.get('/invites/sent', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ invites: [] });
  
  const results = await c.env.DB.prepare(`
    SELECT i.*, p.display_name as to_display_name, p.nickname as to_nickname
    FROM merchant_invites i
    LEFT JOIN merchant_profiles p ON i.to_merchant_id = p.merchant_id
    WHERE i.from_merchant_id = ? ORDER BY i.created_at DESC
  `).bind(profile.merchant_id).all();
  
  return c.json({ invites: results.results });
});

merchant.post('/invites', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ error: 'No profile' }, 400);
  
  const body = await c.req.json();
  const id = `inv_${crypto.randomUUID()}`;
  
  await c.env.DB.prepare(`
    INSERT INTO merchant_invites (id, from_merchant_id, to_merchant_id, purpose, requested_role, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, profile.merchant_id, body.to_merchant_id, body.purpose || '', body.requested_role || 'operator', body.message || '').run();
  
  return c.json({ ok: true });
});

merchant.post('/invites/:id/accept', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id, id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string, id: string} | null;
  if (!profile) return c.json({ error: 'No profile' }, 400);
  
  const inviteId = c.req.param('id');
  const invite = await c.env.DB.prepare('SELECT * FROM merchant_invites WHERE id = ? AND to_merchant_id = ? AND status = ?').bind(inviteId, profile.merchant_id, 'pending').first() as {from_merchant_id: string, to_merchant_id: string} | null;
  
  if (!invite) return c.json({ error: 'Invite not found or already processed' }, 400);
  
  const relId = `rel_${crypto.randomUUID()}`;
  
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE merchant_invites SET status = ? WHERE id = ?').bind('accepted', inviteId),
    c.env.DB.prepare(`
      INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, invite_id)
      VALUES (?, ?, ?, ?)
    `).bind(relId, invite.from_merchant_id, invite.to_merchant_id, inviteId),
    c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
      .bind(`aud_${crypto.randomUUID()}`, userId, 'relationship', relId, 'created')
  ]);
  
  return c.json({ ok: true, relationship_id: relId });
});

merchant.post('/invites/:id/reject', async (c) => {
  await c.env.DB.prepare('UPDATE merchant_invites SET status = ? WHERE id = ?').bind('rejected', c.req.param('id')).run();
  return c.json({ ok: true });
});

merchant.post('/invites/:id/withdraw', async (c) => {
  await c.env.DB.prepare('UPDATE merchant_invites SET status = ? WHERE id = ?').bind('withdrawn', c.req.param('id')).run();
  return c.json({ ok: true });
});

merchant.get('/relationships', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ relationships: [] });
  
  const results = await c.env.DB.prepare(`
    SELECT r.*, 
    CASE WHEN r.merchant_a_id = ? THEN r.merchant_b_id ELSE r.merchant_a_id END as counterparty_id,
    p.display_name, p.nickname, p.merchant_id as cp_merchant_id
    FROM merchant_relationships r
    JOIN merchant_profiles p ON p.merchant_id = (CASE WHEN r.merchant_a_id = ? THEN r.merchant_b_id ELSE r.merchant_a_id END)
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
  `).bind(profile.merchant_id, profile.merchant_id, profile.merchant_id, profile.merchant_id).all();
  
  const relationships = results.results.map((r: any) => ({
    id: r.id,
    relationship_type: r.relationship_type,
    status: r.status,
    counterparty: {
      merchant_id: r.cp_merchant_id,
      display_name: r.display_name,
      nickname: r.nickname
    },
    my_role: 'owner',
    summary: { totalDeals: 0, activeExposure: 0, realizedProfit: 0, pendingApprovals: 0 }
  }));
  
  return c.json({ relationships });
});

merchant.get('/deals', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ deals: [] });
  
  const relParam = c.req.query('relationship_id');
  let query = `
    SELECT d.*, r.merchant_a_id, r.merchant_b_id 
    FROM merchant_deals d
    JOIN merchant_relationships r ON d.relationship_id = r.id
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?)
  `;
  const binds = [profile.merchant_id, profile.merchant_id];
  
  if (relParam) {
    query += ' AND d.relationship_id = ?';
    binds.push(relParam);
  }
  
  const results = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ deals: results.results });
});

merchant.post('/deals', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const id = `deal_${crypto.randomUUID()}`;
  
  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, created_by, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.relationship_id, body.deal_type || 'general', body.title, body.amount || 0, body.currency || 'USDT', 'active', userId, body.due_date || null).run();
  
  await c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
    .bind(`aud_${crypto.randomUUID()}`, userId, 'deal', id, 'created').run();
    
  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(id).first();
  return c.json({ ok: true, deal });
});

merchant.post('/deals/:id/submit-settlement', async (c) => {
  const dealId = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json();
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?').bind(dealId).first() as {relationship_id:string} | null;
  if(!deal) return c.json({error: 'Deal not found'}, 404);
  
  const stlId = `stl_${crypto.randomUUID()}`;
  const aprId = `apr_${crypto.randomUUID()}`;
  
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO merchant_settlements (id, relationship_id, deal_id, submitted_by_user_id, amount, currency, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(stlId, deal.relationship_id, dealId, userId, body.amount, body.currency || 'USDT', body.note || '', 'pending'),
    c.env.DB.prepare(`
      INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, submitted_by_user_id, submitted_by_merchant_id, reviewer_user_id)
      VALUES (?, ?, 'settlement_submission', 'settlement', ?, ?, ?, 'system')
    `).bind(aprId, deal.relationship_id, stlId, userId, profile?.merchant_id || ''),
    c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
      .bind(`aud_${crypto.randomUUID()}`, userId, 'deal', dealId, 'settlement_submitted')
  ]);
  
  return c.json({ ok: true, settlement_id: stlId, approval_id: aprId });
});

merchant.post('/deals/:id/record-profit', async (c) => {
  const dealId = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json();
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  
  const deal = await c.env.DB.prepare('SELECT relationship_id FROM merchant_deals WHERE id = ?').bind(dealId).first() as {relationship_id:string} | null;
  if(!deal) return c.json({error: 'Deal not found'}, 404);
  
  const profitId = `prf_${crypto.randomUUID()}`;
  const aprId = `apr_${crypto.randomUUID()}`;
  
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO merchant_profit_records (id, relationship_id, deal_id, period_key, amount, currency, note, status, submitted_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(profitId, deal.relationship_id, dealId, body.period_key || new Date().toISOString().slice(0, 7), body.amount, body.currency || 'USDT', body.note || '', 'pending', userId),
    c.env.DB.prepare(`
      INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, submitted_by_user_id, submitted_by_merchant_id, reviewer_user_id)
      VALUES (?, ?, 'profit_submission', 'profit', ?, ?, ?, 'system')
    `).bind(aprId, deal.relationship_id, profitId, userId, profile?.merchant_id || ''),
    c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
      .bind(`aud_${crypto.randomUUID()}`, userId, 'deal', dealId, 'profit_submitted')
  ]);
  
  return c.json({ ok: true, profit_id: profitId, approval_id: aprId });
});

merchant.get('/messages/:id/messages', async (c) => {
  const relId = c.req.param('id');
  const results = await c.env.DB.prepare(`
    SELECT m.*, p.display_name as sender_name 
    FROM merchant_messages m 
    LEFT JOIN merchant_profiles p ON m.sender_user_id = p.user_id 
    WHERE m.relationship_id = ? ORDER BY m.created_at ASC
  `).bind(relId).all();
  return c.json({ messages: results.results });
});

merchant.post('/messages/:id/messages', async (c) => {
  const relId = c.req.param('id');
  const userId = c.get('userId');
  const body = await c.req.json();
  const msgId = `msg_${crypto.randomUUID()}`;
  
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, body, message_type)
    VALUES (?, ?, ?, ?, ?)
  `).bind(msgId, relId, userId, body.body, body.message_type || 'text').run();
  
  const msg = await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(msgId).first();
  return c.json({ ok: true, message: msg });
});

merchant.get('/approvals/inbox', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ approvals: [] });
  
  const results = await c.env.DB.prepare(`
    SELECT a.* 
    FROM merchant_approvals a
    JOIN merchant_relationships r ON a.relationship_id = r.id
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?) AND a.submitted_by_merchant_id != ? AND a.status = 'pending'
  `).bind(profile.merchant_id, profile.merchant_id, profile.merchant_id).all();
  return c.json({ approvals: results.results });
});

merchant.get('/approvals/sent', async (c) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ approvals: [] });
  
  const results = await c.env.DB.prepare(`
    SELECT * FROM merchant_approvals WHERE submitted_by_merchant_id = ? ORDER BY created_at DESC
  `).bind(profile.merchant_id).all();
  return c.json({ approvals: results.results });
});

merchant.post('/approvals/:id/approve', async (c) => {
  const approvalId = c.req.param('id');
  const userId = c.get('userId');
  
  const approval = await c.env.DB.prepare('SELECT * FROM merchant_approvals WHERE id = ? AND status = ?').bind(approvalId, 'pending').first();
  if (!approval) return c.json({ error: 'Approval not found' }, 404);
  
  const updates: any[] = [
    c.env.DB.prepare('UPDATE merchant_approvals SET status = ?, resolved_at = datetime("now") WHERE id = ?').bind('approved', approvalId)
  ];
  
  if (approval.target_entity_type === 'settlement') {
    updates.push(c.env.DB.prepare('UPDATE merchant_settlements SET status = ?, approved_at = datetime("now") WHERE id = ?').bind('approved', approval.target_entity_id));
    const settlement = await c.env.DB.prepare('SELECT deal_id FROM merchant_settlements WHERE id = ?').bind(approval.target_entity_id).first() as {deal_id: string} | null;
    if(settlement) {
      updates.push(c.env.DB.prepare('UPDATE merchant_deals SET status = ? WHERE id = ?').bind('settled', settlement.deal_id));
    }
  } else if (approval.target_entity_type === 'profit') {
    updates.push(c.env.DB.prepare('UPDATE merchant_profit_records SET status = ?, approved_at = datetime("now") WHERE id = ?').bind('approved', approval.target_entity_id));
    const profit = await c.env.DB.prepare('SELECT deal_id, amount FROM merchant_profit_records WHERE id = ?').bind(approval.target_entity_id).first() as {deal_id: string, amount: number} | null;
    if (profit) {
      updates.push(c.env.DB.prepare('UPDATE merchant_deals SET realized_pnl = coalesce(realized_pnl, 0) + ? WHERE id = ?').bind(profit.amount, profit.deal_id));
    }
  }
  
  updates.push(c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
    .bind(`aud_${crypto.randomUUID()}`, userId, approval.target_entity_type, approval.target_entity_id, 'approved'));
    
  await c.env.DB.batch(updates);
  return c.json({ ok: true });
});

merchant.post('/approvals/:id/reject', async (c) => {
  const approvalId = c.req.param('id');
  const userId = c.get('userId');
  await c.env.DB.prepare('UPDATE merchant_approvals SET status = ?, resolved_at = datetime("now") WHERE id = ?').bind('rejected', approvalId).run();
  
  await c.env.DB.prepare('INSERT INTO merchant_audit_logs (id, actor_user_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?, ?)')
    .bind(`aud_${crypto.randomUUID()}`, userId, 'approval', approvalId, 'rejected').run();
  return c.json({ ok: true });
});

merchant.get('/audit/relationship/:id', async (c) => {
  const relId = c.req.param('id');
  const results = await c.env.DB.prepare('SELECT * FROM merchant_audit_logs WHERE entity_type = "relationship" AND entity_id = ? OR action LIKE ? ORDER BY created_at DESC LIMIT 50')
    .bind(relId, `%${relId}%`).all();
  return c.json({ logs: results.results });
});

merchant.get('/audit/activity', async (c) => {
  const userId = c.get('userId');
  const results = await c.env.DB.prepare('SELECT * FROM merchant_audit_logs WHERE actor_user_id = ? ORDER BY created_at DESC LIMIT 50').bind(userId).all();
  return c.json({ logs: results.results });
});

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

app.get('/api/analytics', requireAuth, async (c: any) => {
  const userId = c.get('userId');
  const profile = await c.env.DB.prepare('SELECT merchant_id FROM merchant_profiles WHERE user_id = ?').bind(userId).first() as {merchant_id: string} | null;
  if (!profile) return c.json({ error: 'No profile' }, 404);
  
  // 1. Fetch relationships to build counterparty map
  const rels = await c.env.DB.prepare(`
    SELECT r.*, p.merchant_id as cp_merchant_id, p.display_name cp_name
    FROM merchant_relationships r
    JOIN merchant_profiles p ON p.merchant_id = (CASE WHEN r.merchant_a_id = ? THEN r.merchant_b_id ELSE r.merchant_a_id END)
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
  `).bind(profile.merchant_id, profile.merchant_id, profile.merchant_id).all();

  // 2. Fetch all deals across these relationships
  const deals = await c.env.DB.prepare(`
    SELECT d.*, r.merchant_a_id, r.merchant_b_id 
    FROM merchant_deals d 
    JOIN merchant_relationships r ON d.relationship_id = r.id 
    WHERE r.merchant_a_id = ? OR r.merchant_b_id = ?
  `).bind(profile.merchant_id, profile.merchant_id).all();
  
  let totalDeployed = 0;
  let activeDeployed = 0;
  let returnedCapital = 0;
  let realizedProfit = 0;
  let unsettledExposure = 0;
  let overdueDeals = 0;
  
  const dealsByType: Record<string, number> = {};
  
  const cpMap = new Map<string, {name: string, deployed: number, returned: number, profit: number}>();
  rels.results.forEach((r: any) => {
    cpMap.set(r.id, {
      name: r.cp_name || r.cp_merchant_id,
      deployed: 0, returned: 0, profit: 0
    });
  });

  const today = new Date().toISOString().split('T')[0];

  deals.results.forEach((d: any) => {
    const isActive = ['active', 'due', 'overdue'].includes(d.status);
    const isSettled = ['settled', 'closed'].includes(d.status);
    
    // Check overdue
    let isOverdue = d.status === 'overdue';
    if (d.due_date && d.due_date < today && isActive) isOverdue = true;
    if (isOverdue) overdueDeals++;

    totalDeployed += d.amount;
    if (isActive) {
      activeDeployed += d.amount;
      unsettledExposure += d.amount;
    }
    if (isSettled) returnedCapital += d.amount;
    if (d.realized_pnl) realizedProfit += d.realized_pnl;

    dealsByType[d.deal_type] = (dealsByType[d.deal_type] || 0) + 1;

    const cp = cpMap.get(d.relationship_id);
    if (cp) {
      cp.deployed += d.amount;
      if (isSettled) cp.returned += d.amount;
      if (d.realized_pnl) cp.profit += d.realized_pnl;
    }
  });

  const capitalByCounterparty = [...cpMap.values()].map(c => ({
    ...c,
    roi: c.deployed > 0 ? (c.profit / c.deployed) * 100 : 0
  }));

  // Risk indicators
  const riskIndicators = [];
  if (overdueDeals > 0) {
    riskIndicators.push({
      type: 'overdue', severity: 'high',
      message: `${overdueDeals} deal(s) overdue.`
    });
  }
  
  for (const cp of capitalByCounterparty) {
    const pct = totalDeployed > 0 ? (cp.deployed / totalDeployed) * 100 : 0;
    if (pct > 50) {
      riskIndicators.push({
        type: 'concentration', severity: 'medium',
        message: `${cp.name} represents ${pct.toFixed(0)}% of exposure`
      });
    }
  }

  // Pending approvals
  const pendingApprovalsCount = await c.env.DB.prepare(`
    SELECT count(id) as c FROM merchant_approvals WHERE reviewer_user_id = ? AND status = 'pending'
  `).bind(userId).first() as {c: number} | null;
  const pendingApprovals = pendingApprovalsCount?.c || 0;

  if (pendingApprovals > 3) {
    riskIndicators.push({
      type: 'backlog', severity: 'low',
      message: `${pendingApprovals} pending approvals.`
    });
  }

  return c.json({
    totalDeployed,
    activeDeployed,
    returnedCapital,
    realizedProfit,
    unsettledExposure,
    overdueDeals,
    activeRelationships: rels.results.filter((r:any) => r.status === 'active').length,
    pendingApprovals,
    capitalByCounterparty,
    dealsByType,
    riskIndicators
  });
});

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
