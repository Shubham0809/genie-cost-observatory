import { describe, expect, it } from 'vitest';
import { ALL_WORKSPACES, NONE_WORKSPACE } from '../billing/constants';
import { accountHostFromWorkspaceHost } from './account-host';
import { budgetViewerGrantPresent, mergeBudgetViewerGrant } from './grants';
import {
  applicableGenieBudgets,
  billingFreshness,
  budgetSpendWorkspaceFilter,
  collectOverridePrincipalIds,
  estimateBudgetRule,
  isGenieBudget,
  type PrincipalResolution,
  type RawBudgetConfiguration,
} from '.';

const baseBudget: RawBudgetConfiguration = {
  budget_configuration_id: 'budget-1',
  display_name: 'Genie guardrail',
  resource_type: 'BUDGET_RESOURCE_TYPE_UNITY_AI_GATEWAY',
  filter: {
    tags: [{ key: 'databricks-product', value: { values: ['genie'] } }],
  },
  alert_configurations: [
    {
      alert_configuration_id: 'shared-rule',
      quantity_threshold: '1000',
      scope_type: 'ALERT_CONFIGURATION_SCOPE_TYPE_SHARED',
      action_configurations: [{ action_type: 'BLOCK_USAGE' }],
    },
    {
      alert_configuration_id: 'user-rule',
      quantity_threshold: '100',
      scope_type: 'ALERT_CONFIGURATION_SCOPE_TYPE_PER_USER',
      action_configurations: [{ action_type: 'BLOCK_USAGE' }],
      principal_overrides: [
        { principal_id: '10001', override_threshold: '200' },
        { principal_id: '20002', override_threshold: '300' },
      ],
    },
  ],
};

