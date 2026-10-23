#!/usr/bin/env bash
# Deploy Genie Cost Observatory and apply the runtime permissions the app needs.
# Looks up account ID/host from the destination workspace. Does not write them into source.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE=""
WAREHOUSE_ID=""
TARGET="customer"
APP_NAME="genie-cost-observatory"
SKIP_DEPLOY=0
GRANTS_ONLY=0
SKIP_GRANTS=0
DRY_RUN=0
GRANT_WORKSPACE_NAMES=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh --profile <cli-profile> --warehouse-id <warehouse-id> [options]

Resolves the Databricks account ID and account host from the destination workspace,
deploys the app, then grants the app service principal:
  - CAN_USE on the SQL warehouse (bundle)
  - USE CATALOG / USE SCHEMA / SELECT on system.billing tables
  - roles/budget.viewer on visible Unity Gateway Genie budgets

Does not grant Budget Manager, account-admin, or extra catalog rights.
Does not write account IDs, hosts, or tokens into source files.

Options:
  --target <name>            Bundle target (default: customer)
  --app-name <name>          App name (default: genie-cost-observatory)
  --dry-run                  Resolve and validate only; do not deploy or grant
  --skip-deploy              Skip validate/deploy; only run grants
  --grants-only              Same as --skip-deploy
  --skip-grants              Deploy only; do not change permissions
  --grant-workspace-names    Also grant SELECT on system.access.workspaces_latest
  -h, --help                 Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --warehouse-id)
      WAREHOUSE_ID="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --app-name)
      APP_NAME="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-deploy | --grants-only)
      SKIP_DEPLOY=1
      GRANTS_ONLY=1
      shift
      ;;
    --skip-grants)
      SKIP_GRANTS=1
      shift
      ;;
    --grant-workspace-names)
      GRANT_WORKSPACE_NAMES=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PROFILE" || -z "$WAREHOUSE_ID" ]]; then
  usage >&2
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd databricks
need_cmd python3
need_cmd npx

db() {
  databricks "$@" --profile "$PROFILE"
}

json_get() {
  python3 -c 'import json,sys
data=json.load(sys.stdin)
path=sys.argv[1].split(".")
for key in path:
  if isinstance(data, dict):
    data=data.get(key)
  else:
    data=None
    break
if data is None:
  sys.exit(1)
if isinstance(data, (dict, list)):
  json.dump(data, sys.stdout)
else:
  sys.stdout.write(str(data))
' "$1"
}

echo "Resolving workspace host from profile ${PROFILE}..."
AUTH_JSON="$(db auth env -o json)"
WORKSPACE_HOST="$(
  printf '%s' "$AUTH_JSON" | python3 -c 'import json,sys
data=json.load(sys.stdin)
if isinstance(data, dict) and data.get("DATABRICKS_HOST"):
  print(data["DATABRICKS_HOST"]); raise SystemExit
env=data.get("env") if isinstance(data, dict) else None
if isinstance(env, list):
  for item in env:
    if item.get("name")=="DATABRICKS_HOST" and item.get("value"):
      print(item["value"]); raise SystemExit
if isinstance(env, dict) and env.get("DATABRICKS_HOST"):
  print(env["DATABRICKS_HOST"]); raise SystemExit
raise SystemExit("Could not read DATABRICKS_HOST from databricks auth env")
'
)"
ACCOUNT_HOST="$(npx tsx "$ROOT/scripts/deploy-helpers.ts" account-host "$WORKSPACE_HOST")"
if [[ -z "$ACCOUNT_HOST" ]]; then
  echo "Could not derive the account console host from the workspace URL. Pass a supported Databricks workspace profile." >&2
  exit 1
fi

echo "Ensuring SQL warehouse is running..."
WAREHOUSE_STATE="$(db warehouses get "$WAREHOUSE_ID" -o json | json_get state || true)"
if [[ "$WAREHOUSE_STATE" != "RUNNING" ]]; then
  db warehouses start "$WAREHOUSE_ID" >/dev/null
fi

echo "Looking up account ID from system.billing.usage..."
STATEMENT_JSON="$(
  db api post /api/2.0/sql/statements --json "$(
    python3 -c 'import json,sys
print(json.dumps({
  "warehouse_id": sys.argv[1],
  "catalog": "system",
  "schema": "billing",
  "statement": "SELECT account_id FROM system.billing.usage WHERE account_id IS NOT NULL LIMIT 1",
  "wait_timeout": "50s",
  "on_wait_timeout": "CANCEL",
}))' "$WAREHOUSE_ID"
  )" -o json
)"
ACCOUNT_ID="$(
  printf '%s' "$STATEMENT_JSON" | python3 -c 'import json,sys
data=json.load(sys.stdin)
state=(data.get("status") or {}).get("state")
if state and state != "SUCCEEDED":
  raise SystemExit(f"Account ID lookup did not succeed ({state})")
rows=((data.get("result") or {}).get("data_array")) or []
if not rows or not rows[0] or not rows[0][0]:
  raise SystemExit("system.billing.usage did not return an account_id")
print(rows[0][0])
'
)"

VARS=(
  --var="app_name=${APP_NAME}"
  --var="sql_warehouse_id=${WAREHOUSE_ID}"
  --var="databricks_account_id=${ACCOUNT_ID}"
  --var="databricks_account_host=${ACCOUNT_HOST}"
)

