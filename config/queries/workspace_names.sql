-- Optional metadata. Billing queries do not depend on this table.
SELECT
  CAST(workspace_id AS STRING) AS workspace_id,
  workspace_name,
  status AS workspace_status
FROM system.access.workspaces_latest
LIMIT 5000
