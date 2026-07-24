'use client'

import dynamic from 'next/dynamic'
import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WorkerPanel } from '@/components/WorkerPanel'
import {
  WorkspaceSidebar,
  type Workspace,
} from '@/components/workspace/WorkspaceSidebar'
import { PmChatPanel } from '@/components/workspace/PmChatPanel'
import { adminHeaders } from '@/lib/workspaceClient'
import { dashboardWorkspaceHref } from '@/lib/dashboardNavigation'
import { MOCK_WORKERS } from '@/lib/mockWorkers'
import type { Worker } from '@/types'

type LinqMessage = {
  id: string
  is_from_me: boolean
  parts: { type: string; value?: string }[]
  sent_at?: string
  created_at?: string
}

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

const MOCK_REPORT = `# Research Synthesis Report

## Summary
Based on findings from 6 researchers working in parallel on authentication system design, we have sufficient evidence to recommend a modern JWT + refresh-token architecture with bcrypt password hashing and a multi-tenant UUID-based schema.

## Key Findings

- **JWT Authentication** (Alex K.): POST /auth/register and POST /auth/login implemented with bcrypt (12 rounds). Token refresh logic adds a buffer before expiry. [Source: internal implementation]

- **Database Schema** (Maya R.): Postgres schema finalised with users, sessions, and refresh_tokens tables using UUID v4 PKs and tenant_id FK on every table for strict multi-tenancy. [Source: migrations v1.0]

- **Test Coverage** (Sam T.): Unit test suite achieves 84% coverage using pytest-mock — no real DB required. Waiting on final code review. [Source: CI pipeline report]

- **Dashboard UI** (Jordan L.): Blocked pending API spec for the session history endpoint. Tailwind + shadcn/ui selected as design system.

- **CI/CD Pipeline** (Priya S.): GitHub Actions pipeline operational (lint → test → build). Deploy step to Fly.io in progress using FLY_API_TOKEN secret. [Source: GitHub Actions logs]

- **API Documentation** (Chris M.): OpenAPI 3.0 documentation pending completion of endpoint implementation.

## Points of Agreement

1. UUID v4 is the correct primary key choice for a multi-tenant system
2. bcrypt with 12 rounds balances security and performance appropriately
3. Test coverage target of >80% is achievable and already met
4. Fly.io is the deployment target with secrets managed in GitHub

## Contradictions & Open Questions

- **Jordan L. is blocked** — cannot proceed without the session history API spec. This creates a dependency chain: API implementation → UI → API docs. Both Jordan (dashboard) and Chris (docs) are downstream of Alex's endpoint work.
- CI/CD deploy step is functional but not verified end-to-end; confidence is medium until first successful production deploy.

## Confidence Notes

- **High confidence**: Schema design (Maya), auth endpoints (Alex), test coverage (Sam) — all evidence submitted and reviewed
- **Medium confidence**: CI/CD pipeline (Priya) — functional but deploy step unverified
- **Low confidence**: Dashboard (Jordan) and API docs (Chris) — both blocked on upstream work`

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
            background: view === value ? 'rgba(255,255,255,0.12)' : 'transparent',
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
        <p className="text-sm font-semibold text-white/60">
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
          className="mt-6 rounded-xl px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
          style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.12)' }}
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
        <p className="text-sm font-semibold text-white/60">
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
          <p className="mt-4 rounded-xl px-4 py-3 text-xs text-white/60" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
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

  const html = marked(report, { breaks: true }) as string

  return (
    <div className="h-full overflow-y-auto px-5 py-16 md:px-10 lg:px-16">
      <article className="mx-auto max-w-3xl">
        <p className="mb-6 text-xs font-semibold text-white/40">Synthesis report</p>
        <div
          className="prose-report"
          dangerouslySetInnerHTML={{ __html: html }}
        />
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
  const [managerMessages, setManagerMessages] = useState<LinqMessage[]>([])
  const [managerChatId, setManagerChatId] = useState<string | null>(null)
  const [managerInput, setManagerInput] = useState('')
  const [managerSending, setManagerSending] = useState(false)
  const managerEndRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!agentChatOpen) return
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/linq/manager-thread', { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        setManagerMessages(data.messages ?? [])
        if (data.chatId) setManagerChatId(data.chatId)
      } catch { /* non-fatal */ }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [agentChatOpen])

  useEffect(() => {
    managerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [managerMessages])

  async function handleManagerSend() {
    const content = managerInput.trim()
    if (!content || managerSending) return
    setManagerInput('')
    setManagerSending(true)
    try {
      const res = await fetch('/api/linq/manager-thread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, chatId: managerChatId }),
      })
      const data = await res.json()
      if (data.chatId) setManagerChatId(data.chatId)
    } catch { /* non-fatal */ } finally {
      setManagerSending(false)
    }
  }

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
    if (useMock) {
      setGeneratedReport(MOCK_REPORT)
      setView('report')
      return
    }
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

        {/* Floating action bar — top right (expands down for agent chat) */}
        <div
          className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden"
          style={{
            background: 'rgba(8,8,16,0.6)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: agentChatOpen ? 20 : 16,
            minWidth: agentChatOpen ? 320 : undefined,
            transition: 'border-radius 250ms, min-width 250ms',
          }}
        >
          {/* Buttons row */}
          <div className="flex items-center gap-1.5 p-2">
            <button
              onClick={() => { setPlannerOpen(false); setAgentChatOpen((v) => !v) }}
              title="Message the orchestrator agent"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-base transition-colors"
              style={{ background: agentChatOpen ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)' }}
            >
              🤖
            </button>
            <button
              onClick={openPlanner}
              disabled={!selectedWorkspace || !adminKey}
              className="rounded-xl px-2.5 py-1 text-xs font-semibold text-white/70 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: plannerOpen ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
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
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {synthesizing ? 'Writing...' : 'Synthesize'}
            </button>
          </div>

          {/* Linq chat — animates open/closed below the buttons */}
          <div
            style={{
              maxHeight: agentChatOpen ? '480px' : '0px',
              opacity: agentChatOpen ? 1 : 0,
              overflow: 'hidden',
              pointerEvents: agentChatOpen ? 'auto' : 'none',
              transition: 'max-height 380ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease',
              borderTop: agentChatOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-base">🤖</span>
              <div>
                <p className="text-xs font-semibold text-white">Orchestrator</p>
                <p className="text-[10px] text-white/30">+1 (205) 503-0476 · SMS</p>
              </div>
            </div>

            {/* Messages */}
            <div
              className="overflow-y-auto px-3 py-2 space-y-1.5"
              style={{ height: 300, borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              {managerMessages.length === 0 && (
                <p className="text-center text-[11px] text-white/20 pt-8">
                  No messages yet. Send one below.
                </p>
              )}
              {managerMessages.map((msg) => {
                // is_from_me = sent by the Linq account (orchestrator) → left side
                // !is_from_me = sent by the manager (us) → right side
                const isUs = !msg.is_from_me
                const text = msg.parts?.find((p) => p.type === 'text')?.value ?? ''
                return (
                  <div key={msg.id} className={`flex ${isUs ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[82%] px-3 py-2 text-xs leading-relaxed"
                      style={{
                        background: isUs ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
                        color: 'white',
                        borderRadius: isUs ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      }}
                    >
                      {text}
                    </div>
                  </div>
                )
              })}
              <div ref={managerEndRef} />
            </div>

            {/* Input */}
            <div
              className="flex items-center gap-2 px-2 py-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <input
                className="flex-1 rounded-full px-3 py-1.5 text-xs text-white focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                placeholder="Message the orchestrator..."
                value={managerInput}
                disabled={managerSending}
                onChange={(e) => setManagerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleManagerSend() }
                }}
              />
              <button
                onClick={() => void handleManagerSend()}
                disabled={!managerInput.trim() || managerSending}
                className="flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 transition-all disabled:opacity-25"
                style={{ background: managerInput.trim() && !managerSending ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              </button>
            </div>
          </div>
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

        {/* Mock mode toggle — bottom right */}
        <button
          onClick={() => setUseMock((v) => !v)}
          className="absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: useMock ? 'rgba(255,255,255,0.1)' : 'rgba(8,8,16,0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: useMock ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: useMock ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: useMock ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)' }}
          />
          {useMock ? 'Mock on' : 'Mock'}
        </button>
      </section>
    </main>
  )
}
