export type AgreementType = 'profit_share' | 'fixed_margin' | 'spread' | 'commission' | 'custom';
export type CalculationMethod = AgreementType;
export type MerchantAgreementStatus = 'pending' | 'approved' | 'rejected' | 'archived';
export type OrderDirection = 'incoming' | 'outgoing';
export type OrderStatus = 'draft' | 'confirmed' | 'cancelled' | 'archived';

export interface CalculationConfig {
  profitSharePercent?: number;
  fixedMarginAmount?: number;
  spreadPercent?: number;
  commissionPercent?: number;
  customFormulaLabel?: string;
  percentages?: Record<string, number>;
  fixedValues?: Record<string, number>;
  currencyAssumptions?: string[];
}

export interface AgreementTemplate {
  id: string;
  name: string;
  agreementType: AgreementType;
  calculationMethod: CalculationMethod;
  calculationConfig: CalculationConfig;
  defaultCurrency: string;
  notes: string;
  createdByUserId: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantAgreement {
  id: string;
  templateId: string;
  merchantId: string;
  merchantName: string;
  agreementType: AgreementType;
  title: string;
  status: MerchantAgreementStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  resolvedTermsSnapshot: CalculationConfig & {
    templateId: string;
    agreementId: string;
    version: number;
    agreementType: AgreementType;
  };
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementSnapshot extends CalculationConfig {
  agreementId: string;
  templateId: string;
  version: number;
  agreementType: AgreementType;
}

export interface Order {
  id: string;
  direction: OrderDirection;
  merchantId: string;
  merchantName: string;
  buyerId: string;
  buyerName: string;
  merchantAgreementId: string;
  agreementTemplateId: string;
  agreementType: AgreementType;
  agreementSnapshot: AgreementSnapshot;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  computedNetProfit: number;
  status: OrderStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDraft {
  direction: OrderDirection;
  merchantId: string;
  merchantName: string;
  buyerId: string;
  buyerName: string;
  merchantAgreementId: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  status?: OrderStatus;
}

export interface TradingDashboardData {
  templates: AgreementTemplate[];
  merchantAgreements: MerchantAgreement[];
  orders: Order[];
}
