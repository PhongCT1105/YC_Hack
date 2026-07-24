'use client'

import { useState, useRef, useEffect } from 'react'
import type { Worker, WorkerStatus } from '@/types'

const STATUS_CONFIG: Record<WorkerStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:      { label: 'Pending',     bg: 'bg-gray-800',  text: 'text-gray-400',  dot: '#9CA3AF' },
  'in-progress':{ label: 'Working',     bg: 'bg-blue-950',  text: 'text-blue-400',  dot: '#3B82F6' },
  review:       { label: 'In Review',   bg: 'bg-amber-950', text: 'text-amber-400', dot: '#F59E0B' },
  done:         { label: 'Done',        bg: 'bg-green-950', text: 'text-green-400', dot: '#10B981' },
  blocked:      { label: 'Blocked',     bg: 'bg-red-950',   text: 'text-red-400',   dot: '#EF4444' },
}

function StatusBadge({ status }: { status: WorkerStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.dot }}
      />
      {cfg.label}
    </span>
  )
}

export function WorkerPanel({
  worker,
  onClose,
}: {
  worker: Worker | null
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState(worker?.messages ?? [])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Reset thread + draft when switching to a different worker
  useEffect(() => {
    setLocalMessages(worker?.messages ?? [])
    setInput('')
  }, [worker?.id])

  // Re-sync the thread when fresh messages arrive for the *same* worker
  // (e.g. a new poll of /api/workers picked up a new chat message).
  useEffect(() => {
    if (worker) setLocalMessages(worker.messages)
  }, [worker?.messages.length])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  function handleSend() {
    if (!input.trim() || !worker) return
    const now = new Date()
    const timestamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    setLocalMessages((prev) => [
      ...prev,
      { id: `pm-${Date.now()}`, sender: 'agent', content: `[PM] ${input.trim()}`, timestamp },
    ])
    setInput('')
  }

  // Panel slides in/out
  const isOpen = worker !== null

  return (
    <div
      className={`
        absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800
        flex flex-col z-20 shadow-2xl
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      {worker && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-gray-800 bg-gray-950">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">👷</span>
                <div>
                  <p className="font-bold text-white text-sm">{worker.name}</p>
                  <p className="text-xs text-gray-500">{worker.teracId}</p>
                </div>
              </div>
              <StatusBadge status={worker.status} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-lg leading-none mt-0.5 ml-2 flex-shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Subtask info */}
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
              Subtask
            </p>
            <p className="text-sm text-gray-200 font-medium leading-snug">
              {worker.subtaskTitle}
            </p>
          </div>

          {/* Linq message thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <p className="text-xs text-gray-600 font-semibold uppercase tracking-widest text-center mb-4">
              Linq Thread
            </p>
            {localMessages.map((msg) => {
              const isAgent = msg.sender === 'agent'
              return (
                <div key={msg.id} className={`flex flex-col gap-0.5 ${isAgent ? 'items-start' : 'items-end'}`}>
                  <div
                    className={`
                      max-w-[90%] px-3 py-2 rounded-xl text-xs leading-relaxed
                      ${isAgent
                        ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
                        : 'bg-blue-600 text-white rounded-tr-sm'
                      }
                    `}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-600 px-1">
                    {isAgent ? 'Agent' : worker.name.split(' ')[0]} · {msg.timestamp}
                  </span>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* PM message input */}
          <div className="p-3 border-t border-gray-800 bg-gray-950">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Message worker..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
              >
                Send
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center">
              Message routed through Worker Agent via Linq
            </p>
          </div>
        </>
      )}
    </div>
  )
}
