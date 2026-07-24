'use client'

import { useEffect, useRef, useState } from 'react'

type AgentMessage = {
  id: string
  role: 'user' | 'agent'
  content: string
  ts: string
  actions?: string[]
}

export function AgentChatPanel({
  open,
  onClose,
  sprintId,
  adminKey,
}: {
  open: boolean
  onClose: () => void
  sprintId?: string | null
  adminKey?: string | null
}) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Conversation history sent to the API for context
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (!open) return null

  async function handleSend() {
    const content = input.trim()
    if (!content || sending) return
    setInput('')
    setError(null)
    setSending(true)

    const userMsg: AgentMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      ts: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    historyRef.current.push({ role: 'user', content })

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: historyRef.current.slice(0, -1), // exclude the one we just appended
          sprintId: sprintId ?? null,
          adminKey: adminKey ?? null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      const reply: string = data.reply ?? 'Done.'
      const actions: string[] = data.actions ?? []

      historyRef.current.push({ role: 'assistant', content: reply })

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'agent',
          content: reply,
          ts: new Date().toISOString(),
          actions,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-40 flex flex-col"
      style={{
        width: 380,
        background: 'rgba(8, 8, 18, 0.6)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            🤖
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Orchestrator</p>
            <p className="text-[10px] text-white/30">Agent · Minion HQ</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/30 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <div className="text-3xl opacity-30">🤖</div>
            <p className="text-xs text-white/25 leading-relaxed">
              Ask the orchestrator to brief a worker, check status, or send a message to the team.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.role === 'user'
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className="max-w-[82%] px-3.5 py-2.5 text-sm leading-relaxed"
                style={{
                  background: isMe ? '#0A84FF' : 'rgba(58,58,62,0.9)',
                  color: 'white',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                }}
              >
                {msg.content}
              </div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5 items-start">
                  {msg.actions.map((a, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-indigo-400/70 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.1)' }}
                    >
                      ✓ {a}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-[10px] text-white/20 mt-1 px-1">
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}

        {sending && (
          <div className="flex items-start">
            <div
              className="px-3.5 py-2.5 flex items-center gap-1.5"
              style={{
                background: 'rgba(58,58,62,0.9)',
                borderRadius: '18px 18px 18px 4px',
              }}
            >
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-full px-4 py-2 text-sm text-white focus:outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            placeholder="Message the orchestrator..."
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-25"
            style={{ background: input.trim() && !sending ? '#6366F1' : 'rgba(255,255,255,0.1)' }}
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
        {error && (
          <p className="text-[10px] text-red-400 mt-1.5 text-center truncate" title={error}>
            ⚠ {error}
          </p>
        )}
      </div>
    </aside>
  )
}
