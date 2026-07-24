'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { WorkerPanel } from '@/components/WorkerPanel'
import { MOCK_WORKERS } from '@/lib/mockWorkers'
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

const STATUS_LABELS: Record<WorkerStatus, string> = {
  pending: 'Pending',
  'in-progress': 'Working',
  review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
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
  const total = workers.length
  const done = workers.filter((w) => w.status === 'done').length
  const blocked = workers.filter((w) => w.status === 'blocked').length
  const pct = Math.round((done / total) * 100)

  return (
    <div className="absolute left-4 top-4 bottom-4 w-52 z-10 flex flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl" style={{ background: 'rgba(10,10,20,0.45)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
      {/* Header with ? legend button */}
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-white/5 flex-shrink-0">
        {/* Legend ? button — top left */}
        <div className="group relative flex-shrink-0">
          <button
            className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[11px] font-bold text-gray-500 hover:text-white hover:bg-white/10 transition-all cursor-help"
            aria-label="Status legend"
          >
            ?
          </button>
          {/* Hover tooltip */}
          <div className="absolute top-7 left-0 bg-[#111118] border border-white/10 rounded-2xl p-3 w-44 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none shadow-2xl z-30">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-500 mb-2.5">
              Status Legend
            </p>
            {(Object.entries(STATUS_LABELS) as [WorkerStatus, string][]).map(([status, label]) => (
              <div key={status} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span className="text-xs text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Workers ({workers.length})
        </p>
      </div>

      {/* Worker list — scrollable */}
      <div className="flex-1 overflow-y-auto py-2">
        {workers.map((w) => (
          <button
            key={w.id}
            onClick={() => onSelect(selectedId === w.id ? null : w)}
            className={`
              w-full text-left px-4 py-2.5 transition-colors
              ${selectedId === w.id ? 'bg-white/5' : 'hover:bg-white/[0.03]'}
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
              {w.subtaskTitle.split(' ').slice(0, 3).join(' ')}
            </p>
            <p className="text-[10px] text-gray-600 pl-3.5 mt-0.5">{w.lastUpdated}</p>
          </button>
        ))}
      </div>

      {/* Progress — bottom */}
      <div className="px-4 py-3.5 border-t border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-gray-500">
            {done}/{total} done
          </span>
          <span className="text-[11px] font-semibold text-gray-300">{pct}%</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        {blocked > 0 && (
          <p className="text-[10px] text-red-400 mt-1.5 font-semibold">
            {blocked} blocked
          </p>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage({ params }: { params: { jobId: string } }) {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const workers = MOCK_WORKERS

  useEffect(() => {
    if (selectedWorker) {
      document.body.setAttribute('data-panel', 'open')
    } else {
      document.body.removeAttribute('data-panel')
    }
    return () => document.body.removeAttribute('data-panel')
  }, [selectedWorker])

  const handleSelect = (worker: Worker | null) => {
    setSelectedWorker(worker)
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-gray-950">
      {/* Floating worker list sidebar */}
      <WorkerListSidebar
        workers={workers}
        selectedId={selectedWorker?.id ?? null}
        onSelect={handleSelect}
      />

      {/* 3D Office Scene — full screen */}
      <div className="absolute inset-0">
        <div className="w-full h-full">
          <OfficeScene
            workers={workers}
            selectedId={selectedWorker?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
      </div>

      {/* Worker detail panel (right slide-in) */}
      <WorkerPanel
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
      />

      {/* Click hint */}
      {!selectedWorker && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <p className="text-xs text-gray-600 bg-gray-950/80 px-4 py-2 rounded-full border border-white/5">
            Click a minion to inspect
          </p>
        </div>
      )}
    </div>
  )
}
