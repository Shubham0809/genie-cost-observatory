# Customer Deployment

Deploy one Genie Cost Observatory copy in the customer Databricks environment. The app is account-wide: it reads every workspace represented in `system.billing.usage` that the app service principal can see. Do not deploy one app per workspace. Do not edit application source to change hosts, warehouse IDs, or customer names.

No credentials are stored in source. Authentication uses the Databricks CLI profile and, at runtime, the app service principal.

## Architecture and data behavior

- AppKit React UI queries SQL files in `config/queries` through the analytics plugin.
- Queries run as the **app service principal**, not as the viewer.
- **All workspaces** is the default. Workspace ranking and search list every Genie-active workspace ID in billing data.
- Selecting a workspace opens user/run-as identity detail for that workspace and keeps the reporting period.
- **Check budgets** appears once per identity on the current page and opens budget details for that identity and workspace. Rules with `BLOCK_USAGE` are labeled **Could block usage**; the app does not claim the user is currently blocked.
- Spend comparison runs only after budgets load, and only for all workspaces or the selected workspace IDs on those budgets. Partial or lagged billing data is called out separately from configuration errors.
- Workspace names come from `system.access.workspaces_latest` when permitted. If that table is missing or denied, the app continues and labels rows **Workspace \<id\>**.
- App `CAN_USE` does **not** create row-level billing isolation. Every viewer sees the same account-wide data the service principal can read.

## Prerequisites

- Databricks CLI 1.0.0 or later (`databricks -v`)
- Databricks Apps enabled in the destination workspace
- A SQL warehouse the app can use (serverless recommended)
- A deployer who can create apps
- A metastore administrator, or a deployer who can `GRANT` the minimum system-table privileges below
- Account or budget-manager rights on Unity Gateway Genie budgets, so deploy-time `roles/budget.viewer` grants succeed

## 1. Create or select a Databricks CLI profile

Workspace credentials come from the CLI profile. `scripts/deploy.sh` looks up the account ID from `system.billing.usage` and the account host from the workspace URL. Do not edit source files with customer hosts or account IDs.

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

Record the SQL warehouse ID. Do not put the account ID or account host in source; the deploy script looks them up.

## 2. Install, validate, deploy, and grant

From the project root:

```bash
npm ci
chmod +x scripts/deploy.sh

# Optional preview of lookup and validation:
./scripts/deploy.sh --profile <customer-profile> --warehouse-id <warehouse-id> --target customer --dry-run

./scripts/deploy.sh --profile <customer-profile> --warehouse-id <warehouse-id> --target customer
```

To also resolve workspace display names:

```bash
./scripts/deploy.sh --profile <customer-profile> --warehouse-id <warehouse-id> --target customer --grant-workspace-names
```

The script:

1. Derives the account console host from the workspace URL
2. Reads the account ID from `system.billing.usage`
3. Validates and deploys the app, binding the warehouse with `CAN_USE`
4. Grants the app service principal `USE CATALOG` on `system`, `USE SCHEMA` on `system.billing`, and `SELECT` on `system.billing.usage` and `system.billing.list_prices`
5. Grants `roles/budget.viewer` on Unity Gateway Genie budgets visible to the deployer, without granting Budget Manager or account-admin

If a grant fails because the deployer lacks metastore or budget-manager rights, the app is still deployed. Re-run with `--grants-only` after an administrator is available:

```bash
./scripts/deploy.sh --profile <customer-profile> --warehouse-id <warehouse-id> --target customer --grants-only
```

Do not put account IDs or hosts in `app.yaml`. The platform injects the app service principal credentials at runtime; do not place credentials in bundle variables.

Do not deploy, restart, or change live permissions unless you intend to.

## 3. Manual fallback grants

Use these only when `scripts/deploy.sh` cannot apply a grant. Get the app service principal client ID:

```bash
databricks apps get genie-cost-observatory \
  --output json \
  --profile <customer-profile>
```

