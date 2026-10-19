import { describe, expect, it } from 'vitest';
import { ALL_WORKSPACES } from './constants';
import { paginateRows, searchRows, sortRows } from './tables';
import { tabAfterWorkspaceSelection } from './navigation';
import { applyWorkspaceScope, mergeWorkspaceNames, workspaceDisplayName, workspaceLabel } from './workspaces';

describe('workspace discovery and fallback', () => {
  it('labels unresolved workspaces with their ID', () => {
    expect(workspaceDisplayName('12345')).toBe('Workspace 12345');
    expect(workspaceDisplayName('12345', '   ')).toBe('Workspace 12345');
    expect(workspaceLabel('12345', null)).toBe('Workspace 12345 · 12345');
  });

  it('uses workspace metadata when it is present', () => {
    expect(workspaceDisplayName('12345', 'Finance')).toBe('Finance');
  });

  it('keeps billing rows when names are missing', () => {
    const merged = mergeWorkspaceNames(
      [
        { workspace_id: '1', estimated_list_cost: 10 },
        { workspace_id: '2', estimated_list_cost: 4 },
      ],
      new Map([['1', 'Alpha']])
    );
    expect(merged[0]?.workspace_name).toBe('Alpha');
    expect(merged[1]?.workspace_name).toBe('Workspace 2');
    expect(merged).toHaveLength(2);
  });
});

describe('all-workspaces aggregation and selected-workspace filtering', () => {
  const rows = [
    { workspaceId: '11', cost: 5 },
    { workspaceId: '22', cost: 8 },
    { workspaceId: '11', cost: 2 },
  ];

  it('keeps every workspace in the account-wide scope', () => {
    expect(applyWorkspaceScope(rows, ALL_WORKSPACES)).toHaveLength(3);
  });

  it('filters to one workspace after selection', () => {
    expect(applyWorkspaceScope(rows, '11').map((row) => row.cost)).toEqual([5, 2]);
  });

  it('preserves user-level drill-down after workspace selection', () => {
    expect(tabAfterWorkspaceSelection()).toBe('identities');
  });
});

describe('large workspace lists', () => {
  const rows = Array.from({ length: 250 }, (_, index) => ({
    workspace_id: String(1000 + index),
    workspace_name: index === 7 ? 'Needle Workspace' : `Workspace ${1000 + index}`,
    estimated_list_cost: 250 - index,
  }));

  it('searches, sorts, and paginates 200 or more workspaces', () => {
    const matches = searchRows(rows, 'needle', ['workspace_name', 'workspace_id']);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.workspace_id).toBe('1007');

    const sorted = sortRows(rows, 'estimated_list_cost', 'desc');
    expect(sorted[0]?.workspace_id).toBe('1000');

    const page = paginateRows(sorted, 2, 20);
    expect(page.total).toBe(250);
    expect(page.pageCount).toBe(13);
    expect(page.rows).toHaveLength(20);
    expect(page.rows[0]?.workspace_id).toBe('1040');
  });
});

describe('no-data responses', () => {
  it('returns empty pages without inventing rows', () => {
    const page = paginateRows([], 0, 20);
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.pageCount).toBe(1);
  });
});
