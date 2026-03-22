import { describe, expect, it } from 'vitest';
import { demoTradingData } from '@/lib/trading/demo-data';
import { buildOrderFromDraft } from '@/lib/trading/utils';

const approvedAgreement = structuredClone(demoTradingData.merchantAgreements.find((agreement) => agreement.status === 'approved')!);
const pendingAgreement = structuredClone(demoTradingData.merchantAgreements.find((agreement) => agreement.status === 'pending')!);

describe('buildOrderFromDraft', () => {
  it('creates an order with immutable agreement snapshot and computed profit', () => {
    const order = buildOrderFromDraft({
      direction: 'incoming',
      merchantId: approvedAgreement.merchantId,
      merchantName: approvedAgreement.merchantName,
      buyerId: 'buyer-22',
      buyerName: 'New Buyer',
      merchantAgreementId: approvedAgreement.id,
      quantity: 40,
      unitPrice: 100,
      currency: 'USD',
    }, approvedAgreement, 'user-1');

    expect(order.merchantAgreementId).toBe(approvedAgreement.id);
    expect(order.agreementSnapshot.version).toBe(approvedAgreement.version);
    expect(order.computedNetProfit).toBe(480);
  });

  it('rejects pending agreements', () => {
    expect(() => buildOrderFromDraft({
      direction: 'incoming',
      merchantId: pendingAgreement.merchantId,
      merchantName: pendingAgreement.merchantName,
      buyerId: 'buyer-22',
      buyerName: 'New Buyer',
      merchantAgreementId: pendingAgreement.id,
      quantity: 40,
      unitPrice: 100,
      currency: 'USD',
    }, pendingAgreement, 'user-1')).toThrow(/approved active/);
  });

  it('rejects merchant mismatches', () => {
    expect(() => buildOrderFromDraft({
      direction: 'incoming',
      merchantId: 'wrong-merchant',
      merchantName: approvedAgreement.merchantName,
      buyerId: 'buyer-22',
      buyerName: 'New Buyer',
      merchantAgreementId: approvedAgreement.id,
      quantity: 40,
      unitPrice: 100,
      currency: 'USD',
    }, approvedAgreement, 'user-1')).toThrow(/does not belong/);
  });

  it('keeps historical profit unchanged when agreement terms later change', () => {
    const order = buildOrderFromDraft({
      direction: 'incoming',
      merchantId: approvedAgreement.merchantId,
      merchantName: approvedAgreement.merchantName,
      buyerId: 'buyer-22',
      buyerName: 'New Buyer',
      merchantAgreementId: approvedAgreement.id,
      quantity: 10,
      unitPrice: 100,
      currency: 'USD',
    }, approvedAgreement, 'user-1');

    approvedAgreement.resolvedTermsSnapshot.profitSharePercent = 30;

    expect(order.agreementSnapshot.profitSharePercent).toBe(12);
    expect(order.computedNetProfit).toBe(120);
  });
});
