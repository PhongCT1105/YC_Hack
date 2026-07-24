'use client'

import { useState, useRef, useEffect } from 'react'
import type { Worker, WorkerStatus } from '@/types'
import { useMode } from '@/lib/modeContext'

const STATUS_CONFIG: Record<WorkerStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:      { label: 'Pending',    bg: 'bg-white/5',   text: 'text-white/40',  dot: 'rgba(255,255,255,0.25)' },
  'in-progress':{ label: 'Working',    bg: 'bg-white/10',  text: 'text-white/80',  dot: 'rgba(255,255,255,0.7)' },
  review:       { label: 'In Review',  bg: 'bg-white/8',   text: 'text-white/60',  dot: 'rgba(255,255,255,0.5)' },
  done:         { label: 'Done',       bg: 'bg-white/10',  text: 'text-white',     dot: 'rgba(255,255,255,0.9)' },
  blocked:      { label: 'Blocked',    bg: 'bg-white/5',   text: 'text-white/30',  dot: 'rgba(255,255,255,0.2)' },
}

function StatusBadge({ status }: { status: WorkerStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

interface LinqRawMessage {
  id: string
  is_from_me: boolean
  parts: { type: string; value?: string }[]
  sent_at?: string
  created_at?: string
}

function rawToMessage(m: LinqRawMessage) {
  const text = m.parts.find((p) => p.type === 'text')?.value ?? ''
  const ts = m.sent_at ?? m.created_at ?? ''
  return {
    id: m.id,
    sender: (m.is_from_me ? 'agent' : 'worker') as 'agent' | 'worker',
    content: text,
    timestamp: ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  }
}

async function fetchThread(chatId: string) {
  const res = await fetch(`/api/linq/thread?chatId=${encodeURIComponent(chatId)}`)
  if (!res.ok) throw new Error(`thread fetch failed: ${res.status}`)
  const data = await res.json() as { messages: LinqRawMessage[] }
  return data.messages ?? []
}

async function sendLinqMessage(phone: string, content: string, chatId?: string) {
  const res = await fetch('/api/linq/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, content, chatId }),
  })
  if (!res.ok) throw new Error(`send failed: ${res.status}`)
  return await res.json() as { chatId: string }
}

export function WorkerPanel({
  worker,
  onClose,
  adminKey,
}: {
  worker: Worker | null
  onClose: () => void
  adminKey?: string
}) {
  const { mode } = useMode()
  const isLive = mode === 'live'

  const [input, setInput] = useState('')
  const [localMessages, setLocalMessages] = useState(worker?.messages ?? [])
  const [chatId, setChatId] = useState<string | null>(worker?.linqConversationId ?? null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initialChatId = worker?.linqConversationId ?? null
    setLocalMessages(worker?.messages ?? [])
    setInput('')
    setChatId(initialChatId)

    if (!isLive) return
    if (!initialChatId && !worker?.linqPhone) return
    let cancelled = false
    const url = initialChatId
      ? `/api/linq/thread?chatId=${encodeURIComponent(initialChatId)}`
      : `/api/linq/thread?phone=${encodeURIComponent(worker!.linqPhone!)}`
    fetch(url)
      .then((r) => r.json())
      .then((data: { messages?: LinqRawMessage[]; chatId?: string | null }) => {
        if (cancelled) return
        const msgs = data.messages ?? []
        if (msgs.length > 0) setLocalMessages(msgs.map(rawToMessage))
        if (data.chatId && !initialChatId) setChatId(data.chatId)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [worker?.id, isLive])

  useEffect(() => {
    if (!isLive || !chatId) return
    const interval = setInterval(() => {
      fetchThread(chatId)
        .then((msgs) => setLocalMessages(msgs.map(rawToMessage)))
        .catch(console.error)
    }, 5000)
    return () => clearInterval(interval)
  }, [isLive, chatId])

  // Re-sync thread when fresh messages arrive for the same worker via polling
  useEffect(() => {
    if (worker) setLocalMessages(worker.messages)
  }, [worker?.messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  async function handleSend() {
    if (!input.trim() || !worker) return
    const now = new Date()
    const timestamp = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    const content = input.trim()
    setInput('')
    setSendError(null)

    // Linq path: live mode + worker has a phone
    if (isLive && worker.linqPhone) {
      try {
        const result = await sendLinqMessage(worker.linqPhone, content, chatId ?? undefined)
        const newChatId = result.chatId
        if (!chatId) setChatId(newChatId)
        const msgs = await fetchThread(newChatId)
        setLocalMessages(msgs.map(rawToMessage))
      } catch (e) {
        console.error(e)
        setLocalMessages((prev) => [
          ...prev,
          { id: `pm-${Date.now()}`, sender: 'agent', content, timestamp },
        ])
      }
      return
    }

    // Sprint path: persist through the coordinator so the worker sees it
    if (!adminKey) {
      setSendError('Read-only. Append ?key=ADMIN_KEY to the dashboard URL to message workers.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/sprint/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ submissionId: worker.id, content: `[PM] ${content}` }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(data.error ?? `send failed (${res.status})`)
        return
      }
      setLocalMessages((prev) => [
        ...prev,
        { id: `pm-${Date.now()}`, sender: 'agent', content, timestamp },
      ])
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'send failed')
    } finally {
      setSending(false)
    }
  }

  const isOpen = worker !== null

  return (
    <div
      className={`
        absolute right-4 top-14 bottom-4 w-80 flex flex-col z-20
        rounded-3xl overflow-hidden border border-white/10 shadow-2xl
        transition-all duration-300 ease-out
        ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0'}
      `}
      style={{
        background: 'rgba(8, 8, 16, 0.55)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      {worker && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-white/8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👷</span>
              <div>
                <p className="font-bold text-white text-sm leading-tight">{worker.name}</p>
                <p className="text-xs text-white/30 mt-0.5">{worker.teracId}</p>
                <div className="mt-1.5">
                  <StatusBadge status={worker.status} />
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/15 transition-all flex-shrink-0 mt-0.5"
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Subtask */}
          <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1">
              Subtask
            </p>
            <p className="text-sm text-white/80 font-medium leading-snug">
              {worker.subtaskTitle}
            </p>
          </div>

          {/* Messages thread */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {worker.linqPhone && (
              <div className="flex justify-center mb-3">
                <span className="text-[10px] text-white/20 font-mono bg-white/5 px-2.5 py-1 rounded-full">
                  {isLive ? '🟢' : '⚫'} +{worker.linqPhone}
                </span>
              </div>
            )}

            {localMessages.map((msg, i) => {
              const isMe = msg.sender === 'worker'
              const prevMsg = localMessages[i - 1]
              const showTimestamp = !prevMsg || prevMsg.sender !== msg.sender ||
                msg.timestamp !== prevMsg.timestamp

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-start' : 'items-end'}`}>
                  <div
                    className={`
                      max-w-[78%] px-3.5 py-2 text-sm leading-relaxed
                      ${isMe
                        ? 'bg-[#3A3A3C] text-white rounded-[18px] rounded-bl-[4px]'
                        : 'text-white rounded-[18px] rounded-br-[4px]'
                      }
                    `}
                    style={!isMe ? { background: 'rgba(255,255,255,0.18)' } : undefined}
                  >
                    {msg.content}
                  </div>
                  {showTimestamp && (
                    <span className={`text-[10px] text-white/25 mt-1 mb-1 px-1 ${isMe ? 'self-start' : 'self-end'}`}>
                      {msg.timestamp}
                    </span>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* iMessage-style input bar */}
          <div className="px-3 pb-3 pt-2 border-t border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-full px-4 py-2 text-sm text-white focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                placeholder={adminKey ? 'Message' : 'read-only (no admin key)'}
                value={input}
                disabled={!adminKey && !worker.linqPhone}
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
                style={{ background: input.trim() && !sending ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)' }}
                aria-label="Send"
              >
                {sending
                  ? <span className="text-white text-xs">…</span>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                }
              </button>
            </div>
            {sendError && (
              <p className="text-[10px] text-white/40 mt-1.5 text-center truncate" title={sendError}>
                ⚠ {sendError}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
