import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { BarChart3, Building2, Info, Sparkles, Users, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import {
  ALL_WORKSPACES,
  DEFAULT_MONTH_COUNT,
  parseMonthCount,
  tabAfterWorkspaceSelection,
  tabForAccountOverview,
  type ObservatoryTab,
} from '../../shared/billing';
import type { WorkspaceSelection } from './types';

const OverviewPanel = lazy(() =>
  import('./components/OverviewPanel').then((module) => ({ default: module.OverviewPanel }))
);
const WorkspacePanel = lazy(() =>
  import('./components/WorkspacePanel').then((module) => ({ default: module.WorkspacePanel }))
);
const IdentityPanel = lazy(() =>
  import('./components/IdentityPanel').then((module) => ({ default: module.IdentityPanel }))
);
const PromotionWhatIfPanel = lazy(() =>
  import('./components/PromotionWhatIfPanel').then((module) => ({ default: module.PromotionWhatIfPanel }))
);

function PanelFallback() {
  return (
    <div className="space-y-6" aria-label="Loading panel">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export default function App() {
  const [monthCount, setMonthCount] = useState(DEFAULT_MONTH_COUNT);
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceSelection | null>(null);
  const [activeTab, setActiveTab] = useState<ObservatoryTab>('overview');

  const scopeId = selectedWorkspace?.id ?? ALL_WORKSPACES;
  const scopeLabel = selectedWorkspace ? `${selectedWorkspace.name} · ${selectedWorkspace.id}` : 'All workspaces';

  function selectWorkspace(workspace: WorkspaceSelection) {
    setSelectedWorkspace(workspace);
    setActiveTab(tabAfterWorkspaceSelection());
  }

  return (
    <div className="min-h-screen bg-muted/20 text-foreground">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary p-3 text-primary-foreground shadow-sm">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Genie Cost Observatory</h1>
                <Badge variant="secondary">Estimated list cost</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Account-wide Genie Agent and Genie Code usage, with workspace and identity drill-down.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reporting period</p>
              <Select value={monthCount.toString()} onValueChange={(value) => setMonthCount(parseMonthCount(value))}>
                <SelectTrigger className="w-full bg-background sm:w-44" aria-label="Reporting period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12, 18, 24].map((months) => (
                    <SelectItem key={months} value={months.toString()}>
                      Last {months} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace scope</p>
              <div className="flex min-h-9 max-w-xl items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{scopeLabel}</span>
                {selectedWorkspace && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 shrink-0 px-2"
                    onClick={() => {
                      setSelectedWorkspace(null);
                      setActiveTab(tabForAccountOverview());
                    }}
                    aria-label="Return to all workspaces"
                  >
                    <X className="h-3.5 w-3.5" /> All workspaces
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8">
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Values are estimated list cost from billed DBUs ×{' '}
            <code className="font-mono text-xs">pricing.effective_list.default</code>. They can differ from negotiated
            or invoiced amounts, and system billing data may lag recent activity. Every viewer sees the account-wide
            billing data available to the app service principal.
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ObservatoryTab)} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 bg-background p-1 shadow-sm sm:w-fit sm:grid-cols-4">
            <TabsTrigger value="overview" className="gap-2 px-4 py-2.5">
              <BarChart3 className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="gap-2 px-4 py-2.5">
              <Building2 className="h-4 w-4" /> Workspaces
            </TabsTrigger>
            <TabsTrigger value="identities" className="gap-2 px-4 py-2.5">
              <Users className="h-4 w-4" /> Identities
            </TabsTrigger>
            <TabsTrigger value="simulation" className="gap-2 px-4 py-2.5">
              <Sparkles className="h-4 w-4" /> Simulation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Suspense fallback={<PanelFallback />}>
              <OverviewPanel monthCount={monthCount} scopeId={scopeId} scopeLabel={scopeLabel} />
            </Suspense>
          </TabsContent>
          <TabsContent value="workspaces">
            <Suspense fallback={<PanelFallback />}>
              <WorkspacePanel
                monthCount={monthCount}
                selectedWorkspace={selectedWorkspace}
                onSelectWorkspace={selectWorkspace}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="identities">
            <Suspense fallback={<PanelFallback />}>
              <IdentityPanel
                selectedWorkspace={selectedWorkspace}
                monthCount={monthCount}
                onChooseWorkspace={() => setActiveTab('workspaces')}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="simulation">
            <Suspense fallback={<PanelFallback />}>
              <PromotionWhatIfPanel monthCount={monthCount} scopeId={scopeId} scopeLabel={scopeLabel} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
