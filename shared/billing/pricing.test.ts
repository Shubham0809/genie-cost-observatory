import { describe, expect, it } from 'vitest';
import {
  billedDbus,
  estimatedListCost,
  freeDbus,
  isPriceEffectiveAt,
  isUsableProxyRate,
  unpricedBilledDbus,
} from './pricing';

describe('price effective-date joins', () => {
  const usageEnd = new Date('2026-10-15T12:00:00Z');

  it('matches a price that started before usage and has no end', () => {
    expect(
      isPriceEffectiveAt(usageEnd, {
        priceStartTime: new Date('2026-01-01T00:00:00Z'),
        priceEndTime: null,
      })
    ).toBe(true);
  });

  it('matches a price whose end is after usage end', () => {
    expect(
      isPriceEffectiveAt(usageEnd, {
        priceStartTime: new Date('2026-10-01T00:00:00Z'),
        priceEndTime: new Date('2026-11-01T00:00:00Z'),
      })
    ).toBe(true);
  });

  it('excludes a price that ended at usage end', () => {
    expect(
      isPriceEffectiveAt(usageEnd, {
        priceStartTime: new Date('2026-01-01T00:00:00Z'),
        priceEndTime: usageEnd,
      })
    ).toBe(false);
  });
});

describe('free SKU handling', () => {
  it('treats GENIE_FREE_USAGE as zero estimated list cost', () => {
    expect(estimatedListCost(40, 'GENIE_FREE_USAGE', 0.22)).toBe(0);
    expect(freeDbus(40, 'GENIE_FREE_USAGE')).toBe(40);
    expect(billedDbus(40, 'GENIE_FREE_USAGE')).toBe(0);
  });

  it('multiplies billed usage by the effective list price', () => {
    expect(estimatedListCost(10, 'ENTERPRISE_GENIE_COMPUTE', 0.22)).toBeCloseTo(2.2);
    expect(billedDbus(10, 'ENTERPRISE_GENIE_COMPUTE')).toBe(10);
    expect(freeDbus(10, 'ENTERPRISE_GENIE_COMPUTE')).toBe(0);
  });

  it('tracks billed DBUs that have no matching list price', () => {
    expect(unpricedBilledDbus(8, 'ENTERPRISE_GENIE_COMPUTE', null)).toBe(8);
    expect(unpricedBilledDbus(8, 'GENIE_FREE_USAGE', null)).toBe(0);
  });
});

describe('negative and correction usage', () => {
  it('preserves negative billed quantities in actual estimated cost', () => {
    expect(estimatedListCost(-5, 'ENTERPRISE_GENIE_COMPUTE', 0.2)).toBeCloseTo(-1);
    expect(billedDbus(-5, 'ENTERPRISE_GENIE_COMPUTE')).toBe(-5);
  });

  it('rejects non-positive proxy rates from corrections', () => {
    expect(isUsableProxyRate(-0.04)).toBe(false);
    expect(isUsableProxyRate(0)).toBe(false);
    expect(isUsableProxyRate(0.07)).toBe(true);
  });
});