echo "Resolved account host from the workspace URL and account ID from billing usage."
echo "These values are passed as bundle variables only; they are not written into source."

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Validating bundle (dry run)..."
  db bundle validate --strict -t "$TARGET" "${VARS[@]}"
  db apps validate -t "$TARGET" "${VARS[@]}"
  echo "Dry run succeeded. Re-run without --dry-run to deploy and grant."
  exit 0
fi

if [[ "$SKIP_DEPLOY" -eq 0 ]]; then
  echo "Validating and deploying ${APP_NAME} to target ${TARGET}..."
  db bundle validate --strict -t "$TARGET" "${VARS[@]}"
  db apps validate -t "$TARGET" "${VARS[@]}"
  db apps deploy -t "$TARGET" "${VARS[@]}"
fi

if [[ "$SKIP_GRANTS" -eq 1 ]]; then
  echo "Skipping permission grants."
  exit 0
fi

echo "Reading the app service principal..."
APP_JSON="$(db apps get "$APP_NAME" -o json)"
APP_SP="$(printf '%s' "$APP_JSON" | json_get service_principal_client_id || true)"
if [[ -z "$APP_SP" ]]; then
  echo "Could not read service_principal_client_id from the deployed app." >&2
  exit 1
fi

GRANT_FAILURES=0

grant_uc() {
  local securable_type="$1"
  local full_name="$2"
  local privilege="$3"
  if db grants update "$securable_type" "$full_name" --json "$(
    python3 -c 'import json,sys
print(json.dumps({"changes":[{"principal":sys.argv[1],"add":[sys.argv[2]]}]}))' "$APP_SP" "$privilege"
  )"; then
    echo "Granted ${privilege} on ${full_name}."
  else
    echo "Could not grant ${privilege} on ${full_name}. A metastore admin may need to run this grant." >&2
    GRANT_FAILURES=1
  fi
}

echo "Granting minimum system-table privileges..."
grant_uc catalog system USE_CATALOG
grant_uc schema system.billing USE_SCHEMA
grant_uc table system.billing.usage SELECT
grant_uc table system.billing.list_prices SELECT
if [[ "$GRANT_WORKSPACE_NAMES" -eq 1 ]]; then
  grant_uc schema system.access USE_SCHEMA || true
  grant_uc table system.access.workspaces_latest SELECT
fi

echo "Granting Budget Viewer on Unity Gateway Genie budgets..."
ACCOUNT_ENV=(
  DATABRICKS_HOST="${ACCOUNT_HOST%/}"
  DATABRICKS_ACCOUNT_ID="${ACCOUNT_ID}"
)
if BUDGETS_JSON="$(env "${ACCOUNT_ENV[@]}" db account budgets list -o json)"; then
  BUDGET_IDS=()
  while IFS= read -r budget_id; do
    if [[ -n "$budget_id" ]]; then
      BUDGET_IDS+=("$budget_id")
    fi
  done < <(printf '%s' "$BUDGETS_JSON" | npx tsx "$ROOT/scripts/deploy-helpers.ts" genie-budget-ids)
  if [[ "${#BUDGET_IDS[@]}" -eq 0 ]]; then
    echo "No Unity Gateway Genie budgets were visible to this profile. Budget Viewer was not changed."
  fi
  for BUDGET_ID in "${BUDGET_IDS[@]}"; do
    RULE_NAME="accounts/${ACCOUNT_ID}/budgets/${BUDGET_ID}/ruleSets/default"
    if ! RULE_JSON="$(env "${ACCOUNT_ENV[@]}" db account access-control get-rule-set "$RULE_NAME" "" -o json)"; then
      echo "Could not read permissions for a Genie budget. The deployer needs Budget Manager or account-admin on that budget." >&2
      GRANT_FAILURES=1
      continue
    fi
    MERGED_RULES="$(printf '%s' "$RULE_JSON" | npx tsx "$ROOT/scripts/deploy-helpers.ts" merge-viewer-grant "$APP_SP")"
    UPDATE_JSON="$(
      python3 -c 'import json,sys
name=sys.argv[1]
etag=sys.argv[2]
rules=json.loads(sys.argv[3])
print(json.dumps({
  "name": name,
  "rule_set": {"name": name, "etag": etag, "grant_rules": rules},
}))' "$RULE_NAME" "$(printf '%s' "$RULE_JSON" | json_get etag)" "$MERGED_RULES"
    )"
    if env "${ACCOUNT_ENV[@]}" db account access-control update-rule-set --json "$UPDATE_JSON"; then
      echo "Granted roles/budget.viewer on a visible Genie budget."
    else
      echo "Could not grant roles/budget.viewer on a visible Genie budget." >&2
      GRANT_FAILURES=1
    fi
  done
else
  echo "Could not list account budgets with this profile. Budget Viewer grants were skipped." >&2
  echo "The deployer needs account access that can list budgets, or grant roles/budget.viewer in the account console." >&2
  GRANT_FAILURES=1
fi

if [[ "$GRANT_FAILURES" -eq 1 ]]; then
  echo "Deploy finished, but one or more permission grants need an administrator. The app is deployed; rerun with --grants-only after those rights are available." >&2
  exit 1
fi

echo "Deployment complete. Warehouse CAN_USE, billing SELECT, and Budget Viewer grants were applied."
