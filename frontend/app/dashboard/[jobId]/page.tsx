'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkerPanel } from '@/components/WorkerPanel'
import { STATUS_COLORS } from '@/components/three/Minion'
import {
  WorkspaceSidebar,
  type Workspace,
} from '@/components/workspace/WorkspaceSidebar'
import { PmChatPanel } from '@/components/workspace/PmChatPanel'
import { adminHeaders } from '@/lib/workspaceClient'
import { dashboardWorkspaceHref } from '@/lib/dashboardNavigation'
import type { Worker, WorkerStatus } from '@/types'

const OfficeScene = dynamic(() => import('@/components/three/OfficeScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-950">
      <p className="text-sm text-gray-500">Loading the live office...</p>
    </div>
  ),
})

const KnowledgeGraph = dynamic(
  () => import('@/components/graph/KnowledgeGraph'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-500">Loading the knowledge tree...</p>
      </div>
    ),
  }
)

type ViewMode = 'office' | 'graph' | 'report'

const STATUS_LABELS: Record<WorkerStatus, string> = {
  pending: 'Pending',
  'in-progress': 'Working',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}

const STAGE_LABELS: Record<string, string> = {
  planning: 'Planning',
  recruiting: 'Recruiting',
  active: 'Active',
  complete: 'Complete',
}

const STAGE_STYLES: Record<string, string> = {
  planning: 'border-gray-700 bg-gray-900 text-gray-300',
  recruiting: 'border-amber-800 bg-amber-950 text-amber-300',
  active: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  complete: 'border-indigo-800 bg-indigo-950 text-indigo-300',
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${
        STAGE_STYLES[stage] ?? STAGE_STYLES.planning
      }`}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (view: ViewMode) => void
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-800 bg-gray-950/95 p-1 shadow-lg">
      {([
        ['office', 'Office'],
        ['graph', 'Knowledge'],
        ['report', 'Report'],
      ] as [ViewMode, string][]).map(([value, label]) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] ${
            view === value
              ? 'bg-indigo-600 text-white'
              : 'text-gray-500 hover:bg-gray-900 hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TopBar({
  workspace,
  adminKey,
  onOpenWorkspaces,
  onOpenPlanner,
  onSeed,
  seeding,
  onSynthesize,
  synthesizing,
}: {
  workspace: Workspace | null
  adminKey: string | null
  onOpenWorkspaces: () => void
  onOpenPlanner: () => void
  onSeed: () => void
  seeding: boolean
  onSynthesize: () => void
  synthesizing: boolean
}) {
  const progress = workspace?.subtasksTotal
    ? Math.round((workspace.subtasksDone / workspace.subtasksTotal) * 100)
    : 0

  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-16 items-center border-b border-gray-800 bg-gray-950 px-3 md:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={onOpenWorkspaces}
          className="rounded-lg border border-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-900 md:hidden"
        >
          Workspaces
        </button>
        <div className="hidden h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white md:flex">
          M
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-500">Minion HQ</p>
          <p className="truncate text-sm font-semibold text-white">
            {workspace?.question ?? 'Research workspaces'}
          </p>
        </div>
        {workspace && <StageBadge stage={workspace.stage} />}
      </div>

      {workspace && (
        <div className="hidden items-center gap-5 px-5 lg:flex">
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-200">
              {workspace.subtasksDone}/{workspace.subtasksTotal}
            </p>
            <p className="text-[10px] text-gray-600">tasks complete</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-200">
              {workspace.workerCount}
            </p>
            <p className="text-[10px] text-gray-600">experts</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-200">{progress}%</p>
            <p className="text-[10px] text-gray-600">progress</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPlanner}
          disabled={!workspace || !adminKey}
          className="rounded-lg border border-indigo-700 bg-indigo-950 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Planner
        </button>
        <button
          onClick={onSeed}
          disabled={!workspace || !adminKey || seeding}
          className="hidden rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-40 sm:block"
        >
          {seeding ? 'Adding...' : 'Add AI expert'}
        </button>
        <button
          onClick={onSynthesize}
          disabled={!workspace || !adminKey || synthesizing}
          className="hidden rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 md:block"
        >
          {synthesizing ? 'Writing...' : 'Synthesize'}
        </button>
      </div>
    </header>
  )
}

function WorkerNavigator({
  workers,
  selectedId,
  onSelect,
}: {
  workers: Worker[]
  selectedId: string | null
  onSelect: (worker: Worker | null) => void
}) {
  return (
    <aside className="absolute inset-x-0 top-14 z-10 flex h-16 gap-2 overflow-x-auto border-b border-gray-800 bg-gray-950/95 px-3 py-2 md:inset-y-0 md:right-auto md:top-0 md:h-auto md:w-56 md:flex-col md:gap-0 md:overflow-y-auto md:border-b-0 md:border-r md:px-0 md:py-3">
      <p className="hidden px-4 pb-2 text-xs font-semibold text-gray-500 md:block">
        Experts ({workers.length})
      </p>
      {workers.map((worker) => (
        <button
          key={worker.id}
          onClick={() =>
            onSelect(selectedId === worker.id ? null : worker)
          }
          className={`min-w-44 rounded-lg px-3 py-2 text-left transition-colors md:w-full md:min-w-0 md:rounded-none md:px-4 md:py-2.5 ${
            selectedId === worker.id
              ? 'bg-gray-800'
              : 'bg-gray-900 hover:bg-gray-800 md:bg-transparent'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[worker.status] }}
            />
            <span className="truncate text-xs font-semibold text-white">
              {worker.name}
            </span>
          </div>
          <p className="mt-1 truncate pl-4 text-[10px] text-gray-500">
            {worker.subtaskTitle}
          </p>
        </button>
      ))}
    </aside>
  )
}

