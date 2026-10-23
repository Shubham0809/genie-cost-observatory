import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatCurrencyRate,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatOptionalNumber,
  toNumber,
} from './formatters';

describe('billing formatters', () => {
  it('normalizes SQL decimal strings before formatting', () => {
    expect(toNumber('150.5000')).toBe(150.5);
    expect(formatNumber('150.5000')).toBe('150.5');
  });

  it('formats price currency without assuming a fixed SKU region', () => {
    expect(formatCurrency('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatCurrencyRate('0.070638', 'USD')).toBe('$0.0706');
  });

  it('keeps non-applicable allowances visually distinct from zero', () => {
    expect(formatOptionalNumber(null)).toBe('—');
    expect(formatOptionalNumber(0)).toBe('0');
  });

  it('formats billing ingestion dates in UTC', () => {
    expect(formatDate('2026-10-15')).toBe('Oct 15, 2026');
  });

  it('formats configuration timestamps in UTC', () => {
    expect(formatDateTime('2026-10-23T10:15:00.000Z')).toBe('Oct 23, 2026, 10:15 AM');
  });

  it('formats calendar months without assuming a customer locale override', () => {
    expect(formatMonth('2026-10-01')).toBe('October 2026');
  });
});
