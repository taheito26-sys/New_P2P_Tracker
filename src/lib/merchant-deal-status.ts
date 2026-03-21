import type { DealStatus } from '@/types/domain';

export const DEAL_STATUS_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  pending: ['approved'],
  approved: [],
};

export function getAllowedDealStatusTransitions(status: DealStatus): DealStatus[] {
  return [...DEAL_STATUS_TRANSITIONS[status]];
}

export function normalizeDealStatus(status: string | null | undefined): DealStatus | 'pending' {
  return status === 'approved' ? 'approved' : 'pending';
}

export function canTransitionDealStatus(current: DealStatus, next: DealStatus): boolean {
  return current === next || DEAL_STATUS_TRANSITIONS[current].includes(next);
}

export function assertDealStatusTransition(current: DealStatus, next: DealStatus): void {
  if (!canTransitionDealStatus(current, next)) {
    throw new Error(`Illegal merchant deal status transition: ${current} -> ${next}`);
  }
}
