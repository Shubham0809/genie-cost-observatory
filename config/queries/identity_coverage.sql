-- @param workspace_id STRING = __NONE__
-- @param identity_search STRING =
-- @param usage_month DATE = 1900-01-01
-- One scan of system.billing.usage for the selected month: selected-workspace
-- cost rows plus account-wide Genie Code free usage for the 150-DBU allowance.
WITH bounds AS (
  SELECT
    CASE
      WHEN CAST(:usage_month AS DATE) = DATE '1900-01-01'
        THEN CAST(date_trunc('MONTH', current_date()) AS DATE)
      ELSE CAST(:usage_month AS DATE)
    END AS month_start
), priced_usage AS (
  SELECT
    CAST(u.workspace_id AS STRING) AS workspace_id,
    COALESCE(u.identity_metadata.run_as, 'Unknown identity') AS run_as_identity,
    CASE
      WHEN u.identity_metadata.run_as IS NULL THEN 'Unknown'
      WHEN u.identity_metadata.run_as RLIKE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN 'Service principal'
      ELSE 'Identified user'
    END AS identity_type,
    CASE u.usage_metadata.genie.surface
      WHEN 'GENIE_AGENTS' THEN 'Genie Agent'
      WHEN 'GENIE_CODE' THEN 'Genie Code'
    END AS product,
    CAST(u.usage_quantity AS DOUBLE) AS total_dbus,
    CASE
      WHEN u.sku_name = 'GENIE_FREE_USAGE' THEN CAST(u.usage_quantity AS DOUBLE)
      ELSE 0.0
    END AS free_dbus,
    CASE
      WHEN u.sku_name <> 'GENIE_FREE_USAGE' THEN CAST(u.usage_quantity AS DOUBLE)
      ELSE 0.0
    END AS billed_dbus,
    CASE
      WHEN u.sku_name = 'GENIE_FREE_USAGE' THEN 0.0
      ELSE COALESCE(CAST(u.usage_quantity * lp.pricing.effective_list.default AS DOUBLE), 0.0)
    END AS estimated_list_cost,
    CASE
      WHEN u.sku_name <> 'GENIE_FREE_USAGE'
        AND lp.pricing.effective_list.default IS NULL
      THEN CAST(u.usage_quantity AS DOUBLE)
      ELSE 0.0
    END AS unpriced_billed_dbus,
    lp.currency_code,
    u.ingestion_date
  FROM system.billing.usage AS u
  LEFT JOIN system.billing.list_prices AS lp
    ON CAST(u.workspace_id AS STRING) = :workspace_id
    AND u.sku_name = lp.sku_name
    AND u.cloud = lp.cloud
    AND u.usage_end_time >= lp.price_start_time
    AND (
      lp.price_end_time IS NULL
      OR u.usage_end_time < lp.price_end_time
    )
  CROSS JOIN bounds
  WHERE u.billing_origin_product = 'GENIE'
    AND u.usage_metadata.genie.surface IN ('GENIE_AGENTS', 'GENIE_CODE')
    AND u.usage_date >= bounds.month_start
    AND u.usage_date < add_months(bounds.month_start, 1)
    AND (
      CAST(u.workspace_id AS STRING) = :workspace_id
      OR (
        u.usage_metadata.genie.surface = 'GENIE_CODE'
        AND u.sku_name = 'GENIE_FREE_USAGE'
      )
    )
), by_workspace_identity AS (
  SELECT
    workspace_id,
    run_as_identity,
    identity_type,
    product,
    SUM(total_dbus) AS total_dbus,
    SUM(free_dbus) AS free_dbus,
    SUM(billed_dbus) AS billed_dbus,
    SUM(estimated_list_cost) AS current_estimated_cost,
    SUM(unpriced_billed_dbus) AS unpriced_billed_dbus,
    MAX(currency_code) AS currency_code,
    MAX(ingestion_date) AS latest_ingestion_date
  FROM priced_usage
  GROUP BY workspace_id, run_as_identity, identity_type, product
), with_account_code_free AS (
  SELECT
    workspace_id,
    run_as_identity,
    identity_type,
    product,
    total_dbus,
    free_dbus,
    billed_dbus,
    current_estimated_cost,
    unpriced_billed_dbus,
    currency_code,
    latest_ingestion_date,
    SUM(CASE WHEN product = 'Genie Code' THEN free_dbus ELSE 0.0 END)
      OVER (PARTITION BY run_as_identity) AS account_month_free_dbus
  FROM by_workspace_identity
), coverage AS (
  SELECT
    run_as_identity,
    identity_type,
    product,
    total_dbus,
    free_dbus,
    CASE
      WHEN product = 'Genie Code' AND identity_type = 'Identified user' THEN 150.0
      ELSE NULL
    END AS free_tier_limit_dbus,
    CASE
      WHEN product = 'Genie Code' AND identity_type = 'Identified user'
        THEN greatest(150.0 - COALESCE(account_month_free_dbus, 0.0), 0.0)
      ELSE NULL
    END AS remaining_genie_code_allowance_dbus,
    billed_dbus,
    current_estimated_cost,
    current_estimated_cost AS estimated_cost_after_free_coverage,
    unpriced_billed_dbus,
    CASE
      WHEN product = 'Genie Code' AND identity_type = 'Identified user'
        THEN '150 free DBUs per identified user each calendar month, from account-wide Genie Code free usage'
      WHEN product = 'Genie Code'
        THEN 'Service-principal or unidentified usage is billed'
      WHEN product = 'Genie Agent'
        AND identity_type = 'Identified user'
        AND current_date() <= DATE '2027-01-31'
        THEN 'Identified-user promotional coverage through 2027-01-31'
      WHEN product = 'Genie Agent' AND identity_type = 'Service principal'
        THEN 'Service-principal usage is billed'
      ELSE 'Promotional period ended 2027-01-31 or identity is unknown'
    END AS coverage_basis,
    currency_code,
    latest_ingestion_date
  FROM with_account_code_free
  WHERE workspace_id = :workspace_id
)
SELECT
  *,
  COUNT(*) OVER () AS matching_identity_product_rows
FROM coverage
WHERE :identity_search = ''
  OR LOWER(run_as_identity) LIKE CONCAT('%', LOWER(:identity_search), '%')
  OR LOWER(identity_type) LIKE CONCAT('%', LOWER(:identity_search), '%')
ORDER BY current_estimated_cost DESC, total_dbus DESC, run_as_identity, product
LIMIT 200
