import { GENIE_AGENT_PRODUCT, GENIE_CODE_PRODUCT } from './constants';

export const OVERVIEW_GRAIN = {
  month: 'month',
  product: 'product',
} as const;

export interface ProductTrendRow {
  usage_month: string;
  product: string;
  total_dbus: number | string;
  free_dbus: number | string;
  billed_dbus: number | string;
  estimated_list_cost: number | string;
  unpriced_billed_dbus: number | string;
  currency_code: string | null;
}

export interface OverviewRow {
  grain: string;
  usage_month: string;
  product: string | null;
  is_current_month: number | string | boolean | null;
  total_dbus: number | string | null;
  free_dbus: number | string | null;
  billed_dbus: number | string | null;
  estimated_list_cost: number | string | null;
  unpriced_billed_dbus: number | string | null;
  active_workspace_count: number | string | null;
  usage_record_count: number | string | null;
  currency_count: number | string | null;
  currency_code: string | null;
  latest_ingestion_date: string | null;
}

export interface MonthlyTrendPoint {
  usage_month: string;
  genie_agent_cost: number;
  genie_code_cost: number;
  // Index signature so the shape is assignable to AppKit chart data (Record<string, unknown>).
  [key: string]: string | number;
}

export interface ProductTotal {
  product: string;
  total_dbus: number;
  free_dbus: number;
  billed_dbus: number;
  estimated_list_cost: number;
  unpriced_billed_dbus: number;
  currency_code: string | null;
}

export interface ScopeSummary {
  mtd_estimated_list_cost: number;
  mtd_free_dbus: number;
  mtd_billed_dbus: number;
  genie_agent_cost: number;
  genie_code_cost: number;
  active_workspace_count: number;
  unpriced_billed_dbus: number;
  currency_count: number;
  currency_code: string | null;
  latest_ingestion_date: string | null;
  usage_record_count: number;
}

function num(value: number | string | boolean | null | undefined): number {
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCurrentMonth(row: OverviewRow): boolean {
  return num(row.is_current_month) === 1;
}

function emptyScopeSummary(): ScopeSummary {
  return {
    mtd_estimated_list_cost: 0,
    mtd_free_dbus: 0,
    mtd_billed_dbus: 0,
    genie_agent_cost: 0,
    genie_code_cost: 0,
    active_workspace_count: 0,
    unpriced_billed_dbus: 0,
    currency_count: 0,
    currency_code: null,
    latest_ingestion_date: null,
    usage_record_count: 0,
  };
}

/** Collapse month x product rows into one point per month for the trend chart. */
export function monthlyTrendFromProductRows(rows: ProductTrendRow[]): MonthlyTrendPoint[] {
  const byMonth = new Map<string, MonthlyTrendPoint>();
  for (const row of rows) {
    const point = byMonth.get(row.usage_month) ?? {
      usage_month: row.usage_month,
      genie_agent_cost: 0,
      genie_code_cost: 0,
    };
    if (row.product === GENIE_AGENT_PRODUCT) {
      point.genie_agent_cost += num(row.estimated_list_cost);
    } else if (row.product === GENIE_CODE_PRODUCT) {
      point.genie_code_cost += num(row.estimated_list_cost);
    }
    byMonth.set(row.usage_month, point);
  }
  return [...byMonth.values()].sort((left, right) => left.usage_month.localeCompare(right.usage_month));
}

/** Collapse month x product rows into one total per product for the detail table. */
export function productTotalsFromProductRows(rows: ProductTrendRow[]): ProductTotal[] {
  const byProduct = new Map<string, ProductTotal>();
  for (const row of rows) {
    if (!row.product) {
      continue;
    }
    const total = byProduct.get(row.product) ?? {
      product: row.product,
      total_dbus: 0,
      free_dbus: 0,
      billed_dbus: 0,
      estimated_list_cost: 0,
      unpriced_billed_dbus: 0,
      currency_code: row.currency_code ?? null,
    };
    total.total_dbus += num(row.total_dbus);
    total.free_dbus += num(row.free_dbus);
    total.billed_dbus += num(row.billed_dbus);
    total.estimated_list_cost += num(row.estimated_list_cost);
    total.unpriced_billed_dbus += num(row.unpriced_billed_dbus);
    if (!total.currency_code && row.currency_code) {
      total.currency_code = row.currency_code;
    }
    byProduct.set(row.product, total);
  }
  return [...byProduct.values()].sort((left, right) => left.product.localeCompare(right.product));
}

export function scopeSummaryFromOverviewRows(rows: OverviewRow[]): ScopeSummary {
  const monthRow = rows.find((row) => row.grain === OVERVIEW_GRAIN.month && isCurrentMonth(row));
  const currentProducts = rows.filter((row) => row.grain === OVERVIEW_GRAIN.product && isCurrentMonth(row));
  const agent = currentProducts.find((row) => row.product === GENIE_AGENT_PRODUCT);
  const code = currentProducts.find((row) => row.product === GENIE_CODE_PRODUCT);
  if (!monthRow && currentProducts.length === 0) {
    return emptyScopeSummary();
  }
  return {
    mtd_estimated_list_cost: num(monthRow?.estimated_list_cost),
    mtd_free_dbus: num(monthRow?.free_dbus),
    mtd_billed_dbus: num(monthRow?.billed_dbus),
    genie_agent_cost: num(agent?.estimated_list_cost),
    genie_code_cost: num(code?.estimated_list_cost),
    active_workspace_count: num(monthRow?.active_workspace_count),
    unpriced_billed_dbus: num(monthRow?.unpriced_billed_dbus),
    currency_count: num(monthRow?.currency_count),
    currency_code: monthRow?.currency_code ?? null,
    latest_ingestion_date: monthRow?.latest_ingestion_date ?? null,
    usage_record_count: num(monthRow?.usage_record_count),
  };
}

function productRowsFromOverview(rows: OverviewRow[]): ProductTrendRow[] {
  return rows
    .filter((row) => row.grain === OVERVIEW_GRAIN.product && row.product)
    .map((row) => ({
      usage_month: row.usage_month,
      product: row.product as string,
      total_dbus: num(row.total_dbus),
      free_dbus: num(row.free_dbus),
      billed_dbus: num(row.billed_dbus),
      estimated_list_cost: num(row.estimated_list_cost),
      unpriced_billed_dbus: num(row.unpriced_billed_dbus),
      currency_code: row.currency_code,
    }));
}

/** Derive KPIs, monthly trend, and product totals from one overview scan. */
export function deriveOverview(rows: OverviewRow[]): {
  summary: ScopeSummary;
  monthlyTrend: MonthlyTrendPoint[];
  productTotals: ProductTotal[];
} {
  const productRows = productRowsFromOverview(rows);
  return {
    summary: scopeSummaryFromOverviewRows(rows),
    monthlyTrend: monthlyTrendFromProductRows(productRows),
    productTotals: productTotalsFromProductRows(productRows),
  };
}
