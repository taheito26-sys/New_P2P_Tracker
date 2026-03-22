import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { useT } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import * as api from '@/lib/api';
import { calculateNetProfit } from '@/lib/trading/profit-service';
import { demoTradingData } from '@/lib/trading/demo-data';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { MerchantAgreement, Order, OrderDraft } from '@/lib/trading/types';
import '@/styles/tracker.css';

export default function OrdersPage() {
  return <OrdersPageWorkspace />;
}

const nowInput = () => new Date().toISOString().slice(0, 16);

function OrdersPageWorkspace() {
  const { settings } = useTheme();
  const { userId } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const actorId = userId || 'demo-user';

  const [orders, setOrders] = useState<Order[]>([]);
  const [agreements, setAgreements] = useState<MerchantAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'incoming' | 'outgoing'>('my');
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});

  const [saleDate, setSaleDate] = useState(nowInput());
  const [saleDirection, setSaleDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [saleAmount, setSaleAmount] = useState('');
  const [saleSell, setSaleSell] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [saleMessage, setSaleMessage] = useState('');
  const [selectedAgreementId, setSelectedAgreementId] = useState('');

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editSell, setEditSell] = useState('');
  const [editBuyer, setEditBuyer] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, agreementsRes] = await Promise.all([api.orders.list(), api.merchantAgreements.list()]);
      setOrders(ordersRes.orders);
      setAgreements(agreementsRes.agreements);
      setUsingDemo(false);
    } catch {
      setOrders(demoTradingData.orders);
      setAgreements(demoTradingData.merchantAgreements);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const merchantOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    agreements.forEach((agreement) => {
      seen.set(agreement.merchantId, { id: agreement.merchantId, name: agreement.merchantName });
    });
    return [...seen.values()];
  }, [agreements]);

  const approvedAgreements = useMemo(
    () => agreements.filter((agreement) => agreement.status === 'approved' && agreement.isActive && agreement.merchantId === merchantId),
    [agreements, merchantId],
  );

  const agreementTypeOptions = useMemo(
    () => approvedAgreements.map((agreement) => ({ id: agreement.id, label: `${agreement.title} · ${agreement.agreementType}`, agreement })),
    [approvedAgreements],
  );

  const selectedAgreement = useMemo(
    () => agreementTypeOptions.find((option) => option.id === selectedAgreementId)?.agreement || null,
    [agreementTypeOptions, selectedAgreementId],
  );

  const query = (settings.searchQuery || '').trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    const list = orders.filter((order) => {
      if (activeTab === 'incoming') return order.direction === 'incoming';
      if (activeTab === 'outgoing') return order.direction === 'outgoing';
      return order.createdByUserId === actorId || !order.createdByUserId;
    });
    if (!query) return list;
    return list.filter((order) => [order.merchantName, order.buyerName || '', order.agreementType || '', order.currency].join(' ').toLowerCase().includes(query));
  }, [orders, activeTab, actorId, query]);

  const incomingOrders = useMemo(() => orders.filter((order) => order.direction === 'incoming'), [orders]);
  const outgoingOrders = useMemo(() => orders.filter((order) => order.direction === 'outgoing'), [orders]);

  const salePreview = useMemo(() => {
    const quantity = Number(saleAmount);
    const unitPrice = Number(saleSell);
    if (!selectedAgreement || !(quantity > 0) || !(unitPrice > 0)) return null;
    return {
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      net: calculateNetProfit({ quantity, unitPrice, snapshot: selectedAgreement.resolvedTermsSnapshot }),
    };
  }, [selectedAgreement, saleAmount, saleSell]);

  const resetForm = () => {
    setSaleDate(nowInput());
    setSaleDirection('incoming');
    setSaleAmount('');
    setSaleSell('');
    setBuyerName('');
    setBuyerId('');
    setMerchantId('');
    setSelectedAgreementId('');
    setSaleMessage('');
  };

  const persistOrder = async (draft: OrderDraft) => {
    if (usingDemo && selectedAgreement) {
      const now = new Date().toISOString();
      return {
        order: {
          id: `demo-${Date.now()}`,
          direction: draft.direction,
          merchantId: draft.merchantId,
          merchantName: draft.merchantName,
          buyerId: draft.buyerId || '',
          buyerName: draft.buyerName || '',
          merchantAgreementId: selectedAgreement.id,
          agreementTemplateId: selectedAgreement.templateId,
          agreementType: selectedAgreement.agreementType,
          agreementSnapshot: structuredClone(selectedAgreement.resolvedTermsSnapshot),
          quantity: draft.quantity,
          unitPrice: draft.unitPrice,
          totalAmount: draft.quantity * draft.unitPrice,
          currency: draft.currency,
          computedNetProfit: calculateNetProfit({ quantity: draft.quantity, unitPrice: draft.unitPrice, snapshot: selectedAgreement.resolvedTermsSnapshot }),
          status: 'confirmed' as const,
          createdByUserId: actorId,
          createdAt: now,
          updatedAt: now,
        },
      };
    }
    return api.orders.create(draft);
  };

  const addTrade = async () => {
    const quantity = Number(saleAmount);
    const unitPrice = Number(saleSell);
    const selectedMerchant = merchantOptions.find((merchant) => merchant.id === merchantId);
    const errs: string[] = [];
    if (!(quantity > 0)) errs.push(t('quantity'));
    if (!(unitPrice > 0)) errs.push(t('sellPriceLabel'));
    if (!buyerName.trim()) errs.push(t('buyerNameRequired'));
    if (!selectedMerchant) errs.push(t('merchant'));
    if (!selectedAgreement) errs.push(t('agreementTypeRequired'));
    if (errs.length) { setSaleMessage(`${t('fixFields')} ${errs.join(', ')}`); return; }

    try {
      const response = await persistOrder({
        direction: saleDirection,
        merchantId: selectedMerchant!.id,
        merchantName: selectedMerchant!.name,
        buyerId: buyerId || null,
        buyerName: buyerName.trim() || null,
        merchantAgreementId: selectedAgreement!.id,
        quantity,
        unitPrice,
        currency: selectedAgreement!.resolvedTermsSnapshot.currencyAssumptions?.[0] || selectedAgreement!.agreementType || 'USD',
      } as OrderDraft);
      setOrders((current) => [response.order, ...current]);
      toast.success(t('tradeLogged'));
      resetForm();
    } catch (error: any) {
      setSaleMessage(error?.message || 'Unable to save order');
    }
  };

  const openEdit = (order: Order) => {
    setEditingOrder(order);
    setEditAmount(String(order.quantity));
    setEditSell(String(order.unitPrice));
    setEditBuyer(order.buyerName || '');
  };

  const saveTradeEdit = async () => {
    if (!editingOrder) return;
    try {
      const quantity = Number(editAmount);
      const unitPrice = Number(editSell);
      const response = usingDemo
        ? {
            order: {
              ...editingOrder,
              quantity,
              unitPrice,
              buyerName: editBuyer,
              totalAmount: quantity * unitPrice,
              updatedAt: new Date().toISOString(),
            },
          }
        : await api.orders.update(editingOrder.id, { quantity, unitPrice, buyerName: editBuyer });
      setOrders((current) => current.map((order) => order.id === editingOrder.id ? response.order : order));
      setEditingOrder(null);
      toast.success(t('saveCorrection'));
    } catch (error: any) {
      toast.error(error?.message || 'Unable to update order');
    }
  };

  const deleteTrade = async () => {
    if (!deleteTarget) return;
    try {
      if (!usingDemo) {
        await api.orders.remove(deleteTarget.id);
      }
      setOrders((current) => current.filter((order) => order.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(t('deletedSuccessfully'));
    } catch (error: any) {
      toast.error(error?.message || 'Unable to delete order');
    }
  };

  const exportCsv = () => {
    const rows = filteredOrders.map((order) => [order.createdAt, order.direction, order.merchantName, order.buyerName, order.quantity, order.unitPrice, order.totalAmount, order.computedNetProfit, order.status].join(','));
    const csv = `Date,Direction,Merchant,Buyer,Qty,Unit Price,Amount,Net Profit,Status\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };

  const renderDetail = (order: Order) => (
    <div className="tradeDetail">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        <span className="pill">{new Date(order.createdAt).toLocaleString()}</span>
        <span className="pill">{t('volume')} {order.totalAmount.toFixed(2)} {order.currency}</span>
        <span className="pill">{t('net')} {order.computedNetProfit.toFixed(2)} {order.currency}</span>
        <span className="pill">{order.direction}</span>
        <span className="pill">{order.status}</span>
      </div>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 5 }}>Agreement snapshot</div>
      <div className="muted" style={{ fontSize: 10 }}>Agreement: {order.agreementType || '—'} · Version {order.agreementSnapshot?.version ?? '—'}</div>
      <div className="muted" style={{ fontSize: 10 }}>Merchant agreement: {order.merchantAgreementId || '—'}</div>
      <div className="muted" style={{ fontSize: 10 }}>Template: {order.agreementTemplateId || '—'}</div>
    </div>
  );

  const renderTable = (list: Order[]) => (
    <div className="tableWrap ledgerWrap">
      <table>
        <thead>
          <tr>
            <th>{t('date')}</th><th>{t('buyer')}</th><th>{t('merchant')}</th><th className="r">{t('qty')}</th><th className="r">{t('sell')}</th><th className="r">{t('volume')}</th><th className="r">{t('net')}</th><th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((order) => (
            <React.Fragment key={order.id}>
              <tr>
                <td>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="mono">{new Date(order.createdAt).toLocaleDateString()}</span>
                    <span className="pill" style={{ fontSize: 8 }}>{order.direction === 'incoming' ? `📥 ${t('incomingOrders')}` : `📤 ${t('outgoingOrders')}`}</span>
                    <span className="pill" style={{ fontSize: 8 }}>{order.status}</span>
                  </div>
                </td>
                <td>{order.buyerName || <span style={{ color: 'var(--muted)', fontSize: 9 }}>—</span>}</td>
                <td>{order.merchantName}</td>
                <td className="mono r">{order.quantity.toFixed(2)}</td>
                <td className="mono r">{order.unitPrice.toFixed(2)}</td>
                <td className="mono r">{order.totalAmount.toFixed(2)}</td>
                <td className="mono r" style={{ color: order.computedNetProfit >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>{order.computedNetProfit >= 0 ? '+' : ''}{order.computedNetProfit.toFixed(2)}</td>
                <td>
                  <div className="actionsRow">
                    <button className="rowBtn" onClick={() => setDetailsOpen((prev) => ({ ...prev, [order.id]: !prev[order.id] }))}>{detailsOpen[order.id] ? t('hideDetails') : t('details')}</button>
                    <button className="rowBtn" onClick={() => openEdit(order)}>{t('edit')}</button>
                    <button className="rowBtn" style={{ color: 'var(--bad)' }} onClick={() => setDeleteTarget(order)}>{t('delete')}</button>
                  </div>
                </td>
              </tr>
              {detailsOpen[order.id] && <tr><td colSpan={8} style={{ padding: 0 }}>{renderDetail(order)}</td></tr>}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={`tracker-root app-page-shell tracker-mobile-screen ${isMobile ? 'tracker-mobile-screen--phone' : ''}`} dir={t.isRTL ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: '100%' }}>
      <div className={`mobileTabBar ${isMobile ? 'tracker-mobile-tabbar' : ''}`} style={{ borderBottom: '1px solid var(--line)', marginBottom: 2 }}>
        {(['my', 'incoming', 'outgoing'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 18px', fontSize: 11, fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--brand)' : 'var(--muted)',
              borderBottom: activeTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
              background: 'transparent', border: 'none', borderBottomStyle: 'solid', cursor: 'pointer',
            }}
          >
            {tab === 'my' ? `👤 ${t('myOrders')}` : tab === 'incoming' ? `📥 ${t('incomingOrders')}` : `📤 ${t('outgoingOrders')}`}
          </button>
        ))}
      </div>

      <div className="twoColPage">
        <div>
          <div className="tracker-kpi-strip" style={{ display: 'flex', gap: 16, padding: '8px 12px', background: 'color-mix(in srgb, var(--brand) 5%, transparent)', borderRadius: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>{t('count').toUpperCase()}</div><div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{filteredOrders.length}</div></div>
            <div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>{t('volume').toUpperCase()}</div><div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{filteredOrders.reduce((sum, order) => sum + order.totalAmount, 0).toFixed(2)}</div></div>
            <div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>{t('net').toUpperCase()}</div><div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{filteredOrders.reduce((sum, order) => sum + order.computedNetProfit, 0).toFixed(2)}</div></div>
          </div>

          <div className="tracker-section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{activeTab === 'my' ? t('trades') : activeTab === 'incoming' ? t('incomingTradeRequestsTitle') : t('outgoingOrders')}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{usingDemo ? 'Demo fallback is active while backend data is unavailable.' : 'Orders are loaded from persisted backend records.'}</div>
            </div>
            <div className="tracker-section-actions" style={{ display: 'flex', gap: 6 }}>
              <span className="pill">{settings.range}</span>
              <button className="btn secondary" onClick={exportCsv}>CSV</button>
            </div>
          </div>

          {loading ? (
            <div className="empty"><div className="empty-t">Loading orders…</div></div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty"><div className="empty-t">{t('noTradesYet')}</div><div className="empty-s">All incoming and outgoing deals will appear here as persisted orders.</div></div>
          ) : renderTable(activeTab === 'incoming' ? incomingOrders : activeTab === 'outgoing' ? outgoingOrders : filteredOrders)}
        </div>

        <div>
          <div className="panel" style={{ padding: 12 }}>
            <div className="hdr">{t('newSale')}</div>
            <div className="muted" style={{ marginBottom: 8 }}>Create or update an order from an approved merchant agreement without changing the existing workflow shell.</div>
            {saleMessage && <div className="msg bad" style={{ marginBottom: 8 }}>{saleMessage}</div>}
            <div className="grid2" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <label className="field"><span>{t('date')}</span><input value={saleDate} onChange={(e) => setSaleDate(e.target.value)} type="datetime-local" /></label>
              <label className="field"><span>Direction</span><select value={saleDirection} onChange={(e) => setSaleDirection(e.target.value as 'incoming' | 'outgoing')}><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select></label>
              <label className="field"><span>{t('merchant')}</span><select value={merchantId} onChange={(e) => { setMerchantId(e.target.value); setSelectedAgreementId(''); }}><option value="">Select merchant</option>{merchantOptions.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>
              <label className="field"><span>{t('agreementTypeLabel')}</span><select value={selectedAgreementId} onChange={(e) => setSelectedAgreementId(e.target.value)}><option value="">{merchantId ? 'Approved agreements only' : 'Select merchant first'}</option>{agreementTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              <label className="field"><span>{t('buyer')}</span><input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></label>
              <label className="field"><span>{t('quantity')}</span><input value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} inputMode="decimal" /></label>
              <label className="field"><span>{t('sellPriceLabel')}</span><input value={saleSell} onChange={(e) => setSaleSell(e.target.value)} inputMode="decimal" /></label>
              <label className="field"><span>Buyer ID</span><input value={buyerId} onChange={(e) => setBuyerId(e.target.value)} /></label>
            </div>
            {salePreview && (
              <div className="tradeDetail" style={{ marginTop: 10 }}>
                <div className="pill">Amount {salePreview.total.toFixed(2)}</div>
                <div className="pill">Net {salePreview.net.toFixed(2)}</div>
                <div className="muted" style={{ marginTop: 6 }}>The backend stores an immutable agreement snapshot and final computed profit when this order is saved.</div>
              </div>
            )}
            <div className="actionsRow" style={{ marginTop: 10 }}>
              <button className="btn" onClick={addTrade}>{t('logSale')}</button>
              <button className="btn secondary" onClick={() => navigate('/deals')}>{t('dealsLabel')}</button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle className="text-base font-bold">{t('correctTradeTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <label className="field"><span>{t('buyer')}</span><input value={editBuyer} onChange={(e) => setEditBuyer(e.target.value)} /></label>
            <label className="field"><span>{t('quantity')}</span><input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label>
            <label className="field"><span>{t('sellPriceLabel')}</span><input value={editSell} onChange={(e) => setEditSell(e.target.value)} /></label>
          </div>
          <DialogFooter>
            <button className="btn secondary" onClick={() => setEditingOrder(null)}>{t('cancel')}</button>
            <button className="btn" onClick={saveTradeEdit}>{t('saveCorrection')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Delete order</DialogTitle></DialogHeader>
          <div className="muted">Delete stays easy in the UI, but backend validation still blocks unsafe deletes when there are dependencies.</div>
          <DialogFooter>
            <button className="btn secondary" onClick={() => setDeleteTarget(null)}>{t('cancel')}</button>
            <button className="btn" onClick={deleteTrade}>{t('delete')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
