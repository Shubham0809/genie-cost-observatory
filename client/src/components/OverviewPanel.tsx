import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Bot, Code2, Gift, ReceiptText, TriangleAlert, WalletCards } from 'lucide-react';
import { useMemo } from 'react';
import { deriveOverview, parseMonthCount, parseWorkspaceScope, publicQueryError } from '../../../shared/billing';
import { formatCompactNumber, formatCurrency, formatDate, formatNumber, toNumber } from '../lib/formatters';
import { MetricCard } from './MetricCard';

interface OverviewPanelProps {
  monthCount: number;
  scopeId: string;
  scopeLabel: string;
}

export function OverviewPanel({ monthCount, scopeId, scopeLabel }: OverviewPanelProps) {
  const safeMonthCount = parseMonthCount(monthCount);
  const safeScopeId = parseWorkspaceScope(scopeId);
  const parameters = useMemo(
    () => ({ month_count: sql.int(safeMonthCount), workspace_id: sql.string(safeScopeId) }),
    [safeMonthCount, safeScopeId]
  );
  const overview = useAnalyticsQuery('overview', parameters);
  const { summary, monthlyTrend, productTotals } = useMemo(() => deriveOverview(overview.data ?? []), [overview.data]);

  if (overview.loading) {
    return (
      <div className="space-y-6" aria-label="Loading cost summary">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={`summary-skeleton-${index}`} className="h-40 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (overview.error) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Billing summary unavailable</AlertTitle>
        <AlertDescription>
          {publicQueryError(overview.error)}. Confirm the app service principal can query the billing system tables.
        </AlertDescription>
      </Alert>
    );
  }

  const hasUsage = toNumber(summary.usage_record_count) > 0;
  const currencyCode = toNumber(summary.currency_count) === 1 ? summary.currency_code : null;
  const periodDetail = `Current month-to-date · through ${formatDate(summary.latest_ingestion_date)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Current cost position</h2>
          <p className="text-sm text-muted-foreground">{scopeLabel}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.active_workspace_count, 0)} active workspace
          {toNumber(summary.active_workspace_count) === 1 ? '' : 's'} this month
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="MTD estimated list cost"
          value={formatCurrency(summary.mtd_estimated_list_cost, currencyCode)}
          detail={periodDetail}
          icon={WalletCards}
        />
        <MetricCard
          label="MTD free DBUs"
          value={formatNumber(summary.mtd_free_dbus)}
          detail={periodDetail}
          icon={Gift}
        />
        <MetricCard
          label="MTD billed DBUs"
          value={formatNumber(summary.mtd_billed_dbus)}
          detail={periodDetail}
          icon={ReceiptText}
        />
        <MetricCard
          label="Genie Agent cost"
          value={formatCurrency(summary.genie_agent_cost, currencyCode)}
          detail={periodDetail}
          icon={Bot}
        />
        <MetricCard
          label="Genie Code cost"
          value={formatCurrency(summary.genie_code_cost, currencyCode)}
          detail={periodDetail}
          icon={Code2}
        />
      </div>

      {!hasUsage && (
        <Empty className="rounded-xl border bg-card py-12">
          <EmptyHeader>
            <EmptyTitle>No Genie usage in this scope</EmptyTitle>
            <EmptyDescription>Choose another workspace or wait for system billing data to catch up.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {toNumber(summary.unpriced_billed_dbus) > 0 && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Some billed DBUs have no effective list price</AlertTitle>
          <AlertDescription>
            {formatNumber(summary.unpriced_billed_dbus)} DBUs are excluded from estimated list cost because no effective
            price matched.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.8fr)]">
        <Card className="min-w-0 shadow-sm">
          <CardHeader>
            <CardTitle>Estimated list cost trend</CardTitle>
            <CardDescription>Genie Agent and Genie Code over the last {safeMonthCount} months.</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              data={monthlyTrend}
              xKey="usage_month"
              yKey={['genie_agent_cost', 'genie_code_cost']}
              colorPalette="categorical"
              height={340}
              showLegend
              showSymbol
              smooth={false}
              ariaLabel={`Monthly estimated list cost for ${scopeLabel}`}
              valueFormatter={(value) => formatCompactNumber(value)}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Cost and DBUs by product</CardTitle>
            <CardDescription>Selected period for {scopeLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            {productTotals.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">No product detail found.</p>
            )}
            {productTotals.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Free DBUs</TableHead>
                    <TableHead className="text-right">Billed DBUs</TableHead>
                    <TableHead className="text-right">Est. list cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productTotals.map((product) => (
                    <TableRow key={product.product}>
                      <TableCell className="font-medium">{product.product}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(product.free_dbus)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(product.billed_dbus)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(product.estimated_list_cost, product.currency_code)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
