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
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-white mb-2">No task found</p>
          <p className="text-sm text-gray-400">This page is opened from a Terac task link.</p>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">
        Loading…
      </div>
    )
  }

  if (phase === 'join-error') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-white mb-2">Something went wrong</p>
          <p className="text-sm text-red-400">{joinError}</p>
        </div>
      </div>
    )
  }

  if (phase === 'exhausted') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold text-white mb-2">All subtasks are taken</p>
          <p className="text-sm text-gray-400">Thanks for coming! You can close this tab.</p>
        </div>
      </div>
    )
  }

  // phase === 'ready'
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="border-b border-gray-800 pb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              Research Sprint
            </p>
            {participant?.kind === 'simulated' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                AI stand-in
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-white mt-1 leading-snug">
            {sprint?.question ?? '—'}
          </h1>
          {participant && (
            <p className="text-sm text-gray-500 mt-1">
              You are <span className="text-gray-300 font-medium">{participant.codename}</span>
            </p>
          )}
        </div>

        {stateError && <p className="text-xs text-red-400">{stateError}</p>}

        {/* Assignment card */}
        {subtask && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
              Your assignment
            </p>
            <p className="text-sm font-semibold text-white mb-1">{subtask.title}</p>
            <p className="text-sm text-gray-400 leading-relaxed">{subtask.brief}</p>
          </div>
        )}

        {isDone ? (
          <div className="bg-green-950 border border-green-800 rounded-xl p-6 text-center">
            <p className="text-base font-semibold text-green-300">Submitted — thank you!</p>
            <p className="text-sm text-green-500 mt-1">You can close this tab.</p>
          </div>
        ) : (
          <>
            {/* Chat panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-4 pt-3 pb-2">
                Chat with the sprint agent
              </p>
              <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 max-h-80 min-h-[8rem]">
                {messages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">No messages yet.</p>
                )}
                {messages.map((m) => {
                  const isAgent = m.sender === 'agent'
                  return (
                    <div key={m.id} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                          isAgent
                            ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
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
              <div className="p-3 border-t border-gray-800">
                {chatError && <p className="text-xs text-red-400 mb-1.5">{chatError}</p>}
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Ask the agent something…"
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
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Findings form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Findings ({findingsCount} saved)
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Submit at least 2 findings, each with a source URL.
              </p>

              {rows.map((row, i) => (
                <div key={i} className="border border-gray-800 rounded-lg p-3 space-y-2 bg-gray-950/50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500">Finding {i + 1}</p>
                    {rows.length > 2 && (
                      <button
                        onClick={() => removeRow(i)}
                        className="text-[11px] text-gray-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    placeholder="What did you find?"
                    rows={2}
                    value={row.text}
                    onChange={(e) => updateRow(i, { text: e.target.value })}
                  />
                  <input
                    type="url"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Source URL"
                    value={row.source_url}
                    onChange={(e) => updateRow(i, { source_url: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <select
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={row.confidence}
                      onChange={(e) => updateRow(i, { confidence: e.target.value as Confidence })}
                    >
                      <option value="low">Low confidence</option>
                      <option value="medium">Medium confidence</option>
                      <option value="high">High confidence</option>
                    </select>
                    <select
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={row.kind}
                      onChange={(e) => updateRow(i, { kind: e.target.value as Kind })}
                    >
                      <option value="fact">Fact</option>
                      <option value="interpretation">Interpretation</option>
                      <option value="hypothesis">Hypothesis</option>
                    </select>
                  </div>
                </div>
              ))}

              <button
                onClick={addRow}
                className="w-full border border-dashed border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded-lg py-2 text-sm transition-colors"
              >
                + Add another finding
              </button>

              {submitError && <p className="text-xs text-red-400">{submitError}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit findings'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
