import type { DealStatus } from '@/types/domain';

export const DEAL_STATUS_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  pending: ['approved'],
  approved: [],
};

export function normalizeDealStatus(status: string | null | undefined): DealStatus {
  if (status === 'approved' || status === 'active' || status === 'due' || status === 'overdue' || status === 'settled' || status === 'closed') {
    return 'approved';
  }
  return 'pending';
}

export function getAllowedDealStatusTransitions(status: string | null | undefined): DealStatus[] {
  return [...DEAL_STATUS_TRANSITIONS[normalizeDealStatus(status)]];
}

export function canTransitionDealStatus(current: string | null | undefined, next: string | null | undefined): boolean {
  const normalizedCurrent = normalizeDealStatus(current);
  const normalizedNext = normalizeDealStatus(next);
  return normalizedCurrent === normalizedNext || DEAL_STATUS_TRANSITIONS[normalizedCurrent].includes(normalizedNext);
}

export function assertDealStatusTransition(current: string | null | undefined, next: string | null | undefined): void {
  if (!canTransitionDealStatus(current, next)) {
    throw new Error(`Illegal merchant deal status transition: ${current} -> ${next}`);
  }
}
