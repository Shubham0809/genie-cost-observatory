import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LineChart,
  Skeleton,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Info, Sparkles, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { parseMonthCount, parseWorkspaceScope, publicQueryError } from '../../../shared/billing';
import { formatCompactNumber, formatCurrency, formatCurrencyRate, formatNumber, toNumber } from '../lib/formatters';

interface PromotionWhatIfPanelProps {
  monthCount: number;
  scopeId: string;
  scopeLabel: string;
}

interface ScenarioStatProps {
  label: string;
  value: string;
  detail: string;
  emphasized?: boolean;
}

function ScenarioStat({ label, value, detail, emphasized = false }: ScenarioStatProps) {
  return (
    <div className={emphasized ? 'rounded-lg border border-primary/30 bg-primary/5 p-4' : 'rounded-lg border p-4'}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PromotionWhatIfPanel({ monthCount, scopeId, scopeLabel }: PromotionWhatIfPanelProps) {
  const safeMonthCount = parseMonthCount(monthCount);
  const safeScopeId = parseWorkspaceScope(scopeId);
  const parameters = useMemo(
    () => ({ month_count: sql.int(safeMonthCount), workspace_id: sql.string(safeScopeId) }),
    [safeMonthCount, safeScopeId]
  );
  const scenario = useAnalyticsQuery('promotion_what_if', parameters);

  if (scenario.loading) {
    return <Skeleton className="h-[520px] rounded-xl" aria-label="Loading promotion removal simulation" />;
  }

  if (scenario.error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Promotion simulation unavailable</AlertTitle>
        <AlertDescription>{publicQueryError(scenario.error)}</AlertDescription>
      </Alert>
    );
  }

  const rows = scenario.data ?? [];
  const currentCost = rows.reduce((total, row) => total + toNumber(row.current_estimated_list_cost), 0);
  const incrementalCost = rows.reduce((total, row) => total + toNumber(row.estimated_incremental_cost), 0);
  const scenarioCost = rows.reduce((total, row) => total + toNumber(row.estimated_cost_without_agent_promotion), 0);
  const promotionalDbu = rows.reduce((total, row) => total + toNumber(row.promotional_agent_dbus), 0);
  const unpricedPromotionalDbu = rows.reduce((total, row) => total + toNumber(row.unpriced_promotional_dbus), 0);
  const averageReferenceRate = promotionalDbu > 0 ? incrementalCost / promotionalDbu : 0;
  const currencies = new Set(
    rows
      .filter((row) => toNumber(row.currency_count) === 1 && Boolean(row.currency_code))
      .map((row) => row.currency_code)
  );
  const currencyCode = currencies.size === 1 ? [...currencies][0] : null;
  const rateSources = [
    ...new Set(rows.filter((row) => toNumber(row.promotional_agent_dbus) > 0).map((row) => row.rate_source)),
  ];
  const chartData = rows.map((row) => ({
    month: row.usage_month,
    current_estimated_list_cost: toNumber(row.current_estimated_list_cost),
    simulated_without_agent_promotion: toNumber(row.estimated_cost_without_agent_promotion),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Promotion-removal simulation</h2>
        <p className="text-sm text-muted-foreground">
          A what-if estimate for {scopeLabel}, not an invoice or billed cost.
        </p>
      </div>

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-primary/5">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Genie Agent promotion removal</CardTitle>
            <Badge variant="outline">Simulation</Badge>
          </div>
          <CardDescription>
            Reprices identified-user Genie Agent promotional DBUs over the last {safeMonthCount} months. The Genie Code
            150-DBU allowance is unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <Alert className="border-primary/20 bg-background">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Simulated promotional cost is not actual billed cost. Rates come from observed billed Genie Agent
              effective-list prices for the same cloud and month, then a cloud fallback, then an account fallback.
            </AlertDescription>
          </Alert>

          {rows.length === 0 || promotionalDbu <= 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle>No promotional Genie Agent usage found</EmptyTitle>
                <EmptyDescription>
                  Current estimated list cost and the simulation are the same for this scope.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ScenarioStat
                  label="Current estimated list cost"
                  value={formatCurrency(currentCost, currencyCode)}
                  detail="Selected period with current coverage"
                />
                <ScenarioStat
                  label="Simulated without Agent promotion"
                  value={formatCurrency(scenarioCost, currencyCode)}
                  detail="Estimate, not an invoice"
                  emphasized
                />
                <ScenarioStat
                  label="Simulated increase"
                  value={`+${formatCurrency(incrementalCost, currencyCode)}`}
                  detail="Estimated list-cost impact"
                />
                <ScenarioStat
                  label="Agent DBUs repriced"
                  value={formatNumber(promotionalDbu)}
                  detail="Identified-user promotional usage"
                />
              </div>

              <LineChart
                data={chartData}
                xKey="month"
                yKey={['current_estimated_list_cost', 'simulated_without_agent_promotion']}
                colorPalette="diverging"
                height={300}
                showLegend
                showSymbol
                smooth={false}
                ariaLabel={`Current estimated list cost compared with Genie Agent promotion-removal simulation for ${scopeLabel}`}
                valueFormatter={(value) => formatCompactNumber(value)}
              />

              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>
                  Average applied proxy: {formatCurrencyRate(averageReferenceRate, currencyCode)} per DBU. No regional
                  SKU is hardcoded.
                </p>
                {rateSources.length > 0 && <p className="mt-2">Rate source: {rateSources.join('; ')}.</p>}
              </div>
            </>
          )}

          {unpricedPromotionalDbu > 0 && (
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Some promotional usage could not be repriced</AlertTitle>
              <AlertDescription>
                {formatNumber(unpricedPromotionalDbu)} DBUs are excluded because no billed Genie Agent reference rate
                was available.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
