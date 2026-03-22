import { describe, expect, it } from 'vitest';
import { demoTradingData } from '@/lib/trading/demo-data';
import { getMerchantAgreementDeleteMode } from '@/lib/trading/utils';

const approvedUsedAgreement = structuredClone(demoTradingData.merchantAgreements.find((agreement) => agreement.id === 'mag-northwind-v1')!);
const approvedUnusedAgreement = { ...approvedUsedAgreement, id: 'mag-unused-approved', merchantName: 'Unused Merchant' };

describe('getMerchantAgreementDeleteMode', () => {
  it('allows direct delete for approved agreements that were never used by orders', () => {
    const usedAgreementIds = new Set(demoTradingData.orders.map((order) => order.merchantAgreementId));
    expect(getMerchantAgreementDeleteMode(approvedUnusedAgreement, usedAgreementIds)).toBe('delete');
  });

  it('archives approved agreements that are already referenced by orders', () => {
    const usedAgreementIds = new Set(demoTradingData.orders.map((order) => order.merchantAgreementId));
    expect(getMerchantAgreementDeleteMode(approvedUsedAgreement, usedAgreementIds)).toBe('archive');
  });
});
