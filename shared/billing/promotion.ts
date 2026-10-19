import { isUsableProxyRate } from './pricing';

export type RateSource =
  | 'Observed billed Agent rate for the same cloud and month'
  | 'Observed billed Agent rate using the cloud fallback'
  | 'Observed billed Agent rate using the account fallback'
  | 'No observed billed Agent rate available'
  | 'No promotional Agent usage';

export interface RateCandidate {
  sameCloudMonth: number | null;
  sameCloud: number | null;
  account: number | null;
}

export interface SelectedRate {
  rate: number | null;
  source: RateSource;
}

export function rateFromPositiveUsage(estimatedListCost: number, billedDbus: number): number | null {
  if (billedDbus <= 0 || estimatedListCost <= 0) {
    return null;
  }
  const rate = estimatedListCost / billedDbus;
  return isUsableProxyRate(rate) ? rate : null;
}

export function selectPromotionRate(candidates: RateCandidate, promotionalDbus: number): SelectedRate {
  if (promotionalDbus <= 0) {
    return { rate: null, source: 'No promotional Agent usage' };
  }

  if (isUsableProxyRate(candidates.sameCloudMonth)) {
    return {
      rate: candidates.sameCloudMonth,
      source: 'Observed billed Agent rate for the same cloud and month',
    };
  }
  if (isUsableProxyRate(candidates.sameCloud)) {
    return {
      rate: candidates.sameCloud,
      source: 'Observed billed Agent rate using the cloud fallback',
    };
  }
  if (isUsableProxyRate(candidates.account)) {
    return {
      rate: candidates.account,
      source: 'Observed billed Agent rate using the account fallback',
    };
  }
  return { rate: null, source: 'No observed billed Agent rate available' };
}

export function simulatedPromotionalCost(promotionalDbus: number, rate: number | null): number {
  if (rate === null || promotionalDbus <= 0) {
    return 0;
  }
  return promotionalDbus * rate;
}
