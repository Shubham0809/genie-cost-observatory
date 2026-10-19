import { describe, expect, it } from 'vitest';
import { rateFromPositiveUsage, selectPromotionRate, simulatedPromotionalCost } from './promotion';

describe('promotion-removal rate fallback', () => {
  it('prefers the same cloud and month, then cloud, then account', () => {
    const selected = selectPromotionRate({ sameCloudMonth: 0.08, sameCloud: 0.09, account: 0.1 }, 20);
    expect(selected.rate).toBe(0.08);
    expect(selected.source).toContain('same cloud and month');
  });

  it('falls back to cloud and then account rates', () => {
    expect(selectPromotionRate({ sameCloudMonth: null, sameCloud: 0.09, account: 0.1 }, 5).source).toContain(
      'cloud fallback'
    );
    expect(selectPromotionRate({ sameCloudMonth: -0.02, sameCloud: 0, account: 0.11 }, 5).source).toContain(
      'account fallback'
    );
  });

  it('handles a missing billed rate without inventing cost', () => {
    const selected = selectPromotionRate({ sameCloudMonth: null, sameCloud: null, account: null }, 40);
    expect(selected.rate).toBeNull();
    expect(selected.source).toBe('No observed billed Agent rate available');
    expect(simulatedPromotionalCost(40, selected.rate)).toBe(0);
  });

  it('does not create a negative proxy rate from billing corrections', () => {
    expect(rateFromPositiveUsage(-12, -40)).toBeNull();
    expect(rateFromPositiveUsage(2, 0)).toBeNull();
    expect(rateFromPositiveUsage(2.2, 10)).toBeCloseTo(0.22);
  });

  it('leaves Genie Code allowance out of the simulated Agent cost', () => {
    expect(simulatedPromotionalCost(25, 0.08)).toBeCloseTo(2);
  });
});
