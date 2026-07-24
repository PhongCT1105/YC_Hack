'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Participant = {
  submission_id: string
  codename: string
  kind: 'real' | 'simulated'
  status: string
}

type Subtask = {
  id: string
  title: string
  brief: string
  status: string
} | null

type Sprint = {
  id: string
  question: string
  status: string
}

type Message = {
  id: string
  sender: 'agent' | 'worker'
  content: string
  ts: string
}

type Confidence = 'low' | 'medium' | 'high'
type Kind = 'fact' | 'interpretation' | 'hypothesis'

type FindingRow = {
  text: string
  source_url: string
  confidence: Confidence
  kind: Kind
}

function emptyRow(): FindingRow {
  return { text: '', source_url: '', confidence: 'medium', kind: 'fact' }
}

type Phase = 'loading' | 'no-id' | 'exhausted' | 'join-error' | 'ready'

// --- Presentation-only helpers (no logic/contract impact) ---

const DOT_COLORS = ['bg-emerald-400', 'bg-cyan-400', 'bg-violet-400', 'bg-rose-400', 'bg-amber-400', 'bg-sky-400']

function dotColorFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return DOT_COLORS[hash % DOT_COLORS.length]
}

function HoldingCard({
  emoji,
  title,
  message,
  tone = 'default',
}: {
  emoji: string
  title: string
  message: string
  tone?: 'default' | 'error'
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center bg-gray-900/60 border border-gray-800 rounded-2xl p-8">
        <div className="text-4xl mb-4">{emoji}</div>
        <p className="text-lg font-semibold text-white mb-2">{title}</p>
        <p className={`text-sm leading-relaxed ${tone === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{message}</p>
      </div>
    </div>
  )
}

export default function WorkspaceClient() {
  const searchParams = useSearchParams()
  const submissionId = searchParams.get('submissionId') || searchParams.get('teracSubmissionId')

  const [phase, setPhase] = useState<Phase>(submissionId ? 'loading' : 'no-id')
  const [joinError, setJoinError] = useState('')
  const [stateError, setStateError] = useState('')
  const [chatError, setChatError] = useState('')
  const [submitError, setSubmitError] = useState('')

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [subtask, setSubtask] = useState<Subtask>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [findingsCount, setFindingsCount] = useState(0)

  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  const [rows, setRows] = useState<FindingRow[]>([emptyRow(), emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [submittedLocally, setSubmittedLocally] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchState = useCallback(async () => {
    if (!submissionId) return
    try {
      const res = await fetch(`/api/sprint/state?submissionId=${encodeURIComponent(submissionId)}`)
      const data = await res.json()
      if (!res.ok) {
        setStateError(data.error || 'Failed to refresh workspace state.')
        return
      }
      setStateError('')
      setParticipant(data.participant)
      setSprint(data.sprint)
      setSubtask(data.subtask)
      setMessages(data.messages ?? [])
      setFindingsCount(data.findingsCount ?? 0)
    } catch {
      setStateError('Could not reach the server to refresh state.')
    }
  }, [submissionId])

  // Join on mount
  useEffect(() => {
    if (!submissionId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/sprint/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setJoinError(data.error || 'Could not join the sprint.')
          setPhase('join-error')
          return
        }
        setParticipant(data.participant)
        setSprint(data.sprint)
        setSubtask(data.subtask)
        if (!data.subtask) {
          setPhase('exhausted')
          return
        }
        setPhase('ready')
      } catch {
        if (cancelled) return
        setJoinError('Could not reach the server. Please refresh to try again.')
        setPhase('join-error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [submissionId])

  // Poll state every 3s once ready
  useEffect(() => {
    if (phase !== 'ready') return
    fetchState()
    pollRef.current = setInterval(fetchState, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, fetchState])

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isDone = submittedLocally || subtask?.status === 'submitted'

  async function handleSend() {
    const text = chatInput.trim()
    if (!text || !submissionId) return
    setChatError('')
    setChatSending(true)
    setChatInput('')
    // Optimistic append
    setMessages((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, sender: 'worker', content: text, ts: new Date().toISOString() },
    ])
    try {
      const res = await fetch('/api/sprint/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, message: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setChatError(data.error || 'Message failed to send.')
      }
    } catch {
      setChatError('Could not reach the server. Your message may not have sent.')
    } finally {
      await fetchState()
      setChatSending(false)
    }
  }

  function updateRow(i: number, patch: Partial<FindingRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  async function handleSubmit() {
    if (!submissionId) return
    const valid = rows.filter((r) => r.text.trim() && r.source_url.trim())
    if (valid.length < 2) {
      setSubmitError('Please fill in at least 2 findings, each with text and a source URL.')
      return
    }
    setSubmitError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/sprint/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, findings: valid }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error || 'Submit failed. Please try again.')
        return
      }
      if (data.redirect) {
        window.location.href = data.redirect
        return
      }
      setSubmittedLocally(true)
    } catch {
      setSubmitError('Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // --- Render states ---

  if (phase === 'no-id') {
    return (
      <HoldingCard
        emoji="🔗"
        title="No task found"
        message="This page is opened from a Terac task link."
      />
    )
  }

  if (phase === 'loading') {
    return (
      <HoldingCard
        emoji="⏳"
        title="Setting up your workspace"
        message="Hang tight — connecting you to the sprint…"
      />
    )
  }

  if (phase === 'join-error') {
    return (
      <HoldingCard
        emoji="⚠️"
        title="Something went wrong"
        message={joinError}
        tone="error"
      />
    )
  }

  if (phase === 'exhausted') {
    return (
      <HoldingCard
        emoji="🎉"
        title="All subtasks are taken"
        message="Thanks for coming! You can close this tab."
      />
    )
  }

  // phase === 'ready'

  // Derived, presentation-only values for the progress strip — do not affect submit/validation logic above.
  const validFindingsCount = rows.filter((r) => r.text.trim() && r.source_url.trim()).length
  const steps = [
    { label: 'Get assignment', done: true, current: false },
    { label: 'Research', done: isDone || validFindingsCount >= 2, current: !isDone && validFindingsCount < 2 },
    { label: 'Submit findings', done: isDone, current: !isDone && validFindingsCount >= 2 },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-5">
        {/* Hero */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-400">
              Live Research Sprint
            </p>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              coordinator online
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug">
            {sprint?.question ?? '—'}
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            {participant && (
              <span className="inline-flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-xs text-gray-300">
                <span className={`h-2 w-2 rounded-full ${dotColorFor(participant.codename)}`} />
                {participant.codename}
              </span>
            )}
            {participant?.kind === 'simulated' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                🤖 AI stand-in
              </span>
            )}
          </div>
        </div>

        {/* Progress strip */}
        <div className="flex items-start">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 w-16 sm:w-20">
                <div
                  className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                    step.done
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : step.current
                        ? 'bg-blue-950 border-blue-500 text-blue-300'
                        : 'bg-gray-900 border-gray-700 text-gray-500'
                  }`}
                >
                  {step.done ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight ${
                    step.done || step.current ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`h-px flex-1 mx-1 mb-4 ${step.done ? 'bg-blue-600' : 'bg-gray-800'}`} />
              )}
            </div>
          ))}
        </div>

        {stateError && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {stateError}
          </p>
        )}

        {/* Assignment card */}
        {subtask && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Your assignment
            </p>
            <p className="text-base font-semibold text-white">{subtask.title}</p>
            <p className="text-sm text-gray-400 leading-relaxed">{subtask.brief}</p>
            <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-800/80 text-xs text-gray-500">
              <span aria-hidden>💡</span>
              <span>Cite a source URL for every claim — the agent checks them.</span>
            </div>
          </div>
        )}

        {isDone ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-10 text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-green-500/10 border border-green-700 flex items-center justify-center text-3xl">
              ✅
            </div>
            <p className="text-lg font-semibold text-white">Findings submitted — thank you!</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
              Payment is processed by Terac automatically. You can close this tab.
            </p>
          </div>
        ) : (
          <>
            {/* Chat panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-800/80">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-sm shrink-0">
                  🤖
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">Coordinator</p>
                  <p className="text-[11px] text-gray-500 mt-1">Ask about the task, sources, or scope</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-80 min-h-[10rem]">
                {messages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-6">No messages yet — say hello.</p>
                )}
                {messages.map((m) => {
                  const isAgent = m.sender === 'agent'
                  return (
                    <div key={m.id} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                      {isAgent && (
                        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-[10px] mr-2 mt-1 shrink-0">
                          🤖
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          isAgent
                            ? 'bg-gray-900 border border-gray-700 text-gray-200 rounded-tl-sm'
                            : 'bg-blue-600 text-white rounded-tr-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 border-t border-gray-800/80">
                {chatError && <p className="text-xs text-red-400 mb-1.5">{chatError}</p>}
                <div className="flex gap-2">
                  <input
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    placeholder="Ask the coordinator something…"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!chatInput.trim() || chatSending}
                    className="min-h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 rounded-xl text-sm font-medium transition-colors shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Findings form */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                  Findings
                </p>
                <p className="text-[11px] text-gray-500">{findingsCount} saved</p>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Submit at least 2 findings, each with a source URL.
              </p>

              <div className="space-y-3">
                {rows.map((row, i) => (
                  <div key={i} className="border border-gray-800 rounded-xl p-3.5 space-y-2.5 bg-gray-950/60">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                        <span className="h-5 w-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px] text-gray-300">
                          {i + 1}
                        </span>
                        Finding
                      </span>
                      {rows.length > 2 && (
                        <button
                          onClick={() => removeRow(i)}
                          className="text-[11px] font-medium text-gray-500 hover:text-red-400 transition-colors px-2 py-1 -mr-2 min-h-11 sm:min-h-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500">Finding text</label>
                      <textarea
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 resize-none"
                        placeholder="What did you find?"
                        rows={2}
                        value={row.text}
                        onChange={(e) => updateRow(i, { text: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500">Source URL</label>
                      <input
                        type="url"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                        placeholder="https://…"
                        value={row.source_url}
                        onChange={(e) => updateRow(i, { source_url: e.target.value })}
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <label className="text-[11px] text-gray-500">Confidence</label>
                        <select
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                          value={row.confidence}
                          onChange={(e) => updateRow(i, { confidence: e.target.value as Confidence })}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <label className="text-[11px] text-gray-500">Type</label>
                        <select
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                          value={row.kind}
                          onChange={(e) => updateRow(i, { kind: e.target.value as Kind })}
                        >
                          <option value="fact">Fact</option>
                          <option value="interpretation">Interpretation</option>
                          <option value="hypothesis">Hypothesis</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addRow}
                className="w-full min-h-11 border border-dashed border-gray-700 hover:border-gray-500 hover:bg-gray-800/40 text-gray-400 hover:text-gray-200 rounded-xl text-sm font-medium transition-colors"
              >
                + Add another finding
              </button>

              {submitError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full min-h-11 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-950/50 flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                )}
                {submitting ? 'Submitting…' : 'Submit findings'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
