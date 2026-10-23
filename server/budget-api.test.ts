import { describe, expect, it } from 'vitest';
import { budgetApiTestHelpers, parseBudgetControlsQuery } from './budget-api';

describe('budget API parsing', () => {
  it('preserves int64 principal ids as strings', () => {
    expect(budgetApiTestHelpers.parseBudgetJson('{"budgets":[{"principal_id":9223372036854775807}]}')).toEqual({
      budgets: [{ principal_id: '9223372036854775807' }],
    });
  });

  it('requires an HTTPS account host and strips paths', () => {
    expect(budgetApiTestHelpers.parseAccountHost('https://accounts.cloud.databricks.com/path?q=1')).toBe(
      'https://accounts.cloud.databricks.com/'
    );
    expect(budgetApiTestHelpers.parseAccountHost('http://accounts.cloud.databricks.com')).toBeUndefined();
    expect(budgetApiTestHelpers.parseAccountHost('https://user:pass@accounts.cloud.databricks.com')).toBeUndefined();
    expect(budgetApiTestHelpers.parseAccountHost(undefined)).toBeUndefined();
  });

  it('derives the account host from the workspace host when the account host is omitted', () => {
    expect(budgetApiTestHelpers.accountHostFromWorkspaceHost('https://example.cloud.databricks.com')).toBe(
      'https://accounts.cloud.databricks.com/'
    );
  });

  it('rejects invalid budget-control query parameters', () => {
    expect(parseBudgetControlsQuery({}).success).toBe(false);
    expect(
      parseBudgetControlsQuery({
        workspace_id: 'abc',
        identity: 'user@example.com',
        identity_type: 'Identified user',
      }).success
    ).toBe(false);
    expect(
      parseBudgetControlsQuery({
        workspace_id: '123',
        identity: '',
        identity_type: 'Identified user',
      }).success
    ).toBe(false);
    expect(
      parseBudgetControlsQuery({
        workspace_id: '123',
        identity: 'user@example.com',
        identity_type: 'admin',
      }).success
    ).toBe(false);
  });

  it('accepts numeric workspace ids and known identity types', () => {
    expect(
      parseBudgetControlsQuery({
        workspace_id: '1841486467293708',
        identity: 'user@example.com',
        identity_type: 'Identified user',
      }).success
    ).toBe(true);
    expect(
      parseBudgetControlsQuery({
        workspace_id: '99',
        identity: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        identity_type: 'Service principal',
      }).success
    ).toBe(true);
  });

  it('returns Budget Viewer guidance without leaking credentials', () => {
    const denied = budgetApiTestHelpers.budgetHttpError(403);
    expect(denied.status).toBe(403);
    expect(denied.message).toMatch(/Budget Viewer/i);
    expect(denied.message).not.toMatch(/token|secret|DATABRICKS_CLIENT/i);

    const wrapped = budgetApiTestHelpers.publicBudgetError(
      new Error('Authorization: Bearer super-secret-token-value DATABRICKS_CLIENT_SECRET=abc')
    );
    expect(wrapped.message).toBe('Budget controls could not be loaded.');
    expect(wrapped.message).not.toContain('Bearer');
    expect(wrapped.message).not.toContain('DATABRICKS_CLIENT');
  });
});
