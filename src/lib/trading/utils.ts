import type { AgreementTemplate, CalculationConfig, MerchantAgreement, Order, OrderDraft } from './types';
import { calculateNetProfit } from './profit-service';

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function economicTermsChanged(current: CalculationConfig, next: CalculationConfig) {
  return JSON.stringify(current) !== JSON.stringify(next);
}

export function createMerchantAgreementSnapshot(template: AgreementTemplate, agreementId: string, version: number, overrides?: CalculationConfig) {
  return {
    agreementId,
    templateId: template.id,
    version,
    agreementType: template.agreementType,
    ...template.calculationConfig,
    ...overrides,
  };
}

export function buildOrderFromDraft(draft: OrderDraft, agreement: MerchantAgreement, createdByUserId: string): Order {
  if (agreement.status !== 'approved' || !agreement.isActive) {
    throw new Error('Only approved active merchant agreements can be used for orders.');
  }
  if (agreement.merchantId !== draft.merchantId) {
    throw new Error('Merchant agreement does not belong to the selected merchant.');
  }

  const timestamp = new Date().toISOString();
  const agreementSnapshot = { ...agreement.resolvedTermsSnapshot };
  const totalAmount = Number((draft.quantity * draft.unitPrice).toFixed(2));
  const computedNetProfit = calculateNetProfit({
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    snapshot: agreementSnapshot,
  });

  return {
    id: createId('ord'),
    direction: draft.direction,
    merchantId: draft.merchantId,
    merchantName: draft.merchantName,
    buyerId: draft.buyerId,
    buyerName: draft.buyerName,
    merchantAgreementId: agreement.id,
    agreementTemplateId: agreement.templateId,
    agreementType: agreement.agreementType,
    agreementSnapshot,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    totalAmount,
    currency: draft.currency,
    computedNetProfit,
    status: draft.status ?? 'confirmed',
    createdByUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
