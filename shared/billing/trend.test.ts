import { describe, expect, it } from 'vitest';
import {
  deriveOverview,
  monthlyTrendFromProductRows,
  productTotalsFromProductRows,
  type OverviewRow,
  type ProductTrendRow,
} from './trend';

const rows: ProductTrendRow[] = [
  {
    usage_month: '2026-09-01',
    product: 'Genie Agent',
    total_dbus: 100,
    free_dbus: 60,
    billed_dbus: 40,
    estimated_list_cost: 8,
    unpriced_billed_dbus: 0,
    currency_code: 'USD',
  },
  {
    usage_month: '2026-09-01',
    product: 'Genie Code',
    total_dbus: 50,
    free_dbus: 50,
    billed_dbus: 0,
    estimated_list_cost: 0,
    unpriced_billed_dbus: 0,
    currency_code: 'USD',
  },
  {
    usage_month: '2026-10-01',
    product: 'Genie Agent',
    total_dbus: '20',
    free_dbus: '0',
    billed_dbus: '20',
    estimated_list_cost: '4.4',
    unpriced_billed_dbus: '0',
    currency_code: 'USD',
  },
];

const overviewRows: OverviewRow[] = [
  {
    grain: 'month',
    usage_month: '2026-09-01',
    product: null,
    is_current_month: 0,
    total_dbus: 150,
    free_dbus: 110,
    billed_dbus: 40,
    estimated_list_cost: 8,
    unpriced_billed_dbus: 0,
    active_workspace_count: 4,
    usage_record_count: 80,
    currency_count: 1,
    currency_code: 'USD',
    latest_ingestion_date: '2026-09-30',
  },
  {
    grain: 'product',
    usage_month: '2026-09-01',
    product: 'Genie Agent',
    is_current_month: 0,
    total_dbus: 100,
    free_dbus: 60,
    billed_dbus: 40,
    estimated_list_cost: 8,
    unpriced_billed_dbus: 0,
    active_workspace_count: 3,
    usage_record_count: 50,
    currency_count: 1,
    currency_code: 'USD',
    latest_ingestion_date: '2026-09-30',
  },
  {
    grain: 'product',
    usage_month: '2026-09-01',
    product: 'Genie Code',
    is_current_month: 0,
    total_dbus: 50,
    free_dbus: 50,
    billed_dbus: 0,
    estimated_list_cost: 0,
    unpriced_billed_dbus: 0,
    active_workspace_count: 2,
    usage_record_count: 30,
    currency_count: 1,
    currency_code: 'USD',
    latest_ingestion_date: '2026-09-30',
  },
  {
    grain: 'month',
    usage_month: '2026-10-01',
    product: null,
    is_current_month: 1,
    total_dbus: 20,
    free_dbus: 0,
    billed_dbus: 20,
    estimated_list_cost: 4.4,
    unpriced_billed_dbus: 2,
    active_workspace_count: 3,
    usage_record_count: 12,
    currency_count: 1,
    currency_code: 'USD',
    latest_ingestion_date: '2026-10-16',
  },
  {
    grain: 'product',
    usage_month: '2026-10-01',
    product: 'Genie Agent',
    is_current_month: true,
    total_dbus: 20,
    free_dbus: 0,
    billed_dbus: 20,
    estimated_list_cost: 4.4,
    unpriced_billed_dbus: 2,
    active_workspace_count: 3,
    usage_record_count: 12,
    currency_count: 1,
    currency_code: 'USD',
    latest_ingestion_date: '2026-10-16',
  },
];

describe('product trend derivation', () => {
  it('builds one monthly point per month, sorted, from a single scan', () => {
    const monthly = monthlyTrendFromProductRows(rows);
    expect(monthly).toEqual([
      { usage_month: '2026-09-01', genie_agent_cost: 8, genie_code_cost: 0 },
      { usage_month: '2026-10-01', genie_agent_cost: 4.4, genie_code_cost: 0 },
    ]);
  });

  it('aggregates per-product totals across months, coercing SQL strings', () => {
    const totals = productTotalsFromProductRows(rows);
    const agent = totals.find((total) => total.product === 'Genie Agent');
    expect(agent?.total_dbus).toBe(120);
    expect(agent?.billed_dbus).toBe(60);
    expect(agent?.estimated_list_cost).toBeCloseTo(12.4);
    expect(totals.map((total) => total.product)).toEqual(['Genie Agent', 'Genie Code']);
  });

  it('returns empty derivations for no-data responses', () => {
    expect(monthlyTrendFromProductRows([])).toEqual([]);
    expect(productTotalsFromProductRows([])).toEqual([]);
  });
});

describe('overview derivation from one grouping-sets scan', () => {
  it('uses the current-month grain row for MTD KPIs and product split for Agent vs Code', () => {
    const { summary, monthlyTrend, productTotals } = deriveOverview(overviewRows);
    expect(summary.mtd_estimated_list_cost).toBeCloseTo(4.4);
    expect(summary.mtd_billed_dbus).toBe(20);
    expect(summary.genie_agent_cost).toBeCloseTo(4.4);
    expect(summary.genie_code_cost).toBe(0);
    expect(summary.active_workspace_count).toBe(3);
    expect(summary.usage_record_count).toBe(12);
    expect(summary.unpriced_billed_dbus).toBe(2);
    expect(summary.currency_code).toBe('USD');
    expect(monthlyTrend).toHaveLength(2);
    expect(productTotals.find((total) => total.product === 'Genie Agent')?.total_dbus).toBe(120);
  });

  it('returns a zero summary when the current month has no usage', () => {
    const historical = overviewRows.filter((row) => row.usage_month === '2026-09-01');
    const { summary, monthlyTrend } = deriveOverview(historical);
    expect(summary.usage_record_count).toBe(0);
    expect(summary.mtd_estimated_list_cost).toBe(0);
    expect(monthlyTrend).toEqual([{ usage_month: '2026-09-01', genie_agent_cost: 8, genie_code_cost: 0 }]);
  });
});
