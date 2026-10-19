# Genie Cost Observatory

An AppKit React/TypeScript Databricks App for **account-wide** Genie cost observability. Deploy one copy in a customer Databricks environment and analyze Genie usage across every workspace visible to the app service principal. Do not deploy one app per workspace.

## Architecture

The app is a Databricks AppKit application:

- **Client:** React UI in `client/src`, using AppKit components and `useAnalyticsQuery`
- **Server:** `server/server.ts` starts AppKit with the `analytics` and `server` plugins
- **Queries:** parameterized SQL in `config/queries`, executed as the **app service principal**
- **Compute:** the SQL warehouse bound as `sql-warehouse` in `databricks.yml` / `app.yaml`
- **Deployment:** Databricks Asset Bundles, with `app_name` and `sql_warehouse_id` variables

Viewers authenticated to the app see the same account-wide billing dataset the service principal can read. App `CAN_USE` does **not** create row-level isolation by viewer.

## Account-wide data behavior

- The default scope is **All workspaces**.
- Workspace ranking, search, cost, and DBU totals come from `system.billing.usage` for every workspace ID present in that table and visible to the service principal.
- Selecting a workspace keeps the same reporting period and opens identity-level drill-down for that workspace.
- **All workspaces** returns to the account view without resetting the period.

Workspace visibility is therefore exactly the set of workspace IDs in `system.billing.usage` that the app service principal is allowed to read. It is not limited to the workspace where the app is hosted.

## Required system tables

| Table                             | Purpose                                                    | Required? |
| --------------------------------- | ---------------------------------------------------------- | --------- |
| `system.billing.usage`            | Genie usage quantity, SKU, identity, workspace, timestamps | Yes       |
| `system.billing.list_prices`      | `pricing.effective_list.default` for estimated list cost   | Yes       |
| `system.access.workspaces_latest` | Workspace display names and status                         | No        |

Genie rows are filtered with `billing_origin_product = 'GENIE'` and `usage_metadata.genie.surface IN ('GENIE_AGENTS', 'GENIE_CODE')`. Display names are **Genie Agent** and **Genie Code**. SKU names are never hardcoded by region; prices come from `system.billing.list_prices`.

`GENIE_FREE_USAGE` is treated as free usage with zero estimated list cost.

## Workspace names

Billing queries do not join `system.access.workspaces_latest`, so missing metadata cannot drop cost rows. Names are loaded separately. If that query fails or a workspace ID is unknown, the UI labels it **Workspace \<workspace_id\>**.

## Metrics

The overview shows current month-to-date:

- Estimated list cost
- Free DBUs
- Billed DBUs
- Genie Agent estimated list cost
- Genie Code estimated list cost

It also shows a monthly cost trend, product DBU/cost detail, workspace ranking, identity coverage, and a promotion-removal **simulation**. Overview KPIs, trend, and product totals come from a single `system.billing.usage` scan.

## Free-tier coverage and billed overage

This section is labeled **Free-tier coverage and billed overage**.

- **Genie Code:** each identified user receives 150 free DBUs per calendar month. Usage beyond that allowance is billed. Remaining allowance is `greatest(150 - free_dbus, 0)`.
- **Genie Agents:** identified-user usage is promotional/free through 31 January 2027. Service-principal usage is billed. The 150-DBU Code allowance is **not** applied to Agents.

### Allowance interpretation

The Genie Code 150-DBU remaining allowance is calculated **per identified user, per calendar month, across the account**. Workspace identity rows still show that workspace’s DBUs and estimated list cost. Remaining Code allowance uses the identity’s account-wide `GENIE_FREE_USAGE` for Genie Code in the selected month, because billing records identify the user, not a workspace-local entitlement.

## Promotion-removal simulation

The Simulation tab estimates what identified-user Genie Agent promotional usage could cost if promotional credits were removed. It:

- Leaves the Genie Code 150-DBU allowance unchanged
- Uses observed billed Genie Agent `pricing.effective_list.default` rates
- Prefers the same cloud and month, then a cloud-level rate, then an account-level rate
- Ignores non-positive quantities and prices so billing corrections cannot produce a negative proxy rate
- Labels the result as a **simulation**, not an invoice
- Explains the rate source or fallback, and omits simulated cost when no billed rate exists

## Cost caveats

Never treat these figures as a final invoice.

- Costs use billed DBUs and `pricing.effective_list.default`.
- Results may differ from negotiated or invoiced amounts.
- System billing data may lag recent activity.
- Promotion-removal values are estimates based on observed effective-list rates.

## Security

The app authenticates as a Databricks App and queries through its service principal. Source configuration does not embed personal access tokens, OAuth client secrets, passwords, or workspace-specific secrets.

**Shared visibility:** every app viewer sees the account-wide billing data accessible to that service principal. Do not assume Databricks App `CAN_USE` isolates rows by user.

## Minimum permissions

Grant the **app service principal**:

- `CAN_USE` on the configured SQL warehouse (the bundle grants this on deploy)
- `USE CATALOG` on `system`
- `USE SCHEMA` on `system.billing`
- `SELECT` on `system.billing.usage`
- `SELECT` on `system.billing.list_prices`
- `USE SCHEMA` on `system.access` and `SELECT` on `system.access.workspaces_latest` **only if** workspace names should resolve

Do not grant account-admin, broad catalog, or unrelated privileges.

Grant **app viewers** only app `CAN_USE` unless they must manage the app. Viewer access is separate from system-table access.

The warehouse should be able to query those system tables. A serverless SQL warehouse is recommended.

## Local validation

```bash
npm install
npm run typegen -- --wait
npm run typecheck
npm run lint
npm run lint:ast-grep
npm test
npm run build
```

Set `DATABRICKS_CONFIG_PROFILE` and `DATABRICKS_WAREHOUSE_ID` in `.env` (see `.env.example`) for local type generation. Do not commit `.env`.

In this development environment, Databricks CLI commands must use `--profile fevm-stable-oauth`.

## Customer deployment

Customers do not edit source to deploy. Use a Databricks CLI profile for the destination workspace and pass bundle variables. Full steps, profile setup, grants, and troubleshooting are in [CUSTOMER_DEPLOYMENT.md](CUSTOMER_DEPLOYMENT.md).

```bash
databricks bundle validate --strict -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"

databricks apps validate -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"

databricks apps deploy -t customer \
  --profile <customer-profile> \
  --var="app_name=genie-cost-observatory" \
  --var="sql_warehouse_id=<warehouse-id>"
```

`databricks apps deploy` uploads, creates, and starts the app. `databricks bundle deploy` with the same `-t` / `--profile` / `--var` flags also starts this app because `lifecycle.started` is `true`.
