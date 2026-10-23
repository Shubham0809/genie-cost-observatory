-- @param run_as_identity STRING = __NONE__
-- @param usage_month DATE = 1900-01-01
-- @param workspace_ids STRING = __ALL__
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
    u.identity_metadata.run_as AS run_as_identity,
    CASE
      WHEN lp.pricing.effective_list.default IS NULL THEN 0.0
      ELSE CAST(u.usage_quantity * lp.pricing.effective_list.default AS DOUBLE)
    END AS estimated_list_cost,
    CASE
      WHEN lp.pricing.effective_list.default IS NULL THEN CAST(u.usage_quantity AS DOUBLE)
      ELSE 0.0
    END AS unpriced_billed_dbus,
    lp.currency_code,
    u.ingestion_date
  FROM system.billing.usage AS u
  LEFT JOIN system.billing.list_prices AS lp
    ON u.sku_name = lp.sku_name
    AND u.cloud = lp.cloud
    AND u.usage_end_time >= lp.price_start_time
    AND (
      lp.price_end_time IS NULL
      OR u.usage_end_time < lp.price_end_time
    )
  CROSS JOIN bounds
  WHERE u.billing_origin_product = 'GENIE'
    AND u.usage_metadata.genie.surface IN ('GENIE_AGENTS', 'GENIE_CODE')
    AND u.sku_name <> 'GENIE_FREE_USAGE'
    AND u.usage_date >= bounds.month_start
    AND u.usage_date < add_months(bounds.month_start, 1)
    AND :workspace_ids <> '__NONE__'
    AND (
      :workspace_ids = '__ALL__'
      OR array_contains(split(:workspace_ids, ','), CAST(u.workspace_id AS STRING))
    )
)
SELECT
  workspace_id,
  currency_code,
  SUM(estimated_list_cost) AS shared_estimated_list_cost,
  SUM(CASE WHEN run_as_identity = :run_as_identity THEN estimated_list_cost ELSE 0.0 END)
    AS identity_estimated_list_cost,
  SUM(unpriced_billed_dbus) AS shared_unpriced_billed_dbus,
  SUM(CASE WHEN run_as_identity = :run_as_identity THEN unpriced_billed_dbus ELSE 0.0 END)
    AS identity_unpriced_billed_dbus,
  MAX(ingestion_date) AS latest_ingestion_date
FROM priced_usage
GROUP BY workspace_id, currency_code
ORDER BY workspace_id, currency_code
LIMIT 1000