function WorkspaceHoldingState({
  workspace,
  onOpenPlanner,
}: {
  workspace: Workspace
  onOpenPlanner: () => void
}) {
  const copy =
    workspace.stage === 'planning'
      ? 'Plan the expert count, review the quote, and confirm launch with the planning agent.'
      : 'Recruitment is live. Experts will appear here as they accept the Terac task.'

  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold text-indigo-300">
          {workspace.stage === 'planning'
            ? 'Ready to plan'
            : 'Recruiting experts'}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Your live office is waiting
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-400">
          {copy}
        </p>
        <button
          onClick={onOpenPlanner}
          className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98]"
        >
          Open planning agent
        </button>
      </div>
    </div>
  )
}

function EmptyWorkspaceState({
  hasAdminKey,
  onOpenWorkspaces,
}: {
  hasAdminKey: boolean
  onOpenWorkspaces: () => void
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <p className="text-sm font-semibold text-indigo-300">
          Start a research workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          One question, coordinated experts
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-400">
          Create a question in the workspace rail. The planning agent will split
          the work, quote recruitment, and launch after you confirm.
        </p>
        {!hasAdminKey && (
          <p className="mt-4 rounded-xl border border-amber-900 bg-amber-950/50 px-4 py-3 text-xs text-amber-200">
            Add your admin key to the dashboard URL to create and manage
            workspaces.
          </p>
        )}
        <button
          onClick={onOpenWorkspaces}
          className="mt-6 rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-900 md:hidden"
        >
          Open workspaces
        </button>
      </div>
    </div>
  )
}

function ReportView({ report }: { report: string | null }) {
  if (!report) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <h2 className="text-xl font-semibold text-white">No report yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
            Once experts submit findings, use Synthesize to turn the knowledge
            tree into a decision-ready report.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-20 md:px-10 lg:px-16">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold text-indigo-300">Synthesis report</p>
        <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-7 text-gray-200">
          {report}
        </pre>
      </article>
    </div>
  )
}

