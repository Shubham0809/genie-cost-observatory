import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  BarChart,
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
  Input,
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
import { ArrowRight, ChevronLeft, ChevronRight, Search, TriangleAlert } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  WORKSPACE_CHART_LIMIT,
  WORKSPACE_PAGE_SIZE,
  WORKSPACE_RESULT_LIMIT,
  isMissingWorkspaceMetadataError,
  paginateRows,
  parseMonthCount,
  parseSearchTerm,
  publicQueryError,
  searchRows,
  sortRows,
  type SortDirection,
} from '../../../shared/billing';
import { formatCompactNumber, formatCurrency, formatNumber, toNumber } from '../lib/formatters';
import { resolveWorkspace, workspaceNameMap } from '../lib/workspace-names';
import type { WorkspaceSelection } from '../types';

interface WorkspacePanelProps {
  monthCount: number;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectWorkspace: (workspace: WorkspaceSelection) => void;
}

type WorkspaceSortKey = 'estimated_list_cost' | 'total_dbus' | 'workspace_name' | 'workspace_id';

interface RankedWorkspace {
  workspace_id: string;
  workspace_name: string;
  workspace_label: string;
  total_dbus: number;
  free_dbus: number;
  billed_dbus: number;
  genie_agent_cost: number;
  genie_code_cost: number;
  estimated_list_cost: number;
  currency_code: string | null;
}

