# Customer Deployment

Deploy one Genie Cost Observatory copy in the customer Databricks environment. The app is account-wide: it reads every workspace represented in `system.billing.usage` that the app service principal can see. Do not deploy one app per workspace. Do not edit application source to change hosts, warehouse IDs, or customer names.

No credentials are stored in source. Authentication uses the Databricks CLI profile and, at runtime, the app service principal.

## Architecture and data behavior

- AppKit React UI queries SQL files in `config/queries` through the analytics plugin.
- Queries run as the **app service principal**, not as the viewer.
- **All workspaces** is the default. Workspace ranking and search list every Genie-active workspace ID in billing data.
- Selecting a workspace opens user/run-as identity detail for that workspace and keeps the reporting period.
- Workspace names come from `system.access.workspaces_latest` when permitted. If that table is missing or denied, the app continues and labels rows **Workspace \<id\>**.
- App `CAN_USE` does **not** create row-level billing isolation. Every viewer sees the same account-wide data the service principal can read.

## Prerequisites

- Databricks CLI 1.0.0 or later (`databricks -v`)
- Databricks Apps enabled in the destination workspace
- A SQL warehouse the app can use (serverless recommended)
- A deployer who can create apps
- An account or metastore administrator who can grant the minimum system-table privileges below

## 1. Create or select a Databricks CLI profile

Workspace host, account, and credentials come from the CLI profile. Do not put them in `databricks.yml`.

List profiles:

```bash
databricks auth profiles
```

Create or refresh a profile for the customer workspace:

```bash
databricks auth login --host https://<customer-workspace-host> --profile <customer-profile>
```

Confirm:

```bash
databricks current-user me --profile <customer-profile>
databricks warehouses list --profile <customer-profile>
```

Record the SQL warehouse ID. Pass it as `sql_warehouse_id`; do not edit source files.

## 2. Install and validate

From the project root:

```bash
npm ci

databricks bundle validate --strict -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"

databricks apps validate -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"
```

`app.yaml` starts the AppKit server with `npm run start` and binds `DATABRICKS_WAREHOUSE_ID` from the `sql-warehouse` resource. The warehouse resource permission is `CAN_USE`.

## 3. Deploy the app

Recommended AppKit workflow (uploads, creates, and starts the app):

```bash
databricks apps deploy -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"
```

Equivalent bundle deploy for this project (`lifecycle.started: true` starts the app):

```bash
databricks bundle deploy -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"
```

The bundle attaches the warehouse as `sql-warehouse` and grants the app service principal `CAN_USE` on it.

Do not deploy, restart, or change live permissions unless you intend to.

## 4. Grant system-table access to the app service principal

Get the app service principal client ID:

```bash
databricks apps get genie-cost-observatory \
  --output json \
  --profile <customer-profile>
```

Use the returned `service_principal_client_id`. Run the following as an authorized administrator. These are the minimum data permissions. Do not grant account-admin or broad catalog access.

```sql
GRANT USE CATALOG ON CATALOG system TO `<app-service-principal-client-id>`;

GRANT USE SCHEMA ON SCHEMA system.billing TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.billing.usage TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.billing.list_prices TO `<app-service-principal-client-id>`;
```

If workspace names should resolve, also grant:

```sql
GRANT USE SCHEMA ON SCHEMA system.access TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.access.workspaces_latest TO `<app-service-principal-client-id>`;
```

If `system.access.workspaces_latest` is unavailable, skip those grants. The app still functions using workspace IDs.

## 5. Grant app viewer access

Viewer access is separate from data permissions. Grant only `CAN_USE` unless the person must manage the app:

```bash
databricks apps update-permissions genie-cost-observatory \
  --json '{"access_control_list":[{"user_name":"viewer@customer.com","permission_level":"CAN_USE"}]}' \
  --profile <customer-profile>
```

Account or JIT-provisioned users can receive app-only `CAN_USE` when the workspace authentication policy allows it. They will still see **all** billing rows the service principal can read.

## 6. Validate the deployed app

```bash
databricks apps get genie-cost-observatory --profile <customer-profile>
databricks apps logs genie-cost-observatory --tail-lines 200 --profile <customer-profile>
```

Open the app URL and confirm:

1. Account overview KPIs load (or show a clear empty/error state)
2. Workspace ranking and search work for many workspaces
3. Selecting a workspace opens identity detail
4. **All workspaces** returns to the account view
5. Promotion-removal values are labeled as a simulation
6. Unnamed workspaces appear as **Workspace \<id\>** rather than disappearing

## Cost caveats

- Figures are **estimated list cost**, not final invoice cost.
- Costs use billed DBUs × `pricing.effective_list.default`.
- Results may differ from negotiated or invoiced amounts.
- System billing data may lag recent activity.
- Promotion-removal values are estimates from observed effective-list rates.

## Promotion-removal simulation

The Simulation tab reprices identified-user Genie Agent promotional DBUs. It does not change the Genie Code 150-DBU allowance, does not hardcode regional SKUs, and explains whether the rate came from the same cloud/month, a cloud fallback, or an account fallback. If no billed Agent rate exists, it reports that instead of inventing a cost.

## Troubleshooting

### Missing system-table permissions

Symptoms: destructive alerts such as `PERMISSION_DENIED`, `TABLE_OR_VIEW_NOT_FOUND`, or “Billing summary unavailable”.

Fix: grant the minimum `system.billing` privileges in section 4. Confirm the warehouse is running and the service principal has `CAN_USE` on it.

### No data

Symptoms: empty overview, no workspace rows, or “No Genie usage in this scope”.

Checks:

- The service principal can `SELECT` `system.billing.usage`
- The period contains Genie Agent or Genie Code usage
- Billing system tables have been enabled for the account
- Billing ingestion lag: recent activity may not have landed yet

### Unavailable workspace metadata

Symptoms: a names warning, or labels like **Workspace 123456789**.

Checks: grant `system.access.workspaces_latest` or accept ID labels. Cost rows must still appear; if they disappear, the app is not using the metadata-safe queries and should be updated.

### Warehouse or app start issues

Symptoms: app not `RUNNING`, or queries never return.

Checks: `databricks apps get`, app logs, warehouse state, and that `DATABRICKS_WAREHOUSE_ID` is bound from `sql-warehouse` rather than a hardcoded ID.