export default function DashboardPage({
  params,
}: {
  params: { jobId: string }
}) {
  const router = useRouter()
  const [adminKey, setAdminKey] = useState<string | null>(null)
  const [adminKeyLoaded, setAdminKeyLoaded] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [view, setView] = useState<ViewMode>('office')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [generatedReport, setGeneratedReport] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === params.jobId) ?? null,
    [params.jobId, workspaces]
  )

  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    setAdminKey(search.get('key'))
    setAdminKeyLoaded(true)
  }, [])

  useEffect(() => {
    if (!adminKey || !workspacesLoaded || selectedWorkspace) return
    if (workspaces.length > 0) {
      router.replace(dashboardWorkspaceHref(workspaces[0].id, adminKey))
    }
  }, [
    adminKey,
    router,
    selectedWorkspace,
    workspaces,
    workspacesLoaded,
  ])

  useEffect(() => {
    setGeneratedReport(selectedWorkspace?.report_md ?? null)
    setSelectedWorker(null)
    setPlannerOpen(false)
    setView('office')
  }, [selectedWorkspace?.id, selectedWorkspace?.report_md])

  useEffect(() => {
    if (!adminKey || !selectedWorkspace) {
      setWorkers([])
      return
    }

    const sprintId = selectedWorkspace.id
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch(
          `/api/workers?sprintId=${encodeURIComponent(sprintId)}`,
          {
            cache: 'no-store',
            headers: adminHeaders(adminKey),
          }
        )
        if (!res.ok || cancelled) return
        const fresh: Worker[] = await res.json()
        if (cancelled) return
        setWorkers(fresh)
        setSelectedWorker((previous) =>
          previous
            ? fresh.find((worker) => worker.id === previous.id) ?? previous
            : previous
        )
      } catch {
        // The next poll retries transient errors.
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [adminKey, selectedWorkspace])

  function selectWorkspace(id: string) {
    router.push(dashboardWorkspaceHref(id, adminKey))
  }

  function openPlanner() {
    setSelectedWorker(null)
    setPlannerOpen(true)
  }

  function selectWorker(worker: Worker | null) {
    setPlannerOpen(false)
    setSelectedWorker(worker)
  }

  async function handleSeed() {
    if (!adminKey || !selectedWorkspace) return
    setActionError(null)
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(adminKey),
        },
        body: JSON.stringify({ sprintId: selectedWorkspace.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data.error ?? `Could not add an AI expert (${res.status})`)
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not add an AI expert'
      )
    } finally {
      setSeeding(false)
    }
  }

  async function handleSynthesize() {
    if (!adminKey || !selectedWorkspace) return
    setActionError(null)
    setSynthesizing(true)
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(adminKey),
        },
        body: JSON.stringify({ sprintId: selectedWorkspace.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(data.error ?? `Could not synthesize (${res.status})`)
      } else if (data.report) {
        setGeneratedReport(data.report)
        setView('report')
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not synthesize'
      )
    } finally {
      setSynthesizing(false)
    }
  }

  const mainOffset = sidebarCollapsed ? 'md:left-12' : 'md:left-64'
  const officeIsWaiting =
    selectedWorkspace && workers.length === 0 && view === 'office'

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-gray-950 text-gray-200">
      <TopBar
        workspace={selectedWorkspace}
        adminKey={adminKey}
        onOpenWorkspaces={() => setMobileSidebarOpen(true)}
        onOpenPlanner={openPlanner}
        onSeed={() => void handleSeed()}
        seeding={seeding}
        onSynthesize={() => void handleSynthesize()}
        synthesizing={synthesizing}
      />

      {mobileSidebarOpen && (
        <button
          aria-label="Close workspace navigation"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}

      <WorkspaceSidebar
        selectedId={selectedWorkspace?.id ?? null}
        onSelect={selectWorkspace}
        adminKey={adminKey}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        onWorkspacesChange={(next) => {
          setWorkspaces(next)
          setWorkspacesLoaded(true)
        }}
        onCreated={(workspace) => {
          setWorkspaces((current) => [
            workspace,
            ...current.filter((item) => item.id !== workspace.id),
          ])
          setPlannerOpen(true)
        }}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <section
        className={`absolute inset-x-0 bottom-0 top-16 transition-[left] duration-200 md:right-0 ${mainOffset}`}
      >
        {actionError && (
          <div className="absolute inset-x-3 top-3 z-30 mx-auto max-w-xl rounded-xl border border-red-900 bg-red-950 px-4 py-2 text-center text-xs text-red-200">
            {actionError}
          </div>
        )}

        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <ViewToggle view={view} onChange={setView} />
        </div>

        {adminKeyLoaded && !adminKey ? (
          <EmptyWorkspaceState
            hasAdminKey={false}
            onOpenWorkspaces={() => setMobileSidebarOpen(true)}
          />
        ) : !selectedWorkspace ? (
          <EmptyWorkspaceState
            hasAdminKey={Boolean(adminKey)}
            onOpenWorkspaces={() => setMobileSidebarOpen(true)}
          />
        ) : officeIsWaiting ? (
          <WorkspaceHoldingState
            workspace={selectedWorkspace}
            onOpenPlanner={openPlanner}
          />
        ) : view === 'office' ? (
          <>
            <WorkerNavigator
              workers={workers}
              selectedId={selectedWorker?.id ?? null}
              onSelect={selectWorker}
            />
            <div
              className={`absolute inset-x-0 bottom-0 top-[7.5rem] md:inset-y-0 md:left-56 md:top-0 ${
                plannerOpen ? 'lg:right-[380px]' : 'right-0'
              } ${selectedWorker ? 'md:right-80' : ''}`}
            >
              <OfficeScene
                workers={workers}
                selectedId={selectedWorker?.id ?? null}
                onSelect={selectWorker}
              />
            </div>
          </>
        ) : view === 'graph' ? (
          <div
            className={`absolute inset-0 pt-14 ${
              plannerOpen ? 'lg:right-[380px]' : ''
            }`}
          >
            <KnowledgeGraph
              pollMs={3000}
              compact={false}
              sprintId={selectedWorkspace.id}
              adminKey={adminKey}
            />
          </div>
        ) : (
          <div
            className={`absolute inset-0 ${
              plannerOpen ? 'lg:right-[380px]' : ''
            }`}
          >
            <ReportView report={generatedReport} />
          </div>
        )}

        {selectedWorker && view === 'office' && (
          <div className="fixed inset-0 z-50 md:absolute md:left-auto md:right-0 md:top-0 md:h-full md:w-80">
            <WorkerPanel
              worker={selectedWorker}
              onClose={() => setSelectedWorker(null)}
              adminKey={adminKey ?? undefined}
            />
          </div>
        )}

        <PmChatPanel
          sprintId={selectedWorkspace?.id ?? null}
          question={selectedWorkspace?.question ?? null}
          adminKey={adminKey}
          open={plannerOpen}
          onClose={() => setPlannerOpen(false)}
        />
      </section>
    </main>
  )
}
