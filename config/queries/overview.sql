-- @param month_count INT = 6
-- @param workspace_id STRING = __ALL__
-- One scan of system.billing.usage. GROUPING SETS emit:
--   grain='product' → month x product (trend chart and product table)
--   grain='month'   → month totals (MTD KPIs, workspace and record counts)
WITH bounds AS (
  SELECT
    CAST(date_trunc('MONTH', current_date()) AS DATE) AS current_month_start,
    add_months(CAST(date_trunc('MONTH', current_date()) AS DATE), 1 - :month_count) AS period_start
), priced_usage AS (
  SELECT
    CAST(date_trunc('MONTH', u.usage_date) AS DATE) AS usage_month,
    CASE u.usage_metadata.genie.surface
      WHEN 'GENIE_AGENTS' THEN 'Genie Agent'
      WHEN 'GENIE_CODE' THEN 'Genie Code'
    END AS product,
    u.workspace_id,
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
    AND u.usage_date >= bounds.period_start
    AND (
      :workspace_id = '__ALL__'
      OR CAST(u.workspace_id AS STRING) = :workspace_id
    )
)
SELECT
  CASE WHEN GROUPING(product) = 1 THEN 'month' ELSE 'product' END AS grain,
  usage_month,
  product,
  CASE
    WHEN usage_month = (SELECT current_month_start FROM bounds) THEN 1
    ELSE 0
  END AS is_current_month,
  SUM(total_dbus) AS total_dbus,
  SUM(free_dbus) AS free_dbus,
  SUM(billed_dbus) AS billed_dbus,
  SUM(estimated_list_cost) AS estimated_list_cost,
  SUM(unpriced_billed_dbus) AS unpriced_billed_dbus,
  COUNT(DISTINCT workspace_id) AS active_workspace_count,
  COUNT(*) AS usage_record_count,
  COUNT(DISTINCT currency_code) AS currency_count,
  MAX(currency_code) AS currency_code,
  MAX(ingestion_date) AS latest_ingestion_date
FROM priced_usage
GROUP BY GROUPING SETS (
  (usage_month, product),
  (usage_month)
)
ORDER BY usage_month, grain, product
