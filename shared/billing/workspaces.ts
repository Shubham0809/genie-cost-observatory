import { ALL_WORKSPACES } from './constants';

export interface NamedWorkspace {
  workspaceId: string;
  workspaceName?: string | null;
}

export function isAllWorkspaces(workspaceId: string | null | undefined): boolean {
  return !workspaceId || workspaceId === ALL_WORKSPACES;
}

export function workspaceDisplayName(workspaceId: string, workspaceName?: string | null): string {
  const trimmed = workspaceName?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return `Workspace ${workspaceId}`;
}

export function workspaceLabel(workspaceId: string, workspaceName?: string | null): string {
  return `${workspaceDisplayName(workspaceId, workspaceName)} · ${workspaceId}`;
}

export function applyWorkspaceScope<T extends { workspaceId: string }>(rows: T[], workspaceId: string): T[] {
  if (isAllWorkspaces(workspaceId)) {
    return rows;
  }
  return rows.filter((row) => row.workspaceId === workspaceId);
}

export function mergeWorkspaceNames<T extends { workspace_id: string }>(
  rows: T[],
  names: Map<string, string>
): Array<T & { workspace_name: string; workspace_label: string; workspace_name_resolved: boolean }> {
  return rows.map((row) => {
    const resolvedName = names.get(row.workspace_id);
    const workspace_name = workspaceDisplayName(row.workspace_id, resolvedName);
    return {
      ...row,
      workspace_name,
      workspace_label: workspaceLabel(row.workspace_id, resolvedName),
      workspace_name_resolved: Boolean(resolvedName),
    };
  });
}