Minimum data permissions:

```sql
GRANT USE CATALOG ON CATALOG system TO `<app-service-principal-client-id>`;

GRANT USE SCHEMA ON SCHEMA system.billing TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.billing.usage TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.billing.list_prices TO `<app-service-principal-client-id>`;
```

Optional workspace names:

```sql
GRANT USE SCHEMA ON SCHEMA system.access TO `<app-service-principal-client-id>`;
GRANT SELECT ON TABLE system.access.workspaces_latest TO `<app-service-principal-client-id>`;
```

If `system.access.workspaces_latest` is unavailable, skip those grants. The app still functions using workspace IDs.

Budget Viewer fallback: in the account console, open **Usage → Budgets** and grant the app service principal **Budget Viewer** (`roles/budget.viewer`) on each Unity Gateway Genie budget that should appear. Do not grant Budget Manager or account-admin.

The app only lists budget configurations visible to its service principal. If per-user overrides exist, resolving whether an override targets the selected user or one of their groups also requires read access to those relevant account identity records. Without it, the UI labels the override unresolved and does not invent an effective threshold.

Budget viewer access is read-only. The app cannot create budgets, change thresholds, alter block actions, or manage budget permissions.

## 4. Grant app viewer access

Viewer access is separate from data permissions. Grant only `CAN_USE` unless the person must manage the app:

```bash
databricks apps update-permissions genie-cost-observatory \
  --json '{"access_control_list":[{"user_name":"viewer@customer.com","permission_level":"CAN_USE"}]}' \
  --profile <customer-profile>
```

Account or JIT-provisioned users can receive app-only `CAN_USE` when the workspace authentication policy allows it. They will still see **all** billing rows the service principal can read.

## 5. Validate the deployed app

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
7. **Check budgets** shows applicable controls, or an exact Budget Viewer/configuration error

## Cost caveats

- Figures are **estimated list cost**, not final invoice cost.
- Costs use billed DBUs × `pricing.effective_list.default`.
- Results may differ from negotiated or invoiced amounts.
- System billing data may lag recent activity.
- Budget enforcement is near real time and can differ from billing-table estimates.
- Promotion-removal values are estimates from observed effective-list rates.

## Promotion-removal simulation

The Simulation tab reprices identified-user Genie Agent promotional DBUs. It does not change the Genie Code 150-DBU allowance, does not hardcode regional SKUs, and explains whether the rate came from the same cloud/month, a cloud fallback, or an account fallback. If no billed Agent rate exists, it reports that instead of inventing a cost.

## Troubleshooting

### Missing system-table permissions

Symptoms: destructive alerts such as `PERMISSION_DENIED`, `TABLE_OR_VIEW_NOT_FOUND`, or “Billing summary unavailable”.

Fix: re-run `scripts/deploy.sh --grants-only`, or apply the fallback grants in section 3. Confirm the warehouse is running and the service principal has `CAN_USE` on it.

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

### Budget controls unavailable

Symptoms: “Budget controls are not configured”, “Budget Viewer access” errors, or an unresolved override warning.

Checks:

- `scripts/deploy.sh` completed, so account ID/host were injected from the workspace
- The app service principal has `roles/budget.viewer` on each relevant Genie budget (`--grants-only` if the first deploy skipped this)
- The budget uses resource type **Unity Gateway** and either no tag filter or `databricks-product: genie`
- The selected workspace is inside the budget scope
- Account identity read access is available if direct-user or group overrides must be resolved

The spend comparison is estimated list cost from `system.billing.usage` and can lag. Budget enforcement is near real time. Do not treat an at/over estimate as proof that the identity is currently blocked.

### Warehouse or app start issues

Symptoms: app not `RUNNING`, or queries never return.

Checks: `databricks apps get`, app logs, warehouse state, and that `DATABRICKS_WAREHOUSE_ID` is bound from `sql-warehouse` rather than a hardcoded ID.
