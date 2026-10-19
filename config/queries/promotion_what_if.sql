-- @param month_count INT = 6
-- @param workspace_id STRING = __ALL__
-- One scan of system.billing.usage. Billed Agent rows (24 months, account-wide)
-- feed proxy rates; scoped rows (selected period and workspace) feed current
-- cost and identified-user promotional Agent DBUs. Service principal run-as
-- UUIDs are billed, not repriced.
WITH scanned AS (
  SELECT
    u.cloud,
    CAST(date_trunc('MONTH', u.usage_date) AS DATE) AS usage_month,
    u.usage_metadata.genie.surface AS surface,
    u.sku_name,
    u.usage_unit,
    u.identity_metadata.run_as AS run_as,
    CAST(u.usage_quantity AS DOUBLE) AS usage_quantity,
    CAST(lp.pricing.effective_list.default AS DOUBLE) AS list_price,
    lp.currency_code,
    CAST(u.usage_quantity AS DOUBLE) > 0 AS has_positive_quantity,
    CAST(lp.pricing.effective_list.default AS DOUBLE) > 0 AS has_positive_price,
    (
      u.usage_date >= add_months(CAST(date_trunc('MONTH', current_date()) AS DATE), 1 - :month_count)
      AND (
        :workspace_id = '__ALL__'
        OR CAST(u.workspace_id AS STRING) = :workspace_id
      )
    ) AS is_scoped
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
    AND u.usage_date >= add_months(CAST(date_trunc('MONTH', current_date()) AS DATE), -23)
    AND (
      (
        u.usage_metadata.genie.surface = 'GENIE_AGENTS'
        AND u.sku_name <> 'GENIE_FREE_USAGE'
        AND u.usage_unit = 'DBU'
      )
      OR (
        u.usage_date >= add_months(CAST(date_trunc('MONTH', current_date()) AS DATE), 1 - :month_count)
        AND (
          :workspace_id = '__ALL__'
          OR CAST(u.workspace_id AS STRING) = :workspace_id
        )
      )
    )
), cloud_month AS (
  SELECT
    cloud,
    usage_month,
    SUM(
      CASE
        WHEN surface = 'GENIE_AGENTS'
          AND sku_name <> 'GENIE_FREE_USAGE'
          AND usage_unit = 'DBU'
          AND has_positive_quantity
          AND has_positive_price
        THEN usage_quantity * list_price
        ELSE 0.0
      END
    ) AS billed_agent_cost,
    SUM(
      CASE
        WHEN surface = 'GENIE_AGENTS'
          AND sku_name <> 'GENIE_FREE_USAGE'
          AND usage_unit = 'DBU'
          AND has_positive_quantity
          AND has_positive_price
        THEN usage_quantity
        ELSE 0.0
      END
    ) AS billed_agent_dbus,
    CASE
      WHEN COUNT(
        DISTINCT CASE
          WHEN surface = 'GENIE_AGENTS'
            AND sku_name <> 'GENIE_FREE_USAGE'
            AND usage_unit = 'DBU'
            AND has_positive_quantity
            AND has_positive_price
          THEN currency_code
        END
      ) = 1
      THEN MAX(
        CASE
          WHEN surface = 'GENIE_AGENTS'
            AND sku_name <> 'GENIE_FREE_USAGE'
            AND usage_unit = 'DBU'
            AND has_positive_quantity
            AND has_positive_price
          THEN currency_code
        END
      )
    END AS billed_agent_currency_code,
    SUM(
      CASE
        WHEN is_scoped THEN
          CASE
            WHEN sku_name = 'GENIE_FREE_USAGE' THEN 0.0
            ELSE COALESCE(usage_quantity * list_price, 0.0)
          END
      END
    ) AS current_estimated_list_cost,
    COUNT(DISTINCT CASE WHEN is_scoped THEN currency_code END) AS scoped_currency_count,
    MAX(CASE WHEN is_scoped THEN currency_code END) AS scoped_currency_code,
    SUM(
      CASE
        WHEN is_scoped
          AND surface = 'GENIE_AGENTS'
          AND sku_name = 'GENIE_FREE_USAGE'
          AND usage_unit = 'DBU'
          AND run_as IS NOT NULL
          AND NOT (
            run_as RLIKE '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          )
        THEN GREATEST(usage_quantity, 0.0)
        ELSE 0.0
      END
    ) AS promotional_agent_dbus
  FROM scanned
  GROUP BY cloud, usage_month
), cloud_month_rates AS (
  SELECT
    cloud,
    usage_month,
    billed_agent_cost / NULLIF(billed_agent_dbus, 0.0) AS reference_rate_per_dbu,
    billed_agent_currency_code AS currency_code
  FROM cloud_month
  WHERE billed_agent_cost / NULLIF(billed_agent_dbus, 0.0) > 0
), cloud_fallback_rates AS (
  SELECT
    cloud,
    SUM(billed_agent_cost) / NULLIF(SUM(billed_agent_dbus), 0.0) AS reference_rate_per_dbu,
    CASE
      WHEN COUNT(DISTINCT billed_agent_currency_code) = 1 THEN MAX(billed_agent_currency_code)
    END AS currency_code
  FROM cloud_month
  GROUP BY cloud
  HAVING SUM(billed_agent_cost) / NULLIF(SUM(billed_agent_dbus), 0.0) > 0
), account_fallback_rate AS (
  SELECT
    SUM(billed_agent_cost) / NULLIF(SUM(billed_agent_dbus), 0.0) AS reference_rate_per_dbu,
    CASE
      WHEN COUNT(DISTINCT billed_agent_currency_code) = 1 THEN MAX(billed_agent_currency_code)
    END AS currency_code
  FROM cloud_month
  HAVING SUM(billed_agent_cost) / NULLIF(SUM(billed_agent_dbus), 0.0) > 0
), current_cost_by_month AS (
  SELECT
    usage_month,
    SUM(current_estimated_list_cost) AS current_estimated_list_cost,
    CASE
      WHEN MAX(scoped_currency_count) > 1 OR COUNT(DISTINCT scoped_currency_code) > 1 THEN 2
      WHEN MAX(scoped_currency_code) IS NULL THEN 0
      ELSE 1
    END AS currency_count,
    MAX(scoped_currency_code) AS currency_code
  FROM cloud_month
  WHERE current_estimated_list_cost IS NOT NULL
  GROUP BY usage_month
), scoped_promotional_agent_usage AS (
  SELECT
    cloud,
    usage_month,
    promotional_agent_dbus
  FROM cloud_month
  WHERE promotional_agent_dbus > 0
), repriced_promotional_usage AS (
  SELECT
    promotional.usage_month,
    promotional.promotional_agent_dbus,
    promotional.promotional_agent_dbus
      * COALESCE(month_rate.reference_rate_per_dbu, cloud_rate.reference_rate_per_dbu, account_rate.reference_rate_per_dbu)
      AS estimated_incremental_cost,
    CASE
      WHEN month_rate.reference_rate_per_dbu IS NOT NULL THEN 1
      WHEN cloud_rate.reference_rate_per_dbu IS NOT NULL THEN 2
      WHEN account_rate.reference_rate_per_dbu IS NOT NULL THEN 3
      ELSE 4
    END AS rate_tier,
    CASE
      WHEN COALESCE(month_rate.reference_rate_per_dbu, cloud_rate.reference_rate_per_dbu, account_rate.reference_rate_per_dbu) IS NULL
        THEN promotional.promotional_agent_dbus
      ELSE 0.0
    END AS unpriced_promotional_dbus,
    COALESCE(month_rate.currency_code, cloud_rate.currency_code, account_rate.currency_code) AS reference_currency_code
  FROM scoped_promotional_agent_usage AS promotional
  LEFT JOIN cloud_month_rates AS month_rate
    ON promotional.cloud = month_rate.cloud
    AND promotional.usage_month = month_rate.usage_month
  LEFT JOIN cloud_fallback_rates AS cloud_rate
    ON promotional.cloud = cloud_rate.cloud
  LEFT JOIN account_fallback_rate AS account_rate
    ON true
), promotion_impact_by_month AS (
  SELECT
    usage_month,
    SUM(promotional_agent_dbus) AS promotional_agent_dbus,
    COALESCE(SUM(estimated_incremental_cost), 0.0) AS estimated_incremental_cost,
    COALESCE(SUM(unpriced_promotional_dbus), 0.0) AS unpriced_promotional_dbus,
    MAX(rate_tier) AS rate_tier,
    COUNT(DISTINCT reference_currency_code) AS reference_currency_count,
    MAX(reference_currency_code) AS reference_currency_code
  FROM repriced_promotional_usage
  GROUP BY usage_month
)
SELECT
  current_cost.usage_month,
  current_cost.current_estimated_list_cost,
  COALESCE(promotion_impact.promotional_agent_dbus, 0.0) AS promotional_agent_dbus,
  COALESCE(promotion_impact.estimated_incremental_cost, 0.0) AS estimated_incremental_cost,
  current_cost.current_estimated_list_cost
    + COALESCE(promotion_impact.estimated_incremental_cost, 0.0) AS estimated_cost_without_agent_promotion,
  COALESCE(promotion_impact.estimated_incremental_cost, 0.0)
    / NULLIF(promotion_impact.promotional_agent_dbus, 0.0) AS applied_reference_rate_per_dbu,
  CASE promotion_impact.rate_tier
    WHEN 1 THEN 'Observed billed Agent rate for the same cloud and month'
    WHEN 2 THEN 'Observed billed Agent rate using the cloud fallback'
    WHEN 3 THEN 'Observed billed Agent rate using the account fallback'
    WHEN 4 THEN 'No observed billed Agent rate available'
    ELSE 'No promotional Agent usage'
  END AS rate_source,
  COALESCE(promotion_impact.unpriced_promotional_dbus, 0.0) AS unpriced_promotional_dbus,
  CASE
    WHEN current_cost.currency_count > 1
      OR COALESCE(promotion_impact.reference_currency_count, 0) > 1
      OR (
        current_cost.currency_code IS NOT NULL
        AND promotion_impact.reference_currency_code IS NOT NULL
        AND current_cost.currency_code <> promotion_impact.reference_currency_code
      )
      THEN 2
    WHEN COALESCE(current_cost.currency_code, promotion_impact.reference_currency_code) IS NULL THEN 0
    ELSE 1
  END AS currency_count,
  CASE
    WHEN current_cost.currency_count > 1
      OR COALESCE(promotion_impact.reference_currency_count, 0) > 1
      OR (
        current_cost.currency_code IS NOT NULL
        AND promotion_impact.reference_currency_code IS NOT NULL
        AND current_cost.currency_code <> promotion_impact.reference_currency_code
      )
      THEN NULL
    ELSE COALESCE(current_cost.currency_code, promotion_impact.reference_currency_code)
  END AS currency_code
FROM current_cost_by_month AS current_cost
LEFT JOIN promotion_impact_by_month AS promotion_impact
  ON current_cost.usage_month = promotion_impact.usage_month
ORDER BY current_cost.usage_month
