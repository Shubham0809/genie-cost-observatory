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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { Bot, Building2, ChevronLeft, ChevronRight, Code2, Search, TriangleAlert } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  IDENTITY_PAGE_SIZE,
  IDENTITY_RESULT_LIMIT,
  NONE_WORKSPACE,
  currentMonthStart,
  paginateRows,
  parseMonthCount,
  parseMonthStart,
  parseSearchTerm,
  parseSelectedWorkspaceId,
  publicQueryError,
  recentMonthStarts,
  sortRows,
  type SortDirection,
} from '../../../shared/billing';
import { formatCurrency, formatMonth, formatNumber, formatOptionalNumber, toNumber } from '../lib/formatters';
import type { WorkspaceSelection } from '../types';
import { BudgetImpactPanel } from './BudgetImpactPanel';

interface IdentityPanelProps {
  selectedWorkspace: WorkspaceSelection | null;
  monthCount: number;
  onChooseWorkspace: () => void;
}

type IdentitySortKey =
  | 'run_as_identity'
  | 'product'
  | 'total_dbus'
  | 'free_dbus'
  | 'billed_dbus'
  | 'current_estimated_cost';

interface BudgetIdentitySelection {
  name: string;
  type: 'Identified user' | 'Service principal' | 'Unknown';
  workspaceId: string;
  usageMonth: string;
}

export function IdentityPanel({ selectedWorkspace, monthCount, onChooseWorkspace }: IdentityPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Free-tier coverage and billed overage</h2>
        <p className="text-sm text-muted-foreground">
          User and run-as identity detail for one selected workspace and calendar month.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>Genie Code</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Each identified user receives 150 free DBUs per calendar month. Remaining allowance is calculated from
              that user&apos;s account-wide Genie Code free usage for the month, not from one workspace. Usage beyond
              the allowance is billed.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
              <CardTitle>Genie Agents</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Identified-user usage is promotional/free through January 31, 2027. Service-principal usage is billed. The
              Genie Code 150-DBU allowance is not applied to Genie Agents.
            </p>
          </CardContent>
        </Card>
      </div>

      {!selectedWorkspace ? (
        <Empty className="rounded-xl border bg-card py-16">
          <EmptyHeader>
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <EmptyTitle>Select a workspace first</EmptyTitle>
            <EmptyDescription>
              Identity-level billing is scoped to one workspace so results stay complete and searchable.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onChooseWorkspace}>Choose workspace</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <IdentityTable key={selectedWorkspace.id} selectedWorkspace={selectedWorkspace} monthCount={monthCount} />
      )}
    </div>
  );
}

