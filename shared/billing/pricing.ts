import { FREE_USAGE_SKU } from './constants';

export interface PriceWindow {
  skuName: string;
  priceStartTime: Date;
  priceEndTime: Date | null;
  effectiveListDefault: number | null;
}

export function isFreeUsageSku(skuName: string | null | undefined): boolean {
  return skuName === FREE_USAGE_SKU;
}

export function isPriceEffectiveAt(
  usageEndTime: Date,
  price: Pick<PriceWindow, 'priceStartTime' | 'priceEndTime'>
): boolean {
  if (usageEndTime < price.priceStartTime) {
    return false;
  }
  return price.priceEndTime === null || usageEndTime < price.priceEndTime;
}

export function estimatedListCost(
  usageQuantity: number,
  skuName: string | null | undefined,
  effectiveListDefault: number | null | undefined
): number {
  if (isFreeUsageSku(skuName)) {
    return 0;
  }
  if (effectiveListDefault === null || effectiveListDefault === undefined) {
    return 0;
  }
  return usageQuantity * effectiveListDefault;
}

export function billedDbus(usageQuantity: number, skuName: string | null | undefined): number {
  return isFreeUsageSku(skuName) ? 0 : usageQuantity;
}

export function freeDbus(usageQuantity: number, skuName: string | null | undefined): number {
  return isFreeUsageSku(skuName) ? usageQuantity : 0;
}

export function unpricedBilledDbus(
  usageQuantity: number,
  skuName: string | null | undefined,
  effectiveListDefault: number | null | undefined
): number {
  if (isFreeUsageSku(skuName)) {
    return 0;
  }
  if (effectiveListDefault === null || effectiveListDefault === undefined) {
    return usageQuantity;
  }
  return 0;
}

export function isUsableProxyRate(rate: number | null | undefined): boolean {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}
