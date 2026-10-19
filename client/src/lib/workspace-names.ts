import { workspaceDisplayName, workspaceLabel } from '../../../shared/billing';

export interface WorkspaceNameRecord {
  workspace_id: string;
  workspace_name?: string | null;
  workspace_status?: string | null;
}

export function workspaceNameMap(rows: WorkspaceNameRecord[] | null | undefined): Map<string, WorkspaceNameRecord> {
  const names = new Map<string, WorkspaceNameRecord>();
  for (const row of rows ?? []) {
    names.set(row.workspace_id, row);
  }
  return names;
}

export function resolveWorkspace(
  workspaceId: string,
  names: Map<string, WorkspaceNameRecord>
): { id: string; name: string; status?: string | null; label: string } {
  const record = names.get(workspaceId);
  const name = workspaceDisplayName(workspaceId, record?.workspace_name);
  return {
    id: workspaceId,
    name,
    status: record?.workspace_status,
    label: workspaceLabel(workspaceId, record?.workspace_name),
  };
}