function IdentityTable({
  selectedWorkspace,
  monthCount,
}: {
  selectedWorkspace: WorkspaceSelection;
  monthCount: number;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<IdentitySortKey>('current_estimated_cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [budgetIdentity, setBudgetIdentity] = useState<BudgetIdentitySelection | null>(null);
  const monthOptions = useMemo(() => recentMonthStarts(parseMonthCount(monthCount)), [monthCount]);
  const [usageMonth, setUsageMonth] = useState(() => currentMonthStart());
  const safeMonth = parseMonthStart(usageMonth, currentMonthStart());
  const deferredSearch = useDeferredValue(parseSearchTerm(searchTerm));
  const workspaceId = useMemo(() => {
    try {
      return parseSelectedWorkspaceId(selectedWorkspace.id);
    } catch {
      return NONE_WORKSPACE;
    }
  }, [selectedWorkspace.id]);
  const parameters = useMemo(
    () => ({
      workspace_id: sql.string(workspaceId),
      identity_search: sql.string(deferredSearch),
      usage_month: sql.date(safeMonth),
    }),
    [deferredSearch, safeMonth, workspaceId]
  );
  const identities = useAnalyticsQuery('identity_coverage', parameters);
  const sorted = useMemo(
    () => sortRows(identities.data ?? [], sortKey, sortDirection),
    [identities.data, sortDirection, sortKey]
  );
  const paged = useMemo(() => paginateRows(sorted, page, IDENTITY_PAGE_SIZE), [page, sorted]);
  const matchingRows = toNumber(identities.data?.[0]?.matching_identity_product_rows);
  const activeBudgetIdentity =
    budgetIdentity?.workspaceId === workspaceId && budgetIdentity.usageMonth === safeMonth ? budgetIdentity : null;
  const budgetActionRows = useMemo(() => {
    const firstIndexByIdentity = new Map<string, number>();
    paged.rows.forEach((row, index) => {
      if (!firstIndexByIdentity.has(row.run_as_identity)) {
        firstIndexByIdentity.set(row.run_as_identity, index);
      }
    });
    return firstIndexByIdentity;
  }, [paged.rows]);

  function toggleSort(nextKey: IdentitySortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'run_as_identity' || nextKey === 'product' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>{selectedWorkspace.name}</CardTitle>
            <CardDescription>
              Workspace {selectedWorkspace.id} · {formatMonth(safeMonth)}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <Select
              value={safeMonth}
              onValueChange={(value) => {
                setUsageMonth(value);
                setBudgetIdentity(null);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-full bg-background sm:w-48" aria-label="Identity coverage month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((month) => (
                  <SelectItem key={month} value={month}>
                    {formatMonth(month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-80">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(0);
                }}
                placeholder="Search identity or type"
                className="pl-9"
                aria-label="Search identity or type"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {identities.loading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={`identity-skeleton-${index}`} className="h-14 w-full" />
            ))}
          </div>
        )}

        {identities.error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>User usage unavailable</AlertTitle>
            <AlertDescription>{publicQueryError(identities.error)}</AlertDescription>
          </Alert>
        )}

        {identities.data && identities.data.length === 0 && (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>No identity usage for this month</EmptyTitle>
              <EmptyDescription>Try another month, identity search, or workspace.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {activeBudgetIdentity && (
          <BudgetImpactPanel
            key={`${workspaceId}-${safeMonth}-${activeBudgetIdentity.name}`}
            identity={activeBudgetIdentity}
            workspaceId={workspaceId}
            usageMonth={safeMonth}
            onClose={() => setBudgetIdentity(null)}
          />
        )}

        {paged.rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing {paged.page * IDENTITY_PAGE_SIZE + 1}–
                {Math.min((paged.page + 1) * IDENTITY_PAGE_SIZE, paged.total)} of {paged.total} loaded rows
                {matchingRows > IDENTITY_RESULT_LIMIT
                  ? ` (${formatNumber(matchingRows, 0)} matched in billing; refine search to narrow)`
                  : ''}
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-[1400px]">
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Identity"
                      active={sortKey === 'run_as_identity'}
                      direction={sortDirection}
                      onClick={() => toggleSort('run_as_identity')}
                    />
                    <SortableHead
                      label="Product"
                      active={sortKey === 'product'}
                      direction={sortDirection}
                      onClick={() => toggleSort('product')}
                    />
                    <SortableHead
                      label="Total DBUs"
                      active={sortKey === 'total_dbus'}
                      direction={sortDirection}
                      className="text-right"
                      onClick={() => toggleSort('total_dbus')}
                    />
                    <SortableHead
                      label="Free DBUs"
                      active={sortKey === 'free_dbus'}
                      direction={sortDirection}
                      className="text-right"
                      onClick={() => toggleSort('free_dbus')}
                    />
                    <TableHead className="text-right">Tier limit</TableHead>
                    <TableHead className="text-right">Code remaining</TableHead>
                    <SortableHead
                      label="Billed DBUs"
                      active={sortKey === 'billed_dbus'}
                      direction={sortDirection}
                      className="text-right"
                      onClick={() => toggleSort('billed_dbus')}
                    />
                    <SortableHead
                      label="Est. list cost"
                      active={sortKey === 'current_estimated_cost'}
                      direction={sortDirection}
                      className="text-right"
                      onClick={() => toggleSort('current_estimated_cost')}
                    />
                    <TableHead className="text-right">After coverage</TableHead>
                    <TableHead>Coverage basis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((identity, index) => (
                    <TableRow key={`${identity.run_as_identity}-${identity.product}`}>
                      <TableCell>
                        <p className="max-w-72 truncate font-medium" title={identity.run_as_identity}>
                          {identity.run_as_identity}
                        </p>
                        <Badge
                          className="mt-1"
                          variant={identity.identity_type === 'Service principal' ? 'secondary' : 'outline'}
                        >
                          {identity.identity_type}
                        </Badge>
                        {budgetActionRows.get(identity.run_as_identity) === index && (
                          <Button
                            variant="link"
                            size="sm"
                            className="mt-1 h-auto px-0 text-xs"
                            onClick={() =>
                              setBudgetIdentity({
                                name: identity.run_as_identity,
                                type: budgetIdentityType(identity.identity_type),
                                workspaceId,
                                usageMonth: safeMonth,
                              })
                            }
                          >
                            Check budgets
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{identity.product}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(identity.total_dbus)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(identity.free_dbus)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatOptionalNumber(identity.free_tier_limit_dbus)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatOptionalNumber(identity.remaining_genie_code_allowance_dbus)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(identity.billed_dbus)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(identity.current_estimated_cost, identity.currency_code)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(identity.estimated_cost_after_free_coverage, identity.currency_code)}
                      </TableCell>
                      <TableCell className="max-w-80 text-sm text-muted-foreground">
                        {identity.coverage_basis}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {paged.pageCount > 1 && (
              <div className="flex items-center justify-end gap-2">
                <span className="mr-2 text-xs text-muted-foreground">
                  Page {paged.page + 1} of {paged.pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paged.page === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={paged.page >= paged.pageCount - 1}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function budgetIdentityType(value: string): BudgetIdentitySelection['type'] {
  if (value === 'Identified user' || value === 'Service principal') {
    return value;
  }
  return 'Unknown';
}

function SortableHead({
  label,
  active,
  direction,
  className,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  className?: string;
  onClick: () => void;
}) {
  return (
    <TableHead className={className}>
      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={onClick}>
        {label}
        {active && <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </TableHead>
  );
}
