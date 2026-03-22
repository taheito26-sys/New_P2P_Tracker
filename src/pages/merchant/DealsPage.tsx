import { useState, useEffect, useCallback } from 'react';
import { agreementTemplates, merchantAgreements, orders as ordersApi } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Briefcase } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { demoTradingData } from '@/lib/trading/demo-data';
import { economicTermsChanged, getMerchantAgreementDeleteMode } from '@/lib/trading/utils';
import type { AgreementTemplate, CalculationConfig, MerchantAgreement } from '@/lib/trading/types';

const statusColors: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  approved: 'bg-success text-success-foreground',
  rejected: 'bg-destructive text-destructive-foreground',
  archived: 'bg-muted text-muted-foreground',
};

function getConfigValue(config: CalculationConfig) {
  return config.profitSharePercent ?? config.fixedMarginAmount ?? config.spreadPercent ?? config.commissionPercent ?? Object.values(config.percentages || {})[0] ?? 0;
}

export default function DealsPage() {
  const t = useT();
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [agreements, setAgreements] = useState<MerchantAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<{ deals: string | null; relationships: string | null }>({ deals: null, relationships: null });
  const [usingDemo, setUsingDemo] = useState(false);
  const [usedAgreementIds, setUsedAgreementIds] = useState<Set<string>>(new Set());

  const [editingAgreement, setEditingAgreement] = useState<MerchantAgreement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleteDealId, setDeleteDealId] = useState<string | null>(null);

  const getErrorMessage = (err: unknown, fallback: string) => err instanceof Error && err.message ? err.message : fallback;

  const reload = useCallback(async () => {
    setLoading(true);
    const [templatesRes, agreementsRes, ordersRes] = await Promise.allSettled([
      agreementTemplates.list(),
      merchantAgreements.list(),
      ordersApi.list(),
    ]);

    const nextErrors = { deals: null as string | null, relationships: null as string | null };

    if (templatesRes.status === 'fulfilled') {
      setTemplates(templatesRes.value.templates);
    } else {
      nextErrors.deals = getErrorMessage(templatesRes.reason, t('failedLoadDeals'));
      setTemplates(demoTradingData.templates);
      setUsingDemo(true);
    }

    if (agreementsRes.status === 'fulfilled') {
      setAgreements(agreementsRes.value.agreements);
    } else {
      nextErrors.relationships = getErrorMessage(agreementsRes.reason, 'Merchant agreements could not be loaded');
      setAgreements(demoTradingData.merchantAgreements);
      setUsingDemo(true);
    }

    if (ordersRes.status === 'fulfilled') {
      setUsedAgreementIds(new Set(ordersRes.value.orders.map((order) => order.merchantAgreementId).filter(Boolean)));
    } else {
      setUsedAgreementIds(new Set(demoTradingData.orders.map((order) => order.merchantAgreementId)));
      setUsingDemo(true);
    }

    setLoadErrors(nextErrors);
    setLoading(false);
  }, [t]);

  useEffect(() => { void reload(); }, [reload]);

  const openEdit = (agreement: MerchantAgreement) => {
    setEditingAgreement(agreement);
    setEditTitle(agreement.title || '');
    setEditAmount(String(getConfigValue(agreement.resolvedTermsSnapshot)));
    setEditStatus(agreement.status || 'pending');
    setEditNote('');
  };

  const saveEdit = async () => {
    if (!editingAgreement) return;
    const template = templates.find((item) => item.id === editingAgreement.templateId);
    const amount = Number(editAmount);
    if (!(amount >= 0) || !template) { toast.error(t('fixFields') + ' ' + t('dealAmountLabel')); return; }
    const nextConfig: CalculationConfig = template.agreementType === 'profit_share'
      ? { ...editingAgreement.resolvedTermsSnapshot, profitSharePercent: amount }
      : template.agreementType === 'fixed_margin'
        ? { ...editingAgreement.resolvedTermsSnapshot, fixedMarginAmount: amount }
        : template.agreementType === 'spread'
          ? { ...editingAgreement.resolvedTermsSnapshot, spreadPercent: amount }
          : template.agreementType === 'commission'
            ? { ...editingAgreement.resolvedTermsSnapshot, commissionPercent: amount }
            : { ...editingAgreement.resolvedTermsSnapshot, percentages: { ...(editingAgreement.resolvedTermsSnapshot.percentages || {}), custom: amount } };

    try {
      const wasUsed = usedAgreementIds.has(editingAgreement.id);
      if (wasUsed && economicTermsChanged(editingAgreement.resolvedTermsSnapshot, nextConfig)) {
        const versioned: MerchantAgreement = {
          ...editingAgreement,
          id: `${editingAgreement.id}-v${editingAgreement.version + 1}`,
          title: editTitle,
          status: 'pending',
          approvedAt: null,
          approvedByUserId: null,
          version: editingAgreement.version + 1,
          resolvedTermsSnapshot: { ...nextConfig, agreementId: `${editingAgreement.id}-v${editingAgreement.version + 1}`, templateId: editingAgreement.templateId, version: editingAgreement.version + 1, agreementType: editingAgreement.agreementType },
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        setAgreements((current) => [versioned, ...current]);
        toast.success('Economic terms changed, so a new merchant-agreement version was created.');
      } else {
        setAgreements((current) => current.map((agreement) => agreement.id === editingAgreement.id ? { ...agreement, title: editTitle, status: editStatus as MerchantAgreement['status'], updatedAt: new Date().toISOString(), resolvedTermsSnapshot: { ...agreement.resolvedTermsSnapshot, ...nextConfig }, merchantName: editingAgreement.merchantName } : agreement));
        toast.success(t('saveCorrection'));
      }
      setEditingAgreement(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const confirmDelete = async () => {
    if (!deleteDealId) return;
    const agreement = agreements.find((item) => item.id === deleteDealId);
    if (!agreement) return;
    const mode = getMerchantAgreementDeleteMode(agreement, usedAgreementIds);
    if (!usingDemo) {
      const response = await merchantAgreements.remove(agreement.id);
      if (response.mode === 'archive') {
        setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: 'archived', isActive: false, updatedAt: new Date().toISOString() } : item));
        toast.success(response.message || 'This agreement is already used in orders, so it will be archived instead of permanently deleted.');
      } else {
        setAgreements((current) => current.filter((item) => item.id !== agreement.id));
        toast.success(t('deletedSuccessfully'));
      }
    } else if (mode === 'archive') {
      setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: 'archived', isActive: false, updatedAt: new Date().toISOString() } : item));
      toast.success('This agreement is already used in orders, so it will be archived instead of permanently deleted.');
    } else {
      setAgreements((current) => current.filter((item) => item.id !== agreement.id));
      toast.success(t('deletedSuccessfully'));
    }
    setDeleteDealId(null);
    setEditingAgreement(null);
  };

  const approveAgreement = async (agreement: MerchantAgreement) => {
    setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: 'approved', approvedAt: new Date().toISOString(), approvedByUserId: 'current-user' } : item));
    toast.success(t('approved'));
  };

  return (
    <div className="app-page-shell" dir={t.isRTL ? 'rtl' : 'ltr'}>
      <div className="app-page-content space-y-4">
        <PageHeader title={t('dealsLabel')} description={t('allDealsAcross')} />
        <div>
        {usingDemo && (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
            Showing demo-backed agreement data because the API is unavailable.
          </div>
        )}
        {loadErrors.deals && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Deals data could not be loaded. {loadErrors.deals}
          </div>
        )}
        {loadErrors.relationships && (
          <div className="mb-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
            Relationships data could not be loaded. Merchant labels may be unavailable.
          </div>
        )}
        {!loading && agreements.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('noDeals')}</p>
            <p className="text-xs mt-1">Merchant agreements created from templates will appear here without changing the existing table layout.</p>
          </div>
        )}

        {agreements.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('deal')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('status')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('merchant')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('due')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dealAmountLabel')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">P&L</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map(agreement => {
                  const template = templates.find((item) => item.id === agreement.templateId);
                  const deleteMode = getMerchantAgreementDeleteMode(agreement, usedAgreementIds);
                  const economicValue = getConfigValue(agreement.resolvedTermsSnapshot);
                  const merchantName = agreement.merchantName || '—';

                  return (
                    <tr key={agreement.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>📄</span>
                          <div>
                            <p className="font-medium text-sm">{agreement.title || template?.name || 'Agreement'}</p>
                            <p className="text-xs text-muted-foreground">
                              {agreement.agreementType}
                              {template?.name && ` · ${template.name}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusColors[agreement.status] || statusColors.pending}`}>{agreement.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {merchantName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm">{merchantName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {agreement.createdAt && <span>{agreement.createdAt.slice(0, 10)}</span>}
                        {agreement.approvedAt && <span className="ml-1">→ {agreement.approvedAt.slice(0, 10)}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold">{economicValue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{template?.defaultCurrency || 'USD'}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-muted-foreground">{usedAgreementIds.has(agreement.id) ? 'Snapshot locked' : 'Reusable'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(agreement)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors">{t('edit')}</button>
                          {agreement.status === 'pending' && <button onClick={() => approveAgreement(agreement)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors">Approve</button>}
                          <button onClick={() => setDeleteDealId(agreement.id)} className="px-3 py-1.5 text-xs font-medium rounded-md border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors">{t('delete')}</button>
                          {deleteMode === 'archive' && <span className="text-[11px] text-muted-foreground">Deletes as archive after use</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <Dialog open={!!editingAgreement} onOpenChange={open => !open && setEditingAgreement(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{t('correctTradeTitle')}</DialogTitle>
            <DialogDescription>
              Review the merchant agreement details and update status using the new pending/approved/rejected/archive workflow.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            Used agreements keep historical order snapshots unchanged; economic edits create a new version automatically.
          </div>

          {editingAgreement && (
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-primary mb-2">Agreement summary</div>
              <div className="flex justify-between items-center mb-1"><span className="text-sm">Merchant</span><strong className="font-mono text-sm">{editingAgreement.merchantName}</strong></div>
              <div className="flex justify-between items-center"><span className="text-sm">Version</span><strong className="font-mono text-sm">v{editingAgreement.version}</strong></div>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-sm font-medium block">Title<input className="mt-1 w-full rounded-md border px-3 py-2" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label>
            <label className="text-sm font-medium block">Economic value<input className="mt-1 w-full rounded-md border px-3 py-2" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label>
            <label className="text-sm font-medium block">Status<select className="mt-1 w-full rounded-md border px-3 py-2" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="archived">archived</option></select></label>
            <label className="text-sm font-medium block">Note<input className="mt-1 w-full rounded-md border px-3 py-2" value={editNote} onChange={(e) => setEditNote(e.target.value)} /></label>
          </div>

          <DialogFooter>
            <button className="px-3 py-2 rounded-md border" onClick={() => setEditingAgreement(null)}>{t('cancel')}</button>
            <button className="px-3 py-2 rounded-md border bg-primary text-primary-foreground" onClick={saveEdit}>{t('saveCorrection')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDealId} onOpenChange={open => !open && setDeleteDealId(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t('delete')}</DialogTitle>
            <DialogDescription>Delete stays easy in the current UI. If this agreement is already used in orders, it will be archived instead of permanently deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="px-3 py-2 rounded-md border" onClick={() => setDeleteDealId(null)}>{t('cancel')}</button>
            <button className="px-3 py-2 rounded-md border bg-destructive text-destructive-foreground" onClick={confirmDelete}>{t('delete')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
