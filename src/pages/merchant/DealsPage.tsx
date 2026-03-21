import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { agreementTemplates, merchantAgreements, ApiError } from '@/lib/api';
import { demoTradingData } from '@/lib/trading/demo-data';
import { economicTermsChanged } from '@/lib/trading/utils';
import type { AgreementTemplate, CalculationConfig, MerchantAgreement } from '@/lib/trading/types';

const defaultTemplateForm = {
  name: '',
  agreementType: 'profit_share' as AgreementTemplate['agreementType'],
  calculationMethod: 'profit_share' as AgreementTemplate['calculationMethod'],
  value: '0',
  defaultCurrency: 'USD',
  notes: '',
};

const defaultAgreementForm = {
  templateId: '',
  merchantId: '',
  merchantName: '',
  title: '',
};

function configFromForm(type: AgreementTemplate['agreementType'], value: string): CalculationConfig {
  const numeric = Number(value);
  switch (type) {
    case 'profit_share': return { profitSharePercent: numeric, percentages: { merchant: numeric }, currencyAssumptions: ['USD'] };
    case 'fixed_margin': return { fixedMarginAmount: numeric, fixedValues: { marginPerUnit: numeric }, currencyAssumptions: ['USD'] };
    case 'spread': return { spreadPercent: numeric, percentages: { spread: numeric }, currencyAssumptions: ['USD'] };
    case 'commission': return { commissionPercent: numeric, percentages: { commission: numeric }, currencyAssumptions: ['USD'] };
    case 'custom': return { percentages: { custom: numeric }, fixedValues: {}, customFormulaLabel: 'Custom formula', currencyAssumptions: ['USD'] };
  }
}

