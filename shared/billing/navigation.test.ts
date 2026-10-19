import { describe, expect, it } from 'vitest';
import { tabAfterWorkspaceSelection, tabForAccountOverview } from './navigation';

describe('observatory navigation', () => {
  it('opens identity drill-down after a workspace is selected', () => {
    expect(tabAfterWorkspaceSelection()).toBe('identities');
  });

  it('returns to the account overview when workspace scope is cleared', () => {
    expect(tabForAccountOverview()).toBe('overview');
  });
});