export function WorkspacePanel({ monthCount, selectedWorkspace, onSelectWorkspace }: WorkspacePanelProps) {
  const workspaceNamesQuery = useAnalyticsQuery('workspace_names');
  const workspaceNames = useMemo(() => workspaceNameMap(workspaceNamesQuery.data), [workspaceNamesQuery.data]);
  const namesUnavailable = Boolean(workspaceNamesQuery.error);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<WorkspaceSortKey>('estimated_list_cost');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(parseSearchTerm(searchTerm));
  const safeMonthCount = parseMonthCount(monthCount);
  const rankingSearch = /^\d+$/.test(deferredSearch) ? deferredSearch : '';
  const rankingParameters = useMemo(
    () => ({ month_count: sql.int(safeMonthCount), search_term: sql.string(rankingSearch) }),
    [rankingSearch, safeMonthCount]
  );
  const ranking = useAnalyticsQuery('workspace_ranking', rankingParameters);

  const labeled = useMemo<RankedWorkspace[]>(
    () =>
      (ranking.data ?? []).map((row) => {
        const resolved = resolveWorkspace(row.workspace_id, workspaceNames);
        return {
          workspace_id: row.workspace_id,
          workspace_name: resolved.name,
          workspace_label: resolved.label,
          total_dbus: toNumber(row.total_dbus),
          free_dbus: toNumber(row.free_dbus),
          billed_dbus: toNumber(row.billed_dbus),
          genie_agent_cost: toNumber(row.genie_agent_cost),
          genie_code_cost: toNumber(row.genie_code_cost),
          estimated_list_cost: toNumber(row.estimated_list_cost),
          currency_code: row.currency_code,
        };
      }),
    [ranking.data, workspaceNames]
  );

  const filtered = useMemo(
    () => searchRows(labeled, deferredSearch, ['workspace_name', 'workspace_id', 'workspace_label']),
    [deferredSearch, labeled]
  );
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDirection), [filtered, sortDirection, sortKey]);
  const paged = useMemo(() => paginateRows(sorted, page, WORKSPACE_PAGE_SIZE), [page, sorted]);
  const chartData = useMemo(() => sorted.slice(0, WORKSPACE_CHART_LIMIT), [sorted]);
  const matchingCount = toNumber(ranking.data?.[0]?.matching_workspace_count);
  const truncated = matchingCount > WORKSPACE_RESULT_LIMIT;

  function toggleSort(nextKey: WorkspaceSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'workspace_name' || nextKey === 'workspace_id' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  function selectWorkspace(workspace: RankedWorkspace) {
    onSelectWorkspace({ id: workspace.workspace_id, name: workspace.workspace_name });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Workspace comparison</h2>
        <p className="text-sm text-muted-foreground">
          Rank, search, and select any workspace with Genie usage. Identity detail stays one click away.
        </p>
      </div>

      {namesUnavailable && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Workspace names unavailable</AlertTitle>
          <AlertDescription>
            {isMissingWorkspaceMetadataError(workspaceNamesQuery.error)
              ? 'Workspaces are labeled by ID. Cost data is unchanged.'
              : publicQueryError(workspaceNamesQuery.error, 'Workspaces are labeled by ID.')}
          </AlertDescription>
        </Alert>
      )}

      {ranking.error && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Workspace ranking unavailable</AlertTitle>
          <AlertDescription>{publicQueryError(ranking.error)}</AlertDescription>
        </Alert>
      )}

      {truncated && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Showing the highest-cost {WORKSPACE_RESULT_LIMIT} workspaces</AlertTitle>
          <AlertDescription>
            {formatNumber(matchingCount, 0)} workspaces have Genie usage in this period. Search by numeric workspace ID
            to find workspaces outside the top {WORKSPACE_RESULT_LIMIT}.
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-sm">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Workspaces by estimated list cost</CardTitle>
            <CardDescription>
              Last {safeMonthCount} months. Chart shows the current top {WORKSPACE_CHART_LIMIT}.
            </CardDescription>
          </div>
          <div className="relative w-full lg:w-96">
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
              placeholder="Search name or workspace ID"
              className="pl-9"
              aria-label="Search name or workspace ID"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {ranking.loading && <Skeleton className="h-[440px] w-full" />}
          {!ranking.loading && labeled.length === 0 && (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>No workspace usage found</EmptyTitle>
                <EmptyDescription>No Genie billing records exist for this period.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {!ranking.loading && labeled.length > 0 && filtered.length === 0 && (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle>No matching workspaces</EmptyTitle>
                <EmptyDescription>Try a different name or numeric workspace ID.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {chartData.length > 0 && (
            <BarChart
              data={chartData.map((workspace) => ({
                workspace_label: workspace.workspace_label,
                genie_agent_cost: workspace.genie_agent_cost,
                genie_code_cost: workspace.genie_code_cost,
              }))}
              xKey="workspace_label"
              yKey={['genie_agent_cost', 'genie_code_cost']}
              orientation="horizontal"
              stacked
              showLegend
              colorPalette="categorical"
              height={Math.min(520, 72 + chartData.length * 36)}
              ariaLabel="Top workspaces by Genie estimated list cost"
              valueFormatter={(value) => formatCompactNumber(value)}
              onDataClick={(datum) => {
                const match = sorted.find((workspace) => workspace.workspace_label === datum.name);
                if (match) {
                  selectWorkspace(match);
                }
              }}
              selected={selectedWorkspace ? resolveWorkspace(selectedWorkspace.id, workspaceNames).label : undefined}
            />
          )}
          {paged.rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {paged.page * WORKSPACE_PAGE_SIZE + 1}–
                  {Math.min((paged.page + 1) * WORKSPACE_PAGE_SIZE, paged.total)} of {paged.total} workspaces
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Workspace"
                        active={sortKey === 'workspace_name'}
                        direction={sortDirection}
                        onClick={() => toggleSort('workspace_name')}
                      />
                      <SortableHead
                        label="Total DBUs"
                        active={sortKey === 'total_dbus'}
                        direction={sortDirection}
                        className="text-right"
                        onClick={() => toggleSort('total_dbus')}
                      />
                      <SortableHead
                        label="Est. list cost"
                        active={sortKey === 'estimated_list_cost'}
                        direction={sortDirection}
                        className="text-right"
                        onClick={() => toggleSort('estimated_list_cost')}
                      />
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.rows.map((workspace) => {
                      const selected = selectedWorkspace?.id === workspace.workspace_id;
                      return (
                        <TableRow key={workspace.workspace_id} data-state={selected ? 'selected' : undefined}>
                          <TableCell>
                            <p className="font-medium">{workspace.workspace_name}</p>
                            <p className="text-xs text-muted-foreground">{workspace.workspace_id}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(workspace.total_dbus)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(workspace.estimated_list_cost, workspace.currency_code)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant={selected ? 'secondary' : 'ghost'}
                              size="sm"
                              onClick={() => selectWorkspace(workspace)}
                              aria-label={`View identities for ${workspace.workspace_name}`}
                            >
                              {selected ? (
                                <Badge>Selected</Badge>
                              ) : (
                                <>
                                  Identities <ArrowRight className="h-4 w-4" />
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
    </div>
  );
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
