'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { expertJoinBody } from '@/lib/expertJoin'

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

type CriteriaBucket = { have: number; need: number }
type Criteria = {
  claims: CriteriaBucket
  sourced: CriteriaBucket
  opinion: CriteriaBucket
  met: boolean
} | null

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

function criteriaMet(bucket: CriteriaBucket) {
  return bucket.have >= bucket.need
}

function overallFraction(criteria: Criteria): number {
  if (!criteria) return 0
  const buckets = [criteria.claims, criteria.sourced, criteria.opinion]
  const metCount = buckets.filter(criteriaMet).length
  return metCount / buckets.length
}

export default function WorkspaceClient() {
  const searchParams = useSearchParams()
  const submissionId = searchParams.get('submissionId') || searchParams.get('teracSubmissionId')
  const workspaceId = searchParams.get('workspaceId')

  const [phase, setPhase] = useState<Phase>(submissionId ? 'loading' : 'no-id')
  const [joinError, setJoinError] = useState('')
  const [stateError, setStateError] = useState('')
  const [chatError, setChatError] = useState('')
  const [finishError, setFinishError] = useState('')

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [subtask, setSubtask] = useState<Subtask>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [criteria, setCriteria] = useState<Criteria>(null)

  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  const [finishing, setFinishing] = useState(false)
  const [finishedLocally, setFinishedLocally] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

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
      setCriteria(data.criteria ?? null)
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
          body: JSON.stringify(expertJoinBody(submissionId, workspaceId)),
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
  }, [submissionId, workspaceId])

  // Poll state every 3s once ready
  useEffect(() => {
    if (phase !== 'ready') return
    fetchState()
    pollRef.current = setInterval(fetchState, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, fetchState])

  // Auto-scroll ONLY the chat container, and ONLY when new messages arrived,
  // and ONLY if the user was already near the bottom — never yank the whole
  // page and never fight a manual scroll-up while reading history.
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length <= prevCount) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom <= 120) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages])

  const isDone = finishedLocally || subtask?.status === 'submitted'

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
      } else if (data.criteria) {
        setCriteria(data.criteria)
      }
    } catch {
      setChatError('Could not reach the server. Your message may not have sent.')
    } finally {
      await fetchState()
      setChatSending(false)
    }
  }

  async function handleFinish() {
    if (!submissionId || !criteria?.met) return
    setFinishError('')
    setFinishing(true)
    try {
      const res = await fetch('/api/sprint/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFinishError(data.error || 'Could not finish yet. Please try again.')
        if (data.criteria) setCriteria(data.criteria)
        return
      }
      if (data.redirect) {
        window.location.href = data.redirect
        return
      }
      setFinishedLocally(true)
    } catch {
      setFinishError('Could not reach the server. Please try again.')
    } finally {
      setFinishing(false)
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
        message="Hang tight. Connecting you to the sprint…"
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

  const claimsMet = criteria ? criteriaMet(criteria.claims) : false
  const sourcedMet = criteria ? criteriaMet(criteria.sourced) : false
  const opinionMet = criteria ? criteriaMet(criteria.opinion) : false
  const progress = overallFraction(criteria)

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
            {sprint?.question ?? '-'}
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

        {stateError && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {stateError}
          </p>
        )}

        {!workspaceId && (
          <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
            This is a legacy Terac link. Ask the coordinator for a workspace-specific link if the assignment looks incorrect.
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
              <span>Chat with the coordinator below — no forms. Share what you found, cite sources, and give your own take.</span>
            </div>
          </div>
        )}

        {isDone ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-10 text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-green-500/10 border border-green-700 flex items-center justify-center text-3xl">
              ✅
            </div>
            <p className="text-lg font-semibold text-white">Findings submitted. Thank you!</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
              Payment is processed by Terac automatically. You can close this tab.
            </p>
          </div>
        ) : (
          <>
            {/* Standards bar — sticky criteria chips + progress */}
            <div className="sticky top-2 z-10 bg-gray-900/95 backdrop-blur border border-gray-800 rounded-2xl p-3.5 space-y-3 shadow-lg shadow-black/20">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    claimsMet
                      ? 'bg-green-950/60 border-green-700 text-green-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}
                >
                  📌 Findings {criteria?.claims.have ?? 0}/{criteria?.claims.need ?? 2}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    sourcedMet
                      ? 'bg-green-950/60 border-green-700 text-green-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}
                >
                  🔗 Sources {criteria?.sourced.have ?? 0}/{criteria?.sourced.need ?? 2}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    opinionMet
                      ? 'bg-green-950/60 border-green-700 text-green-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}
                >
                  💭 Your take {criteria?.opinion.have ?? 0}/{criteria?.opinion.need ?? 1}
                </span>
              </div>
              <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>

              {finishError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {finishError}
                </p>
              )}

              {criteria?.met ? (
                <button
                  onClick={handleFinish}
                  disabled={finishing}
                  className="w-full min-h-11 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-green-950/50 flex items-center justify-center gap-2"
                >
                  {finishing && (
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  )}
                  {finishing ? 'Finishing…' : 'Finish job ✓'}
                </button>
              ) : (
                <button
                  disabled
                  title="keep chatting — the coordinator needs 2 sourced findings and your take"
                  className="w-full min-h-11 bg-gray-800 border border-gray-700 text-gray-500 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed"
                >
                  Finish job ✓
                </button>
              )}
            </div>

            {/* Chat panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-800/80">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-sm shrink-0">
                  🤖
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">Coordinator</p>
                  <p className="text-[11px] text-gray-500 mt-1">Tell it what you found, your take, and sources</p>
                </div>
              </div>
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[28rem] min-h-[16rem]">
                {messages.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-6">No messages yet. Say hello.</p>
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
              </div>
              <div className="p-3 border-t border-gray-800/80">
                {chatError && <p className="text-xs text-red-400 mb-1.5">{chatError}</p>}
                <div className="flex gap-2">
                  <input
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    placeholder="Tell the coordinator what you found…"
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
          </>
        )}
      </div>
    </div>
  )
}
