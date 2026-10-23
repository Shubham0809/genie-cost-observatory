import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
import { ShieldAlert, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  billingFreshness,
  budgetCouldBlock,
  budgetSpendWorkspaceFilter,
  estimateBudgetRule,
  latestUsageIngestionDate,
  usageHasUnpricedDbus,
  type ApplicableBudget,
  type BudgetApiErrorResponse,
  type BudgetControlsResponse,
  type BudgetRule,
} from '../../../shared/budgets';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../lib/formatters';

interface BudgetIdentity {
  name: string;
  type: 'Identified user' | 'Service principal' | 'Unknown';
}

interface BudgetImpactPanelProps {
  identity: BudgetIdentity;
  workspaceId: string;
  usageMonth: string;
  onClose: () => void;
}

interface BudgetFetchState {
  data?: BudgetControlsResponse;
  error?: string;
  loading: boolean;
}

export function BudgetImpactPanel({ identity, workspaceId, usageMonth, onClose }: BudgetImpactPanelProps) {
  const [budgetState, setBudgetState] = useState<BudgetFetchState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      workspace_id: workspaceId,
      identity: identity.name,
      identity_type: identity.type,
    });
    fetch(`/api/budget-controls?${parameters.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as BudgetControlsResponse | BudgetApiErrorResponse;
        if (!response.ok || 'code' in body) {
          throw new Error('message' in body ? body.message : 'Budget controls could not be loaded.');
        }
        return body;
      })
      .then((data) => setBudgetState({ data, loading: false }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setBudgetState({
          error: error instanceof Error ? error.message : 'Budget controls could not be loaded.',
          loading: false,
        });
      });
    return () => controller.abort();
  }, [identity.name, identity.type, workspaceId]);

  const couldBlock = budgetCouldBlock(budgetState.data?.budgets ?? []);

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Budget controls for {identity.name}</CardTitle>
              {!budgetState.loading && budgetState.data && (
                <Badge variant={couldBlock ? 'destructive' : 'secondary'}>
                  {couldBlock ? 'Could block usage' : 'No BLOCK_USAGE rule visible'}
                </Badge>
              )}
            </div>
            <CardDescription>
              Current Genie budget configuration for workspace {workspaceId}, compared with estimated paid list cost.
              This does not confirm that the identity is currently blocked.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close budget controls">
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {budgetState.loading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {budgetState.error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Budget controls unavailable</AlertTitle>
            <AlertDescription>{budgetState.error}</AlertDescription>
          </Alert>
        )}

        {budgetState.data?.identityResolution.status === 'unavailable' && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Effective override could not be resolved</AlertTitle>
            <AlertDescription>{budgetState.data.identityResolution.message}</AlertDescription>
          </Alert>
        )}

        {budgetState.data && budgetState.data.budgets.length === 0 && (
          <Empty className="bg-background/70 py-10">
            <EmptyHeader>
              <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <EmptyTitle>No applicable Genie budget is visible</EmptyTitle>
              <EmptyDescription>
                No Unity Gateway Genie budget covering this workspace is visible to the app service principal.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {budgetState.data && budgetState.data.budgets.length > 0 && (
          <BudgetSpendSection
            identityName={identity.name}
            usageMonth={usageMonth}
            budgets={budgetState.data.budgets}
            fetchedAt={budgetState.data.fetchedAt}
          />
        )}
      </CardContent>
    </Card>
  );
}

function BudgetSpendSection({
  identityName,
  usageMonth,
  budgets,
  fetchedAt,
}: {
  identityName: string;
  usageMonth: string;
  budgets: ApplicableBudget[];
  fetchedAt: string;
}) {
  const workspaceIds = useMemo(() => budgetSpendWorkspaceFilter(budgets), [budgets]);
  const usageParameters = useMemo(
    () => ({
      run_as_identity: sql.string(identityName),
      usage_month: sql.date(usageMonth),
      workspace_ids: sql.string(workspaceIds),
    }),
    [identityName, usageMonth, workspaceIds]
  );
  const usage = useAnalyticsQuery('budget_scope_usage', usageParameters);
  const latestIngestionDate = latestUsageIngestionDate(usage.data ?? []);
  const freshness = billingFreshness(latestIngestionDate, usageMonth, {
    unpriced: usageHasUnpricedDbus(usage.data ?? []),
  });

  return (
    <>
      {usage.error && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Spend estimate unavailable</AlertTitle>
          <AlertDescription>
            Budget configuration is shown, but billing usage could not be compared with its thresholds.
          </AlertDescription>
        </Alert>
      )}

      {!usage.error && !usage.loading && (freshness.stale || freshness.unpriced) && freshness.message && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Partial or lagged billing data</AlertTitle>
          <AlertDescription>{freshness.message}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table className="min-w-[1050px]">
          <TableHeader>
            <TableRow>
              <TableHead>Budget</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead className="text-right">Threshold</TableHead>
              <TableHead className="text-right">Estimated MTD spend</TableHead>
              <TableHead className="text-right">Estimated remaining</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgets.flatMap((budget) =>
              budget.rules.map((rule) => (
                <BudgetRuleRow
                  key={`${budget.id}-${rule.id}`}
                  budget={budget}
                  rule={rule}
                  usageRows={usage.data ?? []}
                  usageLoading={usage.loading}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Estimated list cost from billed Genie DBUs × pricing.effective_list.default
        {latestIngestionDate ? `, through ${formatDate(latestIngestionDate)}` : ''}. Configuration fetched{' '}
        {formatDateTime(fetchedAt)} UTC. Budget enforcement is near real time; this spend can lag. A BLOCK_USAGE rule
        could block usage at its threshold — this panel does not confirm a live block. Current configuration may differ
        from a historical month.
      </p>
    </>
  );
}

function BudgetRuleRow({
  budget,
  rule,
  usageRows,
  usageLoading,
}: {
  budget: ApplicableBudget;
  rule: BudgetRule;
  usageRows: Parameters<typeof estimateBudgetRule>[2];
  usageLoading: boolean;
}) {
  const estimate = estimateBudgetRule(budget, rule, usageRows);
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{budget.name}</p>
        <p className="text-xs text-muted-foreground">
          {budget.workspaceScope === 'all-workspaces'
            ? 'All workspaces'
            : `${budget.workspaceIds.length} selected workspace${budget.workspaceIds.length === 1 ? '' : 's'}`}
        </p>
      </TableCell>
      <TableCell>
        <p>{rule.scope === 'shared' ? 'Shared' : 'Per user'}</p>
        {rule.configuredThresholdUsd !== null && (
          <p className="text-xs text-muted-foreground">
            Configured {formatCurrency(rule.configuredThresholdUsd, 'USD')}
          </p>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {rule.effectiveThresholdUsd === null ? 'Unresolved' : formatCurrency(rule.effectiveThresholdUsd, 'USD')}
        {rule.thresholdSource === 'principal-override' && (
          <p className="text-xs text-muted-foreground">Override applies</p>
        )}
        {rule.thresholdSource === 'default' && rule.overrideCount > 0 && (
          <p className="text-xs text-muted-foreground">No matching override</p>
        )}
        {rule.thresholdSource === 'unresolved' && <p className="text-xs text-muted-foreground">Override may apply</p>}
        {rule.thresholdSource === 'not-applicable' && <p className="text-xs text-muted-foreground">Shared threshold</p>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {usageLoading
          ? 'Loading…'
          : estimate.spendUsd === null
            ? 'Unavailable'
            : formatCurrency(estimate.spendUsd, 'USD')}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {usageLoading
          ? 'Loading…'
          : estimate.remainingUsd === null
            ? 'Unavailable'
            : formatCurrency(estimate.remainingUsd, 'USD')}
        {estimate.unpricedBilledDbus > 0 && (
          <p className="text-xs text-muted-foreground">{formatNumber(estimate.unpricedBilledDbus)} unpriced DBUs</p>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          {rule.blockUsage && <Badge variant="destructive">Could block usage</Badge>}
          {rule.emailNotification && <Badge variant="secondary">Email notification</Badge>}
          {!rule.blockUsage && !rule.emailNotification && <Badge variant="outline">Monitoring only</Badge>}
          {estimate.estimatedAtOrOverThreshold && (
            <p className="text-xs text-muted-foreground">Estimated spend at/over threshold</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
