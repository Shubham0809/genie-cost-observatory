-- @param month_count INT = 6
-- @param search_term STRING =
WITH priced_usage AS (
  SELECT
    CAST(u.workspace_id AS STRING) AS workspace_id,
    u.usage_metadata.genie.surface AS surface,
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
  WHERE u.billing_origin_product = 'GENIE'
    AND u.usage_metadata.genie.surface IN ('GENIE_AGENTS', 'GENIE_CODE')
    AND u.usage_date >= add_months(CAST(date_trunc('MONTH', current_date()) AS DATE), 1 - :month_count)
    AND (
      :search_term = ''
      OR CAST(u.workspace_id AS STRING) LIKE CONCAT('%', :search_term, '%')
    )
)
SELECT
  workspace_id,
  SUM(total_dbus) AS total_dbus,
  SUM(free_dbus) AS free_dbus,
  SUM(billed_dbus) AS billed_dbus,
  SUM(CASE WHEN surface = 'GENIE_AGENTS' THEN estimated_list_cost ELSE 0.0 END) AS genie_agent_cost,
  SUM(CASE WHEN surface = 'GENIE_CODE' THEN estimated_list_cost ELSE 0.0 END) AS genie_code_cost,
  SUM(estimated_list_cost) AS estimated_list_cost,
  MAX(currency_code) AS currency_code,
  MAX(ingestion_date) AS latest_ingestion_date,
  COUNT(*) OVER () AS matching_workspace_count
FROM priced_usage
GROUP BY workspace_id
ORDER BY estimated_list_cost DESC, workspace_id
LIMIT 1000
