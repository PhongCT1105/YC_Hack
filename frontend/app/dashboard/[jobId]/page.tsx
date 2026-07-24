'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { WorkerPanel } from '@/components/WorkerPanel'
import { STATUS_COLORS } from '@/components/three/Minion'
import type { Worker, WorkerStatus } from '@/types'

// R3F canvas must be client-only (no SSR)
const OfficeScene = dynamic(() => import('@/components/three/OfficeScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-bounce">🏢</div>
        <p className="text-gray-400 text-sm">Loading office...</p>
      </div>
    </div>
  ),
})

// React Flow also needs to be client-only (no SSR)
const KnowledgeGraph = dynamic(() => import('@/components/graph/KnowledgeGraph'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-bounce">🕸️</div>
        <p className="text-gray-400 text-sm">Loading graph...</p>
      </div>
    </div>
  ),
})

type ViewMode = 'office' | 'graph'

const STATUS_LABELS: Record<WorkerStatus, string> = {
  pending: 'Pending',
  'in-progress': 'Working',
  review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-gray-900 border border-gray-700 rounded-full p-0.5 text-xs">
      {(['office', 'graph'] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 rounded-full capitalize transition-colors ${
            view === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function TopBar({
  workers,
  jobId,
  view,
  onViewChange,
  onSeed,
  seeding,
  onSynthesize,
  synthesizing,
  actionError,
  adminKey,
}: {
  workers: Worker[]
  jobId: string
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  onSeed: () => void
  seeding: boolean
  onSynthesize: () => void
  synthesizing: boolean
  actionError: string | null
  adminKey: string | null
}) {
  const total = workers.length
  const done = workers.filter((w) => w.status === 'done').length
  const blocked = workers.filter((w) => w.status === 'blocked').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-3 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
      {/* Left: job info */}
      <div className="flex items-center gap-4">
        <span className="text-lg font-bold text-white tracking-tight">Minion HQ</span>
        <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full">
          {jobId}
        </span>
        <ViewToggle view={view} onChange={onViewChange} />
      </div>

      {/* Center: progress */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">
          {done}/{total} done
        </span>
        <div className="w-40 bg-gray-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">{pct}%</span>
        {blocked > 0 && (
          <span className="text-xs font-semibold text-red-400 bg-red-950 px-2 py-0.5 rounded-full">
            {blocked} blocked
          </span>
        )}
      </div>

      {/* Right: legend + actions */}
      <div className="flex items-center gap-3">
        {(Object.entries(STATUS_LABELS) as [WorkerStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        <button
          onClick={onSeed}
          disabled={seeding || !adminKey}
          title={!adminKey ? 'append ?key=ADMIN_KEY to the URL' : undefined}
          className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors"
        >
          {seeding ? 'Seeding…' : '+ AI stand-in'}
        </button>
        <button
          onClick={onSynthesize}
          disabled={synthesizing || !adminKey}
          title={!adminKey ? 'append ?key=ADMIN_KEY to the URL' : undefined}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded-full transition-colors"
        >
          {synthesizing ? 'Synthesizing…' : 'Synthesize'}
        </button>
        {actionError && (
          <span className="text-xs font-medium text-red-400 max-w-[240px] truncate" title={actionError}>
            {actionError}
          </span>
        )}
      </div>
    </div>
  )
}

function ReportModal({ report, onClose }: { report: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-8">
      <div className="w-full max-w-3xl max-h-full flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">Synthesis Report</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-xs text-gray-200 font-sans leading-relaxed">
            {report}
          </pre>
        </div>
      </div>
    </div>
  )
}

function WorkerListSidebar({
  workers,
  selectedId,
  onSelect,
}: {
  workers: Worker[]
  selectedId: string | null
  onSelect: (w: Worker | null) => void
}) {
  return (
    <div className="absolute left-0 top-12 bottom-0 w-52 z-10 overflow-y-auto bg-gray-950/80 backdrop-blur-sm border-r border-gray-800 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 px-4 mb-3">
        Workers ({workers.length})
      </p>
      {workers.map((w) => (
        <button
          key={w.id}
          onClick={() => onSelect(selectedId === w.id ? null : w)}
          className={`
            w-full text-left px-4 py-2.5 transition-colors
            ${selectedId === w.id ? 'bg-gray-800' : 'hover:bg-gray-900'}
          `}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: STATUS_COLORS[w.status] }}
            />
            <span className="text-xs font-semibold text-white truncate">{w.name}</span>
          </div>
          <p className="text-[11px] text-gray-500 leading-snug pl-3.5 truncate">
            {w.subtaskTitle}
          </p>
          <p className="text-[10px] text-gray-600 pl-3.5 mt-0.5">{w.lastUpdated}</p>
        </button>
      ))}
    </div>
  )
}

export default function DashboardPage({ params }: { params: { jobId: string } }) {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [view, setView] = useState<ViewMode>('office')
  const [seeding, setSeeding] = useState(false)
  const [synthesizing, setSynthesizing] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [adminKey, setAdminKey] = useState<string | null>(null)

  // Read the admin key from the URL query string on mount. Using
  // window.location.search in an effect (rather than useSearchParams)
  // avoids the Suspense/prerender requirement for client components.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setAdminKey(params.get('key'))
  }, [])

  // Poll the live workers feed every 3s. Keeps the selected worker's panel
  // in sync by re-pointing it at the fresh object with the same id.
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/workers')
        if (!res.ok || cancelled) return
        const fresh: Worker[] = await res.json()
        if (cancelled) return
        setWorkers(fresh)
        setSelectedWorker((prev) => (prev ? fresh.find((w) => w.id === prev.id) ?? prev : prev))
      } catch {
        // transient network/API hiccup — next poll will retry
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleSelect = (worker: Worker | null) => {
    setSelectedWorker(worker)
  }

  const handleSeed = async () => {
    if (!adminKey) return
    setActionError(null)
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', { method: 'POST', headers: { 'x-admin-key': adminKey } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setActionError(data.error ?? `seed failed (${res.status})`)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'seed failed')
    } finally {
      setSeeding(false)
    }
  }

  const handleSynthesize = async () => {
    if (!adminKey) return
    setActionError(null)
    setSynthesizing(true)
    try {
      const res = await fetch('/api/synthesize', { method: 'POST', headers: { 'x-admin-key': adminKey } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setActionError(data.error ?? `synthesize failed (${res.status})`)
      else if (data.report) setReport(data.report)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'synthesize failed')
    } finally {
      setSynthesizing(false)
    }
  }

  const recruiting = workers.length === 0

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-gray-950">
      {/* Top navigation bar */}
      <TopBar
        workers={workers}
        jobId={params.jobId}
        view={view}
        onViewChange={setView}
        onSeed={handleSeed}
        seeding={seeding}
        onSynthesize={handleSynthesize}
        synthesizing={synthesizing}
        actionError={actionError}
        adminKey={adminKey}
      />

      {/* Worker list sidebar (left) — only meaningful for the office view */}
      {!recruiting && view === 'office' && (
        <WorkerListSidebar
          workers={workers}
          selectedId={selectedWorker?.id ?? null}
          onSelect={handleSelect}
        />
      )}

      {recruiting ? (
        /* Recruiting overlay — no researchers have joined the sprint yet */
        <div className="absolute inset-0 pt-12 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">🧑‍💼</div>
            <p className="text-gray-400 text-sm">Recruiting… no researchers have arrived yet</p>
          </div>
        </div>
      ) : (
        <>
          {/* Main viewport — 3D Office Scene or Live Knowledge Graph, full screen behind UI */}
          <div className={`absolute inset-0 pt-12 ${view === 'office' ? 'pl-52' : ''}`}>
            <div
              className="w-full h-full"
              style={{ paddingRight: view === 'office' && selectedWorker ? '320px' : '0' }}
            >
              {view === 'office' ? (
                <OfficeScene
                  workers={workers}
                  selectedId={selectedWorker?.id ?? null}
                  onSelect={handleSelect}
                />
              ) : (
                <KnowledgeGraph pollMs={3000} compact={false} />
              )}
            </div>
          </div>

          {/* Worker detail panel (right slide-in) — office view only */}
          {view === 'office' && (
            <div className="absolute right-0 top-0 h-full" style={{ width: '320px' }}>
              <WorkerPanel
                worker={selectedWorker}
                onClose={() => setSelectedWorker(null)}
                adminKey={adminKey ?? undefined}
              />
            </div>
          )}

          {/* Click hint — fades when a worker is selected, office view only */}
          {view === 'office' && !selectedWorker && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <p className="text-xs text-gray-600 bg-gray-950/80 px-4 py-2 rounded-full border border-gray-800">
                Click a minion to inspect
              </p>
            </div>
          )}
        </>
      )}

      {/* Synthesis report modal — overlays either view */}
      {report && <ReportModal report={report} onClose={() => setReport(null)} />}
    </div>
  )
}
