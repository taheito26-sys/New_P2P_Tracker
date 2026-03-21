import type { AgreementSnapshot, CalculationConfig } from './types';

export interface ProfitCalculationInput {
  quantity: number;
  unitPrice: number;
  snapshot: AgreementSnapshot | (CalculationConfig & { agreementType: AgreementSnapshot['agreementType'] });
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateNetProfit({ quantity, unitPrice, snapshot }: ProfitCalculationInput): number {
  const total = quantity * unitPrice;
  switch (snapshot.agreementType) {
    case 'profit_share':
      return roundMoney(total * ((snapshot.profitSharePercent ?? 0) / 100));
    case 'fixed_margin':
      return roundMoney(quantity * (snapshot.fixedMarginAmount ?? 0));
    case 'spread':
      return roundMoney(total * ((snapshot.spreadPercent ?? 0) / 100));
    case 'commission':
      return roundMoney(total * ((snapshot.commissionPercent ?? 0) / 100));
    case 'custom': {
      const fixed = Object.values(snapshot.fixedValues ?? {}).reduce((sum, current) => sum + current, 0);
      const percent = Object.values(snapshot.percentages ?? {}).reduce((sum, current) => sum + current, 0);
      return roundMoney(fixed + total * (percent / 100));
    }
    default:
      return 0;
  }
}
