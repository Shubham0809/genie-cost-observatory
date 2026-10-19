export type ObservatoryTab = 'overview' | 'workspaces' | 'identities' | 'simulation';

export function tabAfterWorkspaceSelection(): ObservatoryTab {
  return 'identities';
}

export function tabForAccountOverview(): ObservatoryTab {
  return 'overview';
}
