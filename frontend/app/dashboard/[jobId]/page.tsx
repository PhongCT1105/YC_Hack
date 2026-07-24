'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkerPanel } from '@/components/WorkerPanel'
import {
  WorkspaceSidebar,
  type Workspace,
} from '@/components/workspace/WorkspaceSidebar'
import { PmChatPanel } from '@/components/workspace/PmChatPanel'
import { AgentChatPanel } from '@/components/AgentChatPanel'
import { adminHeaders } from '@/lib/workspaceClient'
import { dashboardWorkspaceHref } from '@/lib/dashboardNavigation'
import { MOCK_WORKERS } from '@/lib/mockWorkers'
import type { Worker } from '@/types'

const MOCK_WORKSPACE: Workspace = {
  id: 'mock-001',
  question: 'Build a secure, scalable authentication system for a multi-tenant SaaS app',
  stage: 'active',
  created_at: new Date().toISOString(),
  workerCount: 6,
  findingsCount: 3,
  subtasksDone: 2,
  subtasksTotal: 6,
}

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


function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (view: ViewMode) => void
}) {
  return (
    <div
      className="inline-flex items-center p-1 shadow-lg"
      style={{
        background: 'rgba(8,8,16,0.6)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
      }}
    >
      {([
        ['office', 'Office'],
        ['graph', 'Knowledge'],
        ['report', 'Report'],
      ] as [ViewMode, string][]).map(([value, label]) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98]"
          style={{
            background: view === value ? 'rgba(99,102,241,0.7)' : 'transparent',
            color: view === value ? 'white' : 'rgba(255,255,255,0.4)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
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
  const [agentChatOpen, setAgentChatOpen] = useState(false)
  const [useMock, setUseMock] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [generatedReport, setGeneratedReport] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const selectedWorkspace = useMemo(() => {
    if (useMock) return MOCK_WORKSPACE
    return workspaces.find((workspace) => workspace.id === params.jobId) ?? null
  }, [useMock, params.jobId, workspaces])

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
    if (useMock) {
      setWorkers(MOCK_WORKERS)
      return
    }

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
  }, [useMock, adminKey, selectedWorkspace])

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

  const officeIsWaiting =
    selectedWorkspace && workers.length === 0 && view === 'office'

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-gray-950 text-gray-200">
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <button
          aria-label="Close workspace navigation"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}

      {/* Glass workspace rail — floats over the canvas */}
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

      {/* Full-screen canvas section */}
      <section className="absolute inset-0">
        {/* Error toast */}
        {actionError && (
          <div className="absolute inset-x-3 top-3 z-30 mx-auto max-w-xl rounded-xl border border-red-900 bg-red-950 px-4 py-2 text-center text-xs text-red-200">
            {actionError}
          </div>
        )}

        {/* Mobile: open workspaces button */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white md:hidden"
          style={{
            background: 'rgba(8,8,16,0.6)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          ☰ Workspaces
        </button>

        {/* Floating view toggle — top center */}
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <ViewToggle view={view} onChange={setView} />
        </div>

        {/* Floating action bar — top right */}
        <div
          className="absolute right-3 top-3 z-20 flex items-center gap-1.5"
          style={{
            background: 'rgba(8,8,16,0.6)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '6px 8px',
          }}
        >
          <button
            onClick={() => { setPlannerOpen(false); setAgentChatOpen((v) => !v) }}
            title="Message the orchestrator agent"
            className="flex h-7 w-7 items-center justify-center rounded-xl text-base transition-colors"
            style={{ background: agentChatOpen ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)' }}
          >
            🤖
          </button>
          <button
            onClick={openPlanner}
            disabled={!selectedWorkspace || !adminKey}
            className="rounded-xl px-2.5 py-1 text-xs font-semibold text-indigo-200 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: plannerOpen ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            Planner
          </button>
          <button
            onClick={() => void handleSeed()}
            disabled={!selectedWorkspace || !adminKey || seeding}
            className="hidden rounded-xl px-2.5 py-1 text-xs font-semibold text-gray-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:block"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {seeding ? 'Adding...' : 'Add AI expert'}
          </button>
          <button
            onClick={() => void handleSynthesize()}
            disabled={!selectedWorkspace || !adminKey || synthesizing}
            className="hidden rounded-xl px-2.5 py-1 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:block"
            style={{
              background: 'rgba(99,102,241,0.6)',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
          >
            {synthesizing ? 'Writing...' : 'Synthesize'}
          </button>
        </div>

        {/* Main content */}
        {!useMock && adminKeyLoaded && !adminKey ? (
          <EmptyWorkspaceState
            hasAdminKey={false}
            onOpenWorkspaces={() => setMobileSidebarOpen(true)}
          />
        ) : !useMock && !selectedWorkspace ? (
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
          <div className="absolute inset-0">
            <OfficeScene
              workers={workers}
              selectedId={selectedWorker?.id ?? null}
              onSelect={selectWorker}
            />
          </div>
        ) : view === 'graph' && selectedWorkspace ? (
          <div className="absolute inset-0 pt-14">
            <KnowledgeGraph
              pollMs={3000}
              compact={false}
              sprintId={selectedWorkspace.id}
              adminKey={adminKey}
            />
          </div>
        ) : (
          <div className="absolute inset-0">
            <ReportView report={generatedReport} />
          </div>
        )}

        {/* Floating glass panels — right side */}
        {selectedWorker && view === 'office' && (
          <div className="fixed inset-0 z-50 md:absolute md:inset-auto md:bottom-0 md:right-0 md:top-0 md:w-80">
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

        <AgentChatPanel
          open={agentChatOpen}
          onClose={() => setAgentChatOpen(false)}
          sprintId={selectedWorkspace?.id ?? null}
          adminKey={adminKey}
        />

        {/* Mock mode toggle — bottom right */}
        <button
          onClick={() => setUseMock((v) => !v)}
          className="absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: useMock ? 'rgba(99,102,241,0.25)' : 'rgba(8,8,16,0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: useMock ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
            color: useMock ? 'rgba(165,180,252,1)' : 'rgba(255,255,255,0.3)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: useMock ? '#818CF8' : 'rgba(255,255,255,0.2)' }}
          />
          {useMock ? 'Mock on' : 'Mock'}
        </button>
      </section>
    </main>
  )
}