describe('Genie budget controls', () => {
  it('matches all-workspace Genie budgets and applies the highest identity override', () => {
    const resolution: PrincipalResolution = {
      status: 'resolved',
      principalId: '10001',
      groupIds: ['20002'],
    };
    const [budget] = applicableGenieBudgets([baseBudget], '123', resolution);

    expect(budget?.workspaceScope).toBe('all-workspaces');
    expect(budget?.couldBlock).toBe(true);
    expect(budget?.rules[1]).toMatchObject({
      scope: 'per-user',
      configuredThresholdUsd: 100,
      effectiveThresholdUsd: 300,
      thresholdSource: 'principal-override',
    });
  });

  it('does not claim an effective per-user threshold when overrides cannot be resolved', () => {
    const [budget] = applicableGenieBudgets([baseBudget], '123', { status: 'unavailable' });

    expect(budget?.rules[1]).toMatchObject({
      configuredThresholdUsd: 100,
      effectiveThresholdUsd: null,
      thresholdSource: 'unresolved',
    });
  });

  it('filters budgets by workspace and Genie-compatible tags', () => {
    const workspaceBudget: RawBudgetConfiguration = {
      ...baseBudget,
      budget_configuration_id: 'workspace-budget',
      filter: {
        workspace_id: { values: [456] },
        tags: [{ key: 'databricks-product', value: { values: ['genie'] } }],
      },
    };
    const incompatibleBudget: RawBudgetConfiguration = {
      ...baseBudget,
      budget_configuration_id: 'tagged-budget',
      filter: {
        tags: [
          { key: 'databricks-product', value: { values: ['genie'] } },
          { key: 'team', value: { values: ['finance'] } },
        ],
      },
    };

    expect(applicableGenieBudgets([workspaceBudget], '123', { status: 'not-required' })).toEqual([]);
    expect(applicableGenieBudgets([workspaceBudget], '456', { status: 'not-required' })).toHaveLength(1);
    expect(applicableGenieBudgets([incompatibleBudget], '123', { status: 'not-required' })).toEqual([]);
  });

  it('collects override principal ids only from applicable Genie budgets', () => {
    expect(collectOverridePrincipalIds([baseBudget], '123')).toEqual(['10001', '20002']);
  });

  it('estimates shared and user threshold consumption across the budget workspace scope', () => {
    const scopedBudget: RawBudgetConfiguration = {
      ...baseBudget,
      filter: {
        workspace_id: { values: [1, 2] },
        tags: [{ key: 'databricks-product', value: { values: ['genie'] } }],
      },
    };
    const [budget] = applicableGenieBudgets([scopedBudget], '1', {
      status: 'resolved',
      principalId: '999',
      groupIds: [],
    });
    expect(budget).toBeDefined();
    const rows = [
      {
        workspace_id: '1',
        currency_code: 'USD',
        shared_estimated_list_cost: 75,
        identity_estimated_list_cost: 20,
        shared_unpriced_billed_dbus: 1,
        identity_unpriced_billed_dbus: 0,
      },
      {
        workspace_id: '2',
        currency_code: 'USD',
        shared_estimated_list_cost: 25,
        identity_estimated_list_cost: 10,
        shared_unpriced_billed_dbus: 0,
        identity_unpriced_billed_dbus: 0,
      },
      {
        workspace_id: '3',
        currency_code: 'USD',
        shared_estimated_list_cost: 500,
        identity_estimated_list_cost: 500,
        shared_unpriced_billed_dbus: 0,
        identity_unpriced_billed_dbus: 0,
      },
    ];

    expect(estimateBudgetRule(budget!, budget!.rules[0]!, rows)).toMatchObject({
      spendUsd: 100,
      remainingUsd: 900,
      unpricedBilledDbus: 1,
      estimatedAtOrOverThreshold: false,
    });
    expect(estimateBudgetRule(budget!, budget!.rules[1]!, rows)).toMatchObject({
      spendUsd: 30,
      remainingUsd: 70,
    });
  });

  it('detects BLOCK_USAGE separately from email-only rules', () => {
    const emailOnly: RawBudgetConfiguration = {
      ...baseBudget,
      alert_configurations: [
        {
          alert_configuration_id: 'email-rule',
          quantity_threshold: '50',
          scope_type: 'ALERT_CONFIGURATION_SCOPE_TYPE_SHARED',
          action_configurations: [{ action_type: 'EMAIL_NOTIFICATION' }],
        },
      ],
    };
    const [budget] = applicableGenieBudgets([emailOnly], '123', { status: 'not-required' });
    expect(budget?.couldBlock).toBe(false);
    expect(budget?.rules[0]).toMatchObject({
      blockUsage: false,
      emailNotification: true,
    });
    expect(applicableGenieBudgets([baseBudget], '123', { status: 'not-required' })[0]?.rules[0]?.blockUsage).toBe(true);
  });

  it('does not compare a USD threshold with non-USD pricing', () => {
    const [budget] = applicableGenieBudgets([baseBudget], '123', { status: 'not-required' });
    const estimate = estimateBudgetRule(budget!, budget!.rules[0]!, [
      {
        workspace_id: '123',
        currency_code: 'EUR',
        shared_estimated_list_cost: 10,
        identity_estimated_list_cost: 10,
      },
    ]);

    expect(estimate).toMatchObject({ spendUsd: null, remainingUsd: null, nonUsdCostPresent: true });
  });

  it('marks estimated spend at or over the effective threshold without claiming a live block', () => {
    const [budget] = applicableGenieBudgets([baseBudget], '123', { status: 'not-required' });
    const estimate = estimateBudgetRule(budget!, budget!.rules[0]!, [
      {
        workspace_id: '123',
        currency_code: 'USD',
        shared_estimated_list_cost: 1000,
        identity_estimated_list_cost: 0,
      },
    ]);
    expect(estimate.estimatedAtOrOverThreshold).toBe(true);
    expect(estimate.remainingUsd).toBe(0);
  });

  it('scopes spend queries to selected workspaces unless a budget covers all workspaces', () => {
    const [allWorkspaces] = applicableGenieBudgets([baseBudget], '123', { status: 'not-required' });
    expect(budgetSpendWorkspaceFilter([allWorkspaces!])).toBe(ALL_WORKSPACES);

    const scoped: RawBudgetConfiguration = {
      ...baseBudget,
      filter: {
        workspace_id: { values: [2, 1, 2] },
        tags: [{ key: 'databricks-product', value: { values: ['genie'] } }],
      },
    };
    const [selected] = applicableGenieBudgets([scoped], '1', { status: 'not-required' });
    expect(budgetSpendWorkspaceFilter([selected!])).toBe('1,2');
    expect(budgetSpendWorkspaceFilter([])).toBe(NONE_WORKSPACE);
  });

  it('flags lagged current-month billing and partial historical months', () => {
    expect(billingFreshness(undefined, '2026-10-01', { todayUtc: '2026-10-23' }).stale).toBe(true);
    expect(billingFreshness('2026-10-10', '2026-10-01', { todayUtc: '2026-10-23' }).message).toMatch(
      /through 2026-10-10/
    );
    expect(billingFreshness('2026-10-22', '2026-10-01', { todayUtc: '2026-10-23' }).stale).toBe(false);
    expect(billingFreshness('2026-09-15', '2026-09-01', { todayUtc: '2026-10-23' }).stale).toBe(true);
    expect(billingFreshness('2026-09-30', '2026-09-01', { todayUtc: '2026-10-23' }).stale).toBe(false);
    expect(billingFreshness('2026-10-22', '2026-10-01', { todayUtc: '2026-10-23', unpriced: true }).unpriced).toBe(
      true
    );
  });

  it('derives the account console host from a workspace URL', () => {
    expect(accountHostFromWorkspaceHost('https://dbc-example.cloud.databricks.com')).toBe(
      'https://accounts.cloud.databricks.com/'
    );
    expect(accountHostFromWorkspaceHost('https://adb-123.4.azuredatabricks.net')).toBe(
      'https://accounts.azuredatabricks.net/'
    );
    expect(accountHostFromWorkspaceHost('https://123.gcp.databricks.com')).toBe('https://accounts.gcp.databricks.com/');
    expect(accountHostFromWorkspaceHost('https://accounts.cloud.databricks.com')).toBe(
      'https://accounts.cloud.databricks.com/'
    );
    expect(accountHostFromWorkspaceHost('http://example.cloud.databricks.com')).toBeUndefined();
  });

  it('adds Budget Viewer for the app service principal without dropping existing grants', () => {
    const merged = mergeBudgetViewerGrant(
      [
        { role: 'roles/budget.manager', principals: ['users/owner@example.com'] },
        { role: 'roles/budget.viewer', principals: ['users/analyst@example.com'] },
      ],
      'app-client-id'
    );
    expect(merged).toEqual([
      { role: 'roles/budget.manager', principals: ['users/owner@example.com'] },
      {
        role: 'roles/budget.viewer',
        principals: ['users/analyst@example.com', 'servicePrincipals/app-client-id'],
      },
    ]);
    expect(budgetViewerGrantPresent(merged, 'app-client-id')).toBe(true);
    expect(isGenieBudget(baseBudget)).toBe(true);
  });
});
