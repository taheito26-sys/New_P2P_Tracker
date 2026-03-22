import type { MiddlewareHandler } from 'hono';
import { demoTradingData } from '../src/lib/trading/demo-data';
import { buildOrderFromDraft, createId, createMerchantAgreementSnapshot, getMerchantAgreementDeleteMode } from '../src/lib/trading/utils';
import type { AgreementTemplate, CalculationConfig, MerchantAgreement, Order, OrderDraft } from '../src/lib/trading/types';

const state: { templates: AgreementTemplate[]; agreements: MerchantAgreement[]; orders: Order[] } = {
  templates: structuredClone(demoTradingData.templates),
  agreements: structuredClone(demoTradingData.merchantAgreements),
  orders: structuredClone(demoTradingData.orders),
};

function now() {
  return new Date().toISOString();
}

function jsonConfig(value: unknown): CalculationConfig {
  return typeof value === 'object' && value ? value as CalculationConfig : {};
}

export function registerTradingRoutes(app: any, requireAuth: MiddlewareHandler<any>) {
  app.get('/api/agreement-templates', requireAuth, (c: any) => c.json({ templates: state.templates }));
  app.get('/api/agreement-templates/:id', requireAuth, (c: any) => {
    const template = state.templates.find((item) => item.id === c.req.param('id'));
    if (!template) return c.json({ error: 'Template not found' }, 404);
    return c.json({ template });
  });
  app.post('/api/agreement-templates', requireAuth, async (c: any) => {
    const body = await c.req.json();
    const timestamp = now();
    const template: AgreementTemplate = {
      id: createId('tpl'),
      name: body.name,
      agreementType: body.agreementType,
      calculationMethod: body.calculationMethod,
      calculationConfig: jsonConfig(body.calculationConfig),
      defaultCurrency: body.defaultCurrency,
      notes: body.notes ?? '',
      createdByUserId: c.get('userId'),
      version: 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.templates.unshift(template);
    return c.json({ template }, 201);
  });
  app.patch('/api/agreement-templates/:id', requireAuth, async (c: any) => {
    const body = await c.req.json();
    const idx = state.templates.findIndex((item) => item.id === c.req.param('id'));
    if (idx < 0) return c.json({ error: 'Template not found' }, 404);
    const current = state.templates[idx];
    const used = state.agreements.some((agreement) => agreement.templateId === current.id);
    const economicChanged = JSON.stringify(current.calculationConfig) !== JSON.stringify(body.calculationConfig ?? current.calculationConfig);
    const next = used && economicChanged
      ? { ...current, id: createId('tpl'), version: current.version + 1, name: body.name ?? current.name, calculationConfig: jsonConfig(body.calculationConfig ?? current.calculationConfig), updatedAt: now(), createdAt: now() }
      : { ...current, ...body, calculationConfig: jsonConfig(body.calculationConfig ?? current.calculationConfig), updatedAt: now() };
    if (used && economicChanged) state.templates.unshift(next); else state.templates[idx] = next;
    return c.json({ template: next });
  });
  app.post('/api/agreement-templates/:id/archive', requireAuth, (c: any) => {
    const template = state.templates.find((item) => item.id === c.req.param('id'));
    if (!template) return c.json({ error: 'Template not found' }, 404);
    template.isActive = false;
    template.updatedAt = now();
    return c.json({ ok: true });
  });

  app.get('/api/merchant-agreements', requireAuth, (c: any) => c.json({ agreements: state.agreements }));
  app.get('/api/merchant-agreements/approved', requireAuth, (c: any) => {
    const merchantId = c.req.query('merchantId');
    return c.json({ agreements: state.agreements.filter((item) => item.merchantId === merchantId && item.status === 'approved' && item.isActive) });
  });
  app.get('/api/merchant-agreements/:id', requireAuth, (c: any) => {
    const agreement = state.agreements.find((item) => item.id === c.req.param('id'));
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    return c.json({ agreement });
  });
  app.post('/api/merchant-agreements', requireAuth, async (c: any) => {
    const body = await c.req.json();
    const template = state.templates.find((item) => item.id === body.templateId);
    if (!template) return c.json({ error: 'Template not found' }, 404);
    const timestamp = now();
    const agreementId = createId('mag');
    const agreement: MerchantAgreement = {
      id: agreementId,
      templateId: template.id,
      merchantId: body.merchantId,
      merchantName: body.merchantName,
      agreementType: template.agreementType,
      title: body.title,
      status: 'pending',
      approvedByUserId: null,
      approvedAt: null,
      resolvedTermsSnapshot: createMerchantAgreementSnapshot(template, agreementId, 1, body.resolvedTermsSnapshot),
      version: 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    state.agreements.unshift(agreement);
    return c.json({ agreement }, 201);
  });
  app.post('/api/merchant-agreements/:id/submit', requireAuth, (c: any) => {
    const agreement = state.agreements.find((item) => item.id === c.req.param('id'));
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    agreement.status = 'pending';
    agreement.updatedAt = now();
    return c.json({ agreement });
  });
  app.post('/api/merchant-agreements/:id/approve', requireAuth, (c: any) => {
    const agreement = state.agreements.find((item) => item.id === c.req.param('id'));
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    agreement.status = 'approved';
    agreement.approvedByUserId = c.get('userId');
    agreement.approvedAt = now();
    agreement.updatedAt = now();
    return c.json({ agreement });
  });
  app.post('/api/merchant-agreements/:id/reject', requireAuth, (c: any) => {
    const agreement = state.agreements.find((item) => item.id === c.req.param('id'));
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    agreement.status = 'rejected';
    agreement.updatedAt = now();
    return c.json({ agreement });
  });
  app.delete('/api/merchant-agreements/:id', requireAuth, (c: any) => {
    const idx = state.agreements.findIndex((item) => item.id === c.req.param('id'));
    if (idx < 0) return c.json({ error: 'Merchant agreement not found' }, 404);
    const agreement = state.agreements[idx];
    const usedAgreementIds = new Set(state.orders.map((order) => order.merchantAgreementId));
    const mode = getMerchantAgreementDeleteMode(agreement, usedAgreementIds);
    if (mode === 'delete') {
      state.agreements.splice(idx, 1);
      return c.json({ ok: true, mode });
    }
    agreement.status = 'archived';
    agreement.isActive = false;
    agreement.updatedAt = now();
    return c.json({ ok: true, mode, message: 'This agreement is already used in orders, so it will be archived instead of permanently deleted.' });
  });

  app.post('/api/merchant-agreements/:id/archive', requireAuth, (c: any) => {
    const agreement = state.agreements.find((item) => item.id === c.req.param('id'));
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    agreement.status = 'archived';
    agreement.isActive = false;
    agreement.updatedAt = now();
    return c.json({ ok: true });
  });

  app.get('/api/orders', requireAuth, (c: any) => c.json({ orders: state.orders }));
  app.get('/api/orders/incoming', requireAuth, (c: any) => c.json({ orders: state.orders.filter((item) => item.direction === 'incoming') }));
  app.get('/api/orders/outgoing', requireAuth, (c: any) => c.json({ orders: state.orders.filter((item) => item.direction === 'outgoing') }));
  app.get('/api/orders/:id', requireAuth, (c: any) => {
    const order = state.orders.find((item) => item.id === c.req.param('id'));
    if (!order) return c.json({ error: 'Order not found' }, 404);
    return c.json({ order });
  });
  app.post('/api/orders', requireAuth, async (c: any) => {
    const body = await c.req.json<OrderDraft>();
    const agreement = state.agreements.find((item) => item.id === body.merchantAgreementId);
    if (!agreement) return c.json({ error: 'Merchant agreement not found' }, 404);
    if (agreement.status !== 'approved') return c.json({ error: 'agreement not approved' }, 422);
    if (!agreement.isActive || agreement.status === 'archived' || agreement.status === 'rejected') return c.json({ error: 'agreement archived or rejected' }, 422);
    if (agreement.merchantId !== body.merchantId) return c.json({ error: 'merchant mismatch' }, 422);
    const order = buildOrderFromDraft(body, agreement, c.get('userId'));
    state.orders.unshift(order);
    return c.json({ order }, 201);
  });
  app.patch('/api/orders/:id', requireAuth, async (c: any) => {
    const body = await c.req.json<Partial<OrderDraft> & { status?: Order['status'] }>();
    const idx = state.orders.findIndex((item) => item.id === c.req.param('id'));
    if (idx < 0) return c.json({ error: 'Order not found' }, 404);
    state.orders[idx] = { ...state.orders[idx], ...body, updatedAt: now() };
    return c.json({ order: state.orders[idx] });
  });
  app.delete('/api/orders/:id', requireAuth, (c: any) => {
    const idx = state.orders.findIndex((item) => item.id === c.req.param('id'));
    if (idx < 0) return c.json({ error: 'Order not found' }, 404);
    if (state.orders[idx].status !== 'draft') return c.json({ error: 'record has dependencies' }, 409);
    state.orders.splice(idx, 1);
    return c.json({ ok: true });
  });
  app.post('/api/orders/:id/cancel', requireAuth, (c: any) => {
    const order = state.orders.find((item) => item.id === c.req.param('id'));
    if (!order) return c.json({ error: 'Order not found' }, 404);
    order.status = 'cancelled';
    order.updatedAt = now();
    return c.json({ order });
  });
}
