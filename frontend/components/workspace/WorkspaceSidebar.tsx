'use client'

import { useEffect, useRef, useState } from 'react'
import { adminHeaders } from '@/lib/workspaceClient'

export type WorkspaceStage = 'planning' | 'recruiting' | 'active' | 'complete'

export type Workspace = {
  id: string
  question: string
  stage: WorkspaceStage
  num_workers?: number | null
  cost_cents?: number | null
  report_md?: string | null
  created_at: string
  workerCount: number
  findingsCount: number
  subtasksDone: number
  subtasksTotal: number
}

const STAGE_STYLES: Record<WorkspaceStage, string> = {
  planning: 'bg-gray-800 text-gray-400',
  recruiting: 'bg-amber-950 text-amber-400',
  active: 'bg-green-950 text-green-400',
  complete: 'bg-blue-950 text-blue-400',
}

const STAGE_LABELS: Record<WorkspaceStage, string> = {
  planning: 'Planning',
  recruiting: 'Recruiting',
  active: 'Active',
  complete: 'Complete',
}

function StageBadge({ stage }: { stage: WorkspaceStage }) {
  const style = STAGE_STYLES[stage] ?? STAGE_STYLES.planning
  const label = STAGE_LABELS[stage] ?? stage
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  )
}

export function WorkspaceSidebar({
  selectedId,
  onSelect,
  adminKey,
  collapsed,
  onToggleCollapse,
  onWorkspacesChange,
  onCreated,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
  adminKey: string | null
  collapsed: boolean
  onToggleCollapse: () => void
  onWorkspacesChange?: (workspaces: Workspace[]) => void
  onCreated?: (workspace: Workspace) => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const onChangeRef = useRef(onWorkspacesChange)
  const consecutiveFailuresRef = useRef(0)
  onChangeRef.current = onWorkspacesChange

  useEffect(() => {
    if (!adminKey) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/workspaces', {
          cache: 'no-store',
          headers: adminHeaders(adminKey),
        })
        if (!res.ok) {
          consecutiveFailuresRef.current += 1
          if (!cancelled && consecutiveFailuresRef.current >= 3) {
            setUnavailable(true)
          }
          return
        }
        const data: Workspace[] = await res.json()
        if (cancelled) return
        consecutiveFailuresRef.current = 0
        setWorkspaces(data)
        setUnavailable(false)
        setLoaded(true)
        onChangeRef.current?.(data)
      } catch {
        consecutiveFailuresRef.current += 1
        if (!cancelled && consecutiveFailuresRef.current >= 3) {
          setUnavailable(true)
        }
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [adminKey])

  async function handleCreate() {
    const trimmed = question.trim()
    if (!trimmed || !adminKey) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(adminKey),
        },
        body: JSON.stringify({ question: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(data.error ?? `create failed (${res.status})`)
        return
      }
      const sprint = data.sprint
      const subtasks = data.subtasks ?? []
      if (sprint) {
        const newWorkspace: Workspace = {
          id: sprint.id,
          question: sprint.question,
          stage: sprint.stage ?? 'planning',
          num_workers: sprint.num_workers ?? null,
          cost_cents: sprint.cost_cents ?? null,
          created_at: sprint.created_at,
          workerCount: 0,
          findingsCount: 0,
          subtasksDone: 0,
          subtasksTotal: subtasks.length,
        }
        setWorkspaces((prev) => [newWorkspace, ...prev])
        onSelect(sprint.id)
        onCreated?.(newWorkspace)
      }
      setQuestion('')
      setShowCreate(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setCreating(false)
    }
  }

  if (collapsed && !mobileOpen) {
    return (
      <div className="absolute left-0 top-16 bottom-0 w-12 z-20 bg-gray-950/95 border-r border-gray-800 hidden md:flex flex-col items-center py-3 transition-[width] duration-200">
        <button
          onClick={onToggleCollapse}
          className="text-gray-500 hover:text-white text-sm p-1.5 rounded hover:bg-gray-900"
          aria-label="Expand workspace sidebar"
          title="Expand"
        >
          ▶
        </button>
      </div>
    )
  }

  return (
    <aside
      className={`fixed md:absolute left-0 top-0 md:top-16 bottom-0 w-[min(20rem,88vw)] md:w-64 z-40 bg-gray-950/98 border-r border-gray-800 flex flex-col transition-transform duration-200 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800">
        <div>
          <p className="text-sm font-semibold text-white">Workspaces</p>
          <p className="text-[11px] text-gray-500">Research operations</p>
        </div>
        <button
          onClick={onCloseMobile}
          className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-900"
          aria-label="Close workspace navigation"
        >
          Close
        </button>
        <button
          onClick={onToggleCollapse}
          className="hidden md:block text-gray-500 hover:text-white text-sm p-1 rounded hover:bg-gray-900"
          aria-label="Collapse workspace sidebar"
          title="Collapse"
        >
          ◀
        </button>
      </div>

      <div className="px-3 py-2.5 border-b border-gray-800">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            disabled={!adminKey}
            title={!adminKey ? 'append ?key=ADMIN_KEY to the URL' : undefined}
            className="w-full text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
          >
            + New question
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should the research sprint investigate?"
              disabled={creating}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none disabled:opacity-50"
            />
            {creating ? (
              <div className="flex items-center gap-2 text-xs text-indigo-300 px-1 py-1.5">
                <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                agent is decomposing…
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!question.trim() || !adminKey}
                  className="flex-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false)
                    setCreateError(null)
                    setQuestion('')
                  }}
                  className="text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            {createError && (
              <p className="text-[10px] text-red-400 truncate" title={createError}>
                {createError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {unavailable && (
          <p className="text-xs text-red-400 px-4 py-3">Workspaces unavailable</p>
        )}
        {!unavailable && !loaded && (
          <p className="text-xs text-gray-600 px-4 py-3">Workspaces loading…</p>
        )}
        {loaded && workspaces.length === 0 && (
          <p className="text-xs text-gray-600 px-4 py-3">No workspaces yet.</p>
        )}
        {workspaces.map((w) => {
          const isSelected = w.id === selectedId
          const costLabel =
            w.cost_cents != null && w.num_workers != null
              ? `$${(w.cost_cents / 100).toFixed(2)} · ${w.num_workers} ${w.num_workers === 1 ? 'person' : 'people'}`
              : null
          return (
            <button
              key={w.id}
              onClick={() => {
                onSelect(w.id)
                onCloseMobile?.()
              }}
              className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                isSelected
                  ? 'bg-gray-800 border-indigo-500'
                  : 'border-transparent hover:bg-gray-900'
              }`}
            >
              <p className="text-xs font-medium text-white leading-snug line-clamp-2 mb-1.5">
                {w.question}
              </p>
              <div className="flex items-center gap-2 mb-1">
                <StageBadge stage={w.stage} />
              </div>
              <p className="text-[10px] text-gray-500">
                {w.workerCount} workers · {w.findingsCount} findings · {w.subtasksDone}/{w.subtasksTotal} tasks
              </p>
              {costLabel && <p className="text-[10px] text-gray-600 mt-0.5">{costLabel}</p>}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
