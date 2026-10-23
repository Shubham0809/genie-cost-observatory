import { ALL_WORKSPACES, NONE_WORKSPACE } from '../billing/constants';

export type BudgetActionType = 'BLOCK_USAGE' | 'EMAIL_NOTIFICATION';

export type BudgetRuleScope = 'shared' | 'per-user';

export type BudgetThresholdSource = 'default' | 'principal-override' | 'unresolved' | 'not-applicable';

export interface RawBudgetAction {
  action_type?: string;
}

export interface RawBudgetPrincipalOverride {
  principal_id?: string | number;
  override_threshold?: string;
}

export interface RawBudgetAlert {
  alert_configuration_id?: string;
  quantity_threshold?: string;
  scope_type?: string;
  action_configurations?: RawBudgetAction[];
  principal_overrides?: RawBudgetPrincipalOverride[];
}

export interface RawBudgetTagFilter {
  key?: string;
  value?: {
    values?: string[];
  };
}

export interface RawBudgetConfiguration {
  budget_configuration_id?: string;
  display_name?: string;
  resource_type?: string;
  filter?: {
    workspace_id?: {
      values?: Array<string | number>;
    };
    tags?: RawBudgetTagFilter[];
  };
  alert_configurations?: RawBudgetAlert[];
}

export interface PrincipalResolution {
  status: 'resolved' | 'unavailable' | 'not-required';
  principalId?: string;
  groupIds?: string[];
  message?: string;
}

export interface BudgetRule {
  id: string;
  scope: BudgetRuleScope;
  configuredThresholdUsd: number | null;
  effectiveThresholdUsd: number | null;
  thresholdSource: BudgetThresholdSource;
  blockUsage: boolean;
  emailNotification: boolean;
  overrideCount: number;
}

export interface ApplicableBudget {
  id: string;
  name: string;
  workspaceIds: string[];
  workspaceScope: 'all-workspaces' | 'selected-workspaces';
  rules: BudgetRule[];
  couldBlock: boolean;
}

export interface BudgetControlsResponse {
  budgets: ApplicableBudget[];
  fetchedAt: string;
  identityResolution: PrincipalResolution;
}

export interface BudgetApiErrorResponse {
  code: string;
  message: string;
}

export interface BudgetUsageRow {
  workspace_id: string;
  currency_code?: string | null;
  shared_estimated_list_cost?: number | string | null;
  identity_estimated_list_cost?: number | string | null;
  shared_unpriced_billed_dbus?: number | string | null;
  identity_unpriced_billed_dbus?: number | string | null;
  latest_ingestion_date?: string | null;
}

export interface BudgetRuleEstimate {
  spendUsd: number | null;
  remainingUsd: number | null;
  estimatedAtOrOverThreshold: boolean | null;
  unpricedBilledDbus: number;
  nonUsdCostPresent: boolean;
  latestIngestionDate?: string;
}

export interface BillingFreshness {
  stale: boolean;
  unpriced: boolean;
  latestIngestionDate?: string;
  message?: string;
}

const PER_USER_SCOPE = 'ALERT_CONFIGURATION_SCOPE_TYPE_PER_USER';
const UNITY_GATEWAY_RESOURCE = 'BUDGET_RESOURCE_TYPE_UNITY_AI_GATEWAY';
const NUMERIC_WORKSPACE_ID = /^\d+$/;