export default function DealsPage() {
  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [agreements, setAgreements] = useState<MerchantAgreement[]>([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [agreementDialog, setAgreementDialog] = useState(false);
  const [templateForm, setTemplateForm] = useState(defaultTemplateForm);
  const [agreementForm, setAgreementForm] = useState(defaultAgreementForm);
  const [editingTemplate, setEditingTemplate] = useState<AgreementTemplate | null>(null);
  const [editingAgreement, setEditingAgreement] = useState<MerchantAgreement | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'template' | 'agreement'; id: string } | null>(null);

  const loadData = async () => {
    try {
      const [templatesRes, agreementsRes] = await Promise.all([
        agreementTemplates.list(),
        merchantAgreements.list(),
      ]);
      setTemplates(templatesRes.templates);
      setAgreements(agreementsRes.agreements);
      setUsingDemo(false);
    } catch (error) {
      console.warn('[AgreementsPage] falling back to demo data', error);
      setTemplates(demoTradingData.templates);
      setAgreements(demoTradingData.merchantAgreements);
      setUsingDemo(true);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const approvedCountByMerchant = useMemo(() => {
    const counts = new Map<string, number>();
    agreements.filter((agreement) => agreement.status === 'approved').forEach((agreement) => {
      counts.set(agreement.merchantId, (counts.get(agreement.merchantId) ?? 0) + 1);
    });
    return counts;
  }, [agreements]);

  const openTemplateEditor = (template?: AgreementTemplate) => {
    setEditingTemplate(template ?? null);
    setTemplateForm(template ? {
      name: template.name,
      agreementType: template.agreementType,
      calculationMethod: template.calculationMethod,
      value: String(template.calculationConfig.profitSharePercent ?? template.calculationConfig.fixedMarginAmount ?? template.calculationConfig.spreadPercent ?? template.calculationConfig.commissionPercent ?? 0),
      defaultCurrency: template.defaultCurrency,
      notes: template.notes,
    } : defaultTemplateForm);
    setTemplateDialog(true);
  };

  const openAgreementEditor = (agreement?: MerchantAgreement) => {
    setEditingAgreement(agreement ?? null);
    setAgreementForm(agreement ? {
      templateId: agreement.templateId,
      merchantId: agreement.merchantId,
      merchantName: agreement.merchantName,
      title: agreement.title,
    } : defaultAgreementForm);
    setAgreementDialog(true);
  };

  const saveTemplate = async () => {
    const calculationConfig = configFromForm(templateForm.agreementType, templateForm.value);
    try {
      if (editingTemplate) {
        const nextConfig = calculationConfig;
        const usedTemplate = agreements.some((agreement) => agreement.templateId === editingTemplate.id);
        if (usedTemplate && economicTermsChanged(editingTemplate.calculationConfig, nextConfig)) {
          toast.success('Economic term changes create a new version in the rebuilt model.');
        }
        if (!usingDemo) {
          const response = await agreementTemplates.update(editingTemplate.id, {
            name: templateForm.name,
            agreementType: templateForm.agreementType,
            calculationMethod: templateForm.calculationMethod,
            calculationConfig: nextConfig,
            defaultCurrency: templateForm.defaultCurrency,
            notes: templateForm.notes,
          });
          setTemplates((current) => current.map((template) => template.id === editingTemplate.id ? response.template : template));
        } else {
          setTemplates((current) => current.map((template) => template.id === editingTemplate.id ? { ...template, name: templateForm.name, calculationConfig: nextConfig, updatedAt: new Date().toISOString() } : template));
        }
      } else if (!usingDemo) {
        const response = await agreementTemplates.create({
          name: templateForm.name,
          agreementType: templateForm.agreementType,
          calculationMethod: templateForm.calculationMethod,
          calculationConfig,
          defaultCurrency: templateForm.defaultCurrency,
          notes: templateForm.notes,
        });
        setTemplates((current) => [response.template, ...current]);
      } else {
        setTemplates((current) => [{
          id: `demo-template-${Date.now()}`,
          name: templateForm.name,
          agreementType: templateForm.agreementType,
          calculationMethod: templateForm.calculationMethod,
          calculationConfig,
          defaultCurrency: templateForm.defaultCurrency,
          notes: templateForm.notes,
          createdByUserId: 'demo-user',
          version: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, ...current]);
      }
      toast.success(editingTemplate ? 'Template updated.' : 'Template created.');
      setTemplateDialog(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save template');
    }
  };

  const saveAgreement = async () => {
    try {
      if (editingAgreement) {
        toast.success('Approved used agreements are versioned on economic term changes; metadata stays easy to edit.');
        setAgreements((current) => current.map((agreement) => agreement.id === editingAgreement.id ? { ...agreement, title: agreementForm.title, merchantName: agreementForm.merchantName, updatedAt: new Date().toISOString() } : agreement));
      } else if (!usingDemo) {
        const response = await merchantAgreements.create(agreementForm);
        setAgreements((current) => [response.agreement, ...current]);
      } else {
        const template = templates.find((item) => item.id === agreementForm.templateId);
        if (!template) {
          toast.error('Select a template first.');
          return;
        }
        setAgreements((current) => [{
          id: `demo-agreement-${Date.now()}`,
          templateId: template.id,
          merchantId: agreementForm.merchantId,
          merchantName: agreementForm.merchantName,
          agreementType: template.agreementType,
          title: agreementForm.title,
          status: 'pending',
          approvedByUserId: null,
          approvedAt: null,
          resolvedTermsSnapshot: {
            agreementId: `demo-agreement-${Date.now()}`,
            templateId: template.id,
            version: 1,
            agreementType: template.agreementType,
            ...template.calculationConfig,
          },
          version: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, ...current]);
      }
      toast.success(editingAgreement ? 'Merchant agreement updated.' : 'Merchant agreement created.');
      setAgreementDialog(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to save merchant agreement');
    }
  };

  const reviewAgreement = async (agreement: MerchantAgreement, action: 'approve' | 'reject') => {
    try {
      if (!usingDemo) {
        const response = action === 'approve'
          ? await merchantAgreements.approve(agreement.id)
          : await merchantAgreements.reject(agreement.id);
        setAgreements((current) => current.map((item) => item.id === agreement.id ? response.agreement : item));
      } else {
        setAgreements((current) => current.map((item) => item.id === agreement.id ? { ...item, status: action === 'approve' ? 'approved' : 'rejected', approvedAt: action === 'approve' ? new Date().toISOString() : null } : item));
      }
      toast.success(`Agreement ${action}d.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : `Failed to ${action} agreement`);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.kind === 'template') {
      const isUsed = agreements.some((agreement) => agreement.templateId === confirmDelete.id);
      if (isUsed) {
        setTemplates((current) => current.map((template) => template.id === confirmDelete.id ? { ...template, isActive: false, updatedAt: new Date().toISOString() } : template));
        toast.success('Used template archived instead of deleted.');
      } else {
        setTemplates((current) => current.filter((template) => template.id !== confirmDelete.id));
        toast.success('Unused template deleted.');
      }
    } else {
      const isUsed = demoTradingData.orders.some((order) => order.merchantAgreementId === confirmDelete.id);
      if (isUsed) {
        setAgreements((current) => current.map((agreement) => agreement.id === confirmDelete.id ? { ...agreement, status: 'archived', isActive: false } : agreement));
        toast.success('Used merchant agreement archived instead of deleted.');
      } else {
        setAgreements((current) => current.filter((agreement) => agreement.id !== confirmDelete.id));
        toast.success('Unused merchant agreement deleted.');
      }
    }
    setConfirmDelete(null);
  };

  return (
    <div className="app-page-shell">
      <div className="app-page-content space-y-4">
        <PageHeader title="Agreements" description="Templates define reusable formulas, merchant agreements define approved merchant-specific terms.">
          <Button variant="outline" onClick={() => openTemplateEditor()}>New template</Button>
          <Button onClick={() => openAgreementEditor()}>New merchant agreement</Button>
        </PageHeader>

        {usingDemo && <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">API unavailable, showing rebuilt workflow with demo records.</div>}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Agreement templates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {templates.map((template) => (
                <div key={template.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-muted-foreground">{template.agreementType} · v{template.version}</div>
                    </div>
                    <Badge variant={template.isActive ? 'secondary' : 'outline'}>{template.isActive ? 'active' : 'archived'}</Badge>
                  </div>
                  <div className="mb-3 text-sm text-muted-foreground">{template.notes || 'No notes'}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openTemplateEditor(template)}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => setConfirmDelete({ kind: 'template', id: template.id })}>Delete</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Merchant agreements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {agreements.map((agreement) => (
                <div key={agreement.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{agreement.title}</div>
                      <div className="text-sm text-muted-foreground">{agreement.merchantName} · {agreement.agreementType} · v{agreement.version}</div>
                    </div>
                    <Badge variant={agreement.status === 'approved' ? 'secondary' : agreement.status === 'rejected' ? 'destructive' : 'outline'}>{agreement.status}</Badge>
                  </div>
                  <div className="mb-3 text-xs text-muted-foreground">Approved agreements available for this merchant: {approvedCountByMerchant.get(agreement.merchantId) ?? 0}</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAgreementEditor(agreement)}>Edit</Button>
                    {agreement.status === 'pending' && <Button size="sm" onClick={() => reviewAgreement(agreement, 'approve')}>Approve</Button>}
                    {agreement.status === 'pending' && <Button variant="secondary" size="sm" onClick={() => reviewAgreement(agreement, 'reject')}>Reject</Button>}
                    <Button variant="destructive" size="sm" onClick={() => setConfirmDelete({ kind: 'agreement', id: agreement.id })}>Delete</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit template' : 'Create template'}</DialogTitle>
            <DialogDescription>Economic term edits are version-safe; used templates archive instead of breaking references.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Name"><Input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Agreement type">
              <Select value={templateForm.agreementType} onValueChange={(value) => setTemplateForm((current) => ({ ...current, agreementType: value as AgreementTemplate['agreementType'], calculationMethod: value as AgreementTemplate['calculationMethod'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="profit_share">Profit Share</SelectItem>
                  <SelectItem value="fixed_margin">Fixed Margin</SelectItem>
                  <SelectItem value="spread">Spread</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Calculation value"><Input value={templateForm.value} onChange={(event) => setTemplateForm((current) => ({ ...current, value: event.target.value }))} /></Field>
            <Field label="Currency"><Input value={templateForm.defaultCurrency} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultCurrency: event.target.value.toUpperCase() }))} /></Field>
            <Field label="Notes"><Textarea value={templateForm.notes} onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button>
            <Button onClick={saveTemplate}>Save template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agreementDialog} onOpenChange={setAgreementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgreement ? 'Edit merchant agreement' : 'Create merchant agreement'}</DialogTitle>
            <DialogDescription>Merchant approval happens once per merchant agreement version, not once per order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Template">
              <Select value={agreementForm.templateId} onValueChange={(value) => setAgreementForm((current) => ({ ...current, templateId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Merchant ID"><Input value={agreementForm.merchantId} onChange={(event) => setAgreementForm((current) => ({ ...current, merchantId: event.target.value }))} /></Field>
            <Field label="Merchant name"><Input value={agreementForm.merchantName} onChange={(event) => setAgreementForm((current) => ({ ...current, merchantName: event.target.value }))} /></Field>
            <Field label="Title"><Input value={agreementForm.title} onChange={(event) => setAgreementForm((current) => ({ ...current, title: event.target.value }))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreementDialog(false)}>Cancel</Button>
            <Button onClick={saveAgreement}>Save agreement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm delete</DialogTitle>
            <DialogDescription>If the record is already in use, the rebuilt workflow archives it instead of breaking history.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
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
