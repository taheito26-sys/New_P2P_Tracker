import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { merchantAgreements, orders as ordersApi, ApiError } from '@/lib/api';
import { demoTradingData } from '@/lib/trading/demo-data';
import { calculateNetProfit } from '@/lib/trading/profit-service';
import type { MerchantAgreement, Order, OrderDraft } from '@/lib/trading/types';

const initialForm: OrderDraft = {
  direction: 'incoming',
  merchantId: '',
  merchantName: '',
  buyerId: '',
  buyerName: '',
  merchantAgreementId: '',
  quantity: 0,
  unitPrice: 0,
  currency: 'USD',
};

export default function OrdersPage() {
  const { userId } = useAuth();
  const [orderList, setOrderList] = useState<Order[]>([]);
  const [agreements, setAgreements] = useState<MerchantAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [form, setForm] = useState<OrderDraft>(initialForm);
  const [usingDemo, setUsingDemo] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersRes, agreementsRes] = await Promise.all([
        ordersApi.list(),
        merchantAgreements.list(),
      ]);
      setOrderList(ordersRes.orders);
      setAgreements(agreementsRes.agreements);
      setUsingDemo(false);
    } catch (error) {
      console.warn('[OrdersPage] falling back to demo data', error);
      setOrderList(demoTradingData.orders);
      setAgreements(demoTradingData.merchantAgreements);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const merchantOptions = useMemo(() => {
    const merchants = new Map<string, { merchantId: string; merchantName: string }>();
    agreements.forEach((agreement) => {
      merchants.set(agreement.merchantId, {
        merchantId: agreement.merchantId,
        merchantName: agreement.merchantName,
      });
    });
    return [...merchants.values()].sort((a, b) => a.merchantName.localeCompare(b.merchantName));
  }, [agreements]);

  const approvedAgreements = useMemo(
    () => agreements.filter((agreement) => agreement.status === 'approved' && agreement.isActive && agreement.merchantId === form.merchantId),
    [agreements, form.merchantId],
  );

  const selectedAgreement = approvedAgreements.find((agreement) => agreement.id === form.merchantAgreementId) ?? null;
  const previewProfit = selectedAgreement ? calculateNetProfit({ quantity: form.quantity || 0, unitPrice: form.unitPrice || 0, snapshot: selectedAgreement.resolvedTermsSnapshot }) : 0;

  const groupedOrders = useMemo(() => ({
    incoming: orderList.filter((order) => order.direction === 'incoming'),
    outgoing: orderList.filter((order) => order.direction === 'outgoing'),
  }), [orderList]);

  const handleMerchantChange = (merchantId: string) => {
    const merchant = merchantOptions.find((item) => item.merchantId === merchantId);
    setForm((current) => ({ ...current, merchantId, merchantName: merchant?.merchantName ?? '', merchantAgreementId: '' }));
  };

  const handleAgreementChange = (agreementId: string) => {
    setForm((current) => ({ ...current, merchantAgreementId: agreementId }));
  };

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    setForm({
      direction: order.direction,
      merchantId: order.merchantId,
      merchantName: order.merchantName,
      buyerId: order.buyerId,
      buyerName: order.buyerName,
      merchantAgreementId: order.merchantAgreementId,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      currency: order.currency,
      status: order.status,
    });
    setDialogOpen(true);
  };

  const handleCreateOrder = async () => {
    if (!selectedAgreement) {
      toast.error('Select an approved merchant agreement.');
      return;
    }
    if (!form.buyerName.trim() || !(form.quantity > 0) || !(form.unitPrice > 0)) {
      toast.error('Fill buyer, quantity, and unit price.');
      return;
    }

    try {
      const payload = { ...form, buyerId: form.buyerId || form.buyerName.trim().toLowerCase().replace(/\s+/g, '-') };
      if (editingOrder) {
        const response = usingDemo
          ? { order: { ...editingOrder, ...payload, merchantAgreementId: selectedAgreement.id, agreementType: selectedAgreement.agreementType, agreementSnapshot: editingOrder.agreementSnapshot, totalAmount: Number((form.quantity * form.unitPrice).toFixed(2)), computedNetProfit: previewProfit, updatedAt: new Date().toISOString() } }
          : await ordersApi.update(editingOrder.id, payload);
        setOrderList((current) => current.map((order) => order.id === editingOrder.id ? response.order : order));
        toast.success('Order updated.');
      } else {
        const response = usingDemo
          ? { order: { ...demoTradingData.orders[0], ...payload, id: `demo-${Date.now()}`, merchantAgreementId: selectedAgreement.id, agreementTemplateId: selectedAgreement.templateId, agreementType: selectedAgreement.agreementType, agreementSnapshot: selectedAgreement.resolvedTermsSnapshot, totalAmount: Number((form.quantity * form.unitPrice).toFixed(2)), computedNetProfit: previewProfit, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdByUserId: userId || 'demo-user' } }
          : await ordersApi.create(payload);
        setOrderList((current) => [response.order, ...current]);
        toast.success('Order created and added to Orders.');
      }
      setDialogOpen(false);
      setEditingOrder(null);
      setForm(initialForm);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to create order';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (!usingDemo) {
        await ordersApi.remove(deleteTarget.id);
      }
      setOrderList((current) => current.filter((order) => order.id !== deleteTarget.id));
      toast.success('Order deleted.');
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to delete order';
      toast.error(message);
    }
  };

  return (
    <div className="app-page-shell">
      <div className="app-page-content space-y-4">
        <PageHeader
          title="Orders"
          description="All incoming and outgoing merchant deals are first-class backend order records."
        >
          <Button onClick={() => { setEditingOrder(null); setForm(initialForm); setDialogOpen(true); }}>New order</Button>
        </PageHeader>

        {usingDemo && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
            API unavailable, showing the rebuilt workflow with seeded demo records.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <OrderSection title="Incoming orders" orders={groupedOrders.incoming} onEdit={openEditOrder} onDelete={setDeleteTarget} />
          <OrderSection title="Outgoing orders" orders={groupedOrders.outgoing} onEdit={openEditOrder} onDelete={setDeleteTarget} />
        </div>

        {!loading && orderList.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No orders yet. Create the first order from an approved merchant agreement.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Edit order' : 'Create order'}</DialogTitle>
            <DialogDescription>
              Pick a merchant, then choose only from approved agreements for that merchant.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Direction">
              <Select value={form.direction} onValueChange={(value) => setForm((current) => ({ ...current, direction: value as Order['direction'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incoming">Incoming</SelectItem>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Merchant">
              <Select value={form.merchantId} onValueChange={handleMerchantChange}>
                <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                <SelectContent>
                  {merchantOptions.map((merchant) => (
                    <SelectItem key={merchant.merchantId} value={merchant.merchantId}>{merchant.merchantName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Agreement">
              <Select value={form.merchantAgreementId} onValueChange={handleAgreementChange} disabled={!form.merchantId}>
                <SelectTrigger><SelectValue placeholder="Approved agreements only" /></SelectTrigger>
                <SelectContent>
                  {approvedAgreements.map((agreement) => (
                    <SelectItem key={agreement.id} value={agreement.id}>{agreement.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Buyer name">
              <Input value={form.buyerName} onChange={(event) => setForm((current) => ({ ...current, buyerName: event.target.value }))} />
            </Field>
            <Field label="Quantity">
              <Input type="number" value={form.quantity || ''} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} />
            </Field>
            <Field label="Unit price">
              <Input type="number" value={form.unitPrice || ''} onChange={(event) => setForm((current) => ({ ...current, unitPrice: Number(event.target.value) }))} />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
            </Field>
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm">Profit preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Total amount</span><strong>{(form.quantity * form.unitPrice || 0).toFixed(2)} {form.currency}</strong></div>
                <div className="flex justify-between"><span>Computed net profit</span><strong>{previewProfit.toFixed(2)} {form.currency}</strong></div>
                <div className="text-xs text-muted-foreground">Backend remains the source of truth and stores the immutable agreement snapshot on save.</div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder}>{editingOrder ? 'Save changes' : 'Create order'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete order</DialogTitle>
            <DialogDescription>
              This is a hard delete only for orders without downstream dependencies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function OrderSection({ title, orders, onEdit, onDelete }: { title: string; orders: Order[]; onEdit: (order: Order) => void; onDelete: (order: Order) => void; }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders in this direction.</p>
        ) : orders.map((order) => (
          <div key={order.id} className="rounded-lg border p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{order.merchantName}</div>
                <div className="text-sm text-muted-foreground">{order.buyerName}</div>
              </div>
              <Badge variant={order.status === 'cancelled' ? 'destructive' : 'secondary'}>{order.status}</Badge>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <DataRow label="Agreement type" value={order.agreementType} />
              <DataRow label="Quantity" value={String(order.quantity)} />
              <DataRow label="Amount" value={`${order.totalAmount.toFixed(2)} ${order.currency}`} />
              <DataRow label="Net profit" value={`${order.computedNetProfit.toFixed(2)} ${order.currency}`} />
            </dl>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(order)}>Edit</Button>
              <Button variant="destructive" size="sm" onClick={() => onDelete(order)}>Delete</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}