export function applicableGenieBudgets(
  budgets: RawBudgetConfiguration[],
  workspaceId: string,
  resolution: PrincipalResolution
): ApplicableBudget[] {
  return budgets
    .filter(isGenieBudget)
    .filter((budget) => budgetAppliesToWorkspace(budget, workspaceId))
    .map((budget, budgetIndex) => normalizeBudget(budget, resolution, budgetIndex))
    .filter((budget) => budget.rules.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function estimateBudgetRule(
  budget: ApplicableBudget,
  rule: BudgetRule,
  rows: BudgetUsageRow[]
): BudgetRuleEstimate {
  const workspaceIds = new Set(budget.workspaceIds);
  const scopedRows =
    budget.workspaceScope === 'all-workspaces'
      ? rows
      : rows.filter((row) => workspaceIds.has(String(row.workspace_id)));
  const costField = rule.scope === 'shared' ? 'shared_estimated_list_cost' : 'identity_estimated_list_cost';
  const unpricedField = rule.scope === 'shared' ? 'shared_unpriced_billed_dbus' : 'identity_unpriced_billed_dbus';
  let spendUsd = 0;
  let unpricedBilledDbus = 0;
  let nonUsdCostPresent = false;
  let latestIngestionDate: string | undefined;

  for (const row of scopedRows) {
    const currency = row.currency_code?.toUpperCase();
    const cost = toFiniteNumber(row[costField]);
    if (currency === 'USD') {
      spendUsd += cost;
    } else if (Math.abs(cost) > 0) {
      nonUsdCostPresent = true;
    }
    unpricedBilledDbus += toFiniteNumber(row[unpricedField]);
    if (row.latest_ingestion_date && (!latestIngestionDate || row.latest_ingestion_date > latestIngestionDate)) {
      latestIngestionDate = row.latest_ingestion_date;
    }
  }

  if (nonUsdCostPresent || rule.effectiveThresholdUsd === null) {
    return {
      spendUsd: nonUsdCostPresent ? null : spendUsd,
      remainingUsd: null,
      estimatedAtOrOverThreshold: null,
      unpricedBilledDbus,
      nonUsdCostPresent,
      latestIngestionDate,
    };
  }

  return {
    spendUsd,
    remainingUsd: Math.max(rule.effectiveThresholdUsd - spendUsd, 0),
    estimatedAtOrOverThreshold: spendUsd >= rule.effectiveThresholdUsd,
    unpricedBilledDbus,
    nonUsdCostPresent,
    latestIngestionDate,
  };
}

export function budgetCouldBlock(budgets: ApplicableBudget[]): boolean {
  return budgets.some((budget) => budget.couldBlock);
}

export function budgetSpendWorkspaceFilter(budgets: ApplicableBudget[]): string {
  if (budgets.some((budget) => budget.workspaceScope === 'all-workspaces')) {
    return ALL_WORKSPACES;
  }
  const workspaceIds = [
    ...new Set(
      budgets.flatMap((budget) => budget.workspaceIds.map(String)).filter((id) => NUMERIC_WORKSPACE_ID.test(id))
    ),
  ].sort();
  return workspaceIds.length > 0 ? workspaceIds.join(',') : NONE_WORKSPACE;
}

export function latestUsageIngestionDate(rows: BudgetUsageRow[]): string | undefined {
  return rows.reduce<string | undefined>((latest, row) => {
    const value = row.latest_ingestion_date;
    if (!value) {
      return latest;
    }
    return !latest || value > latest ? value : latest;
  }, undefined);
}

export function usageHasUnpricedDbus(rows: BudgetUsageRow[]): boolean {
  return rows.some(
    (row) =>
      toFiniteNumber(row.shared_unpriced_billed_dbus) > 0 || toFiniteNumber(row.identity_unpriced_billed_dbus) > 0
  );
}

export function billingFreshness(
  latestIngestionDate: string | undefined,
  usageMonth: string,
  options?: { todayUtc?: string; unpriced?: boolean }
): BillingFreshness {
  const todayUtc = options?.todayUtc ?? new Date().toISOString().slice(0, 10);
  const unpriced = options?.unpriced ?? false;
  const monthStart = usageMonth.slice(0, 10);
  const currentMonthStart = `${todayUtc.slice(0, 7)}-01`;

  if (!latestIngestionDate) {
    return {
      stale: true,
      unpriced,
      message: 'No billing ingestion date is available, so this spend estimate may be incomplete.',
    };
  }

  if (monthStart === currentMonthStart) {
    const lagDays = (Date.parse(`${todayUtc}T00:00:00Z`) - Date.parse(`${latestIngestionDate}T00:00:00Z`)) / 86_400_000;
    if (lagDays > 2) {
      return {
        stale: true,
        unpriced,
        latestIngestionDate,
        message: `Billing usage is estimated through ${latestIngestionDate}. Recent activity may not be included.`,
      };
    }
  } else if (latestIngestionDate < monthEndUtc(monthStart)) {
    return {
      stale: true,
      unpriced,
      latestIngestionDate,
      message: `Billing usage for this month is partial. Latest ingestion is ${latestIngestionDate}.`,
    };
  }

  if (unpriced) {
    return {
      stale: false,
      unpriced: true,
      latestIngestionDate,
      message: 'Some billed Genie DBUs have no list price, so estimated list cost is partial.',
    };
  }

  return { stale: false, unpriced: false, latestIngestionDate };
}

export function collectOverridePrincipalIds(budgets: RawBudgetConfiguration[], workspaceId: string): string[] {
  const ids = budgets
    .filter(isGenieBudget)
    .filter((budget) => budgetAppliesToWorkspace(budget, workspaceId))
    .flatMap((budget) => budget.alert_configurations ?? [])
    .flatMap((alert) => alert.principal_overrides ?? [])
    .map((override) => normalizeId(override.principal_id))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

function normalizeBudget(
  budget: RawBudgetConfiguration,
  resolution: PrincipalResolution,
  budgetIndex: number
): ApplicableBudget {
  const workspaceIds = (budget.filter?.workspace_id?.values ?? []).map(String);
  const rules = (budget.alert_configurations ?? []).map((alert, ruleIndex) =>
    normalizeRule(alert, resolution, ruleIndex)
  );
  return {
    id: budget.budget_configuration_id ?? `budget-${budgetIndex}`,
    name: budget.display_name?.trim() || 'Unnamed budget',
    workspaceIds,
    workspaceScope: workspaceIds.length === 0 ? 'all-workspaces' : 'selected-workspaces',
    rules,
    couldBlock: rules.some((rule) => rule.blockUsage),
  };
}

function normalizeRule(alert: RawBudgetAlert, resolution: PrincipalResolution, ruleIndex: number): BudgetRule {
  const scope = alert.scope_type === PER_USER_SCOPE ? 'per-user' : 'shared';
  const configuredThresholdUsd = parseThreshold(alert.quantity_threshold);
  const actions = new Set((alert.action_configurations ?? []).map((action) => action.action_type));
  const overrides = alert.principal_overrides ?? [];
  const effective = effectiveThreshold(scope, configuredThresholdUsd, overrides, resolution);
  return {
    id: alert.alert_configuration_id ?? `rule-${ruleIndex}`,
    scope,
    configuredThresholdUsd,
    effectiveThresholdUsd: effective.threshold,
    thresholdSource: effective.source,
    blockUsage: actions.has('BLOCK_USAGE'),
    emailNotification: actions.has('EMAIL_NOTIFICATION'),
    overrideCount: overrides.length,
  };
}

function effectiveThreshold(
  scope: BudgetRuleScope,
  configuredThresholdUsd: number | null,
  overrides: RawBudgetPrincipalOverride[],
  resolution: PrincipalResolution
): { threshold: number | null; source: BudgetThresholdSource } {
  if (scope === 'shared') {
    return { threshold: configuredThresholdUsd, source: 'not-applicable' };
  }
  if (overrides.length === 0) {
    return { threshold: configuredThresholdUsd, source: 'default' };
  }
  if (resolution.status !== 'resolved' || !resolution.principalId) {
    return { threshold: null, source: 'unresolved' };
  }

  const applicableIds = new Set([resolution.principalId, ...(resolution.groupIds ?? [])]);
  const matchingThresholds = overrides
    .filter((override) => {
      const id = normalizeId(override.principal_id);
      return id ? applicableIds.has(id) : false;
    })
    .map((override) => parseThreshold(override.override_threshold))
    .filter((threshold): threshold is number => threshold !== null);

  if (matchingThresholds.length === 0) {
    return { threshold: configuredThresholdUsd, source: 'default' };
  }
  return { threshold: Math.max(...matchingThresholds), source: 'principal-override' };
}

export function isGenieBudget(budget: RawBudgetConfiguration): boolean {
  if (budget.resource_type !== UNITY_GATEWAY_RESOURCE) {
    return false;
  }
  const tags = budget.filter?.tags ?? [];
  if (tags.length === 0) {
    return true;
  }
  return tags.every(
    (tag) =>
      tag.key === 'databricks-product' && (tag.value?.values ?? []).some((value) => value.toLowerCase() === 'genie')
  );
}

function budgetAppliesToWorkspace(budget: RawBudgetConfiguration, workspaceId: string): boolean {
  const values = budget.filter?.workspace_id?.values ?? [];
  return values.length === 0 || values.some((value) => String(value) === workspaceId);
}

function parseThreshold(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeId(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function monthEndUtc(monthStart: string): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function toFiniteNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
