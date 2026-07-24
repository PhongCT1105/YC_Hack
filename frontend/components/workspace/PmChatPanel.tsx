'use client'

import { useEffect, useRef, useState } from 'react'
import { adminHeaders } from '@/lib/workspaceClient'

type PmMessage = {
  id: string
  sender: 'user' | 'agent'
  content: string
  ts: string
}

export function PmChatPanel({
  sprintId,
  question,
  adminKey,
  open,
  onClose,
}: {
  sprintId: string | null
  question: string | null
  adminKey: string | null
  open: boolean
  onClose: () => void
}) {
  const [messages, setMessages] = useState<PmMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !sprintId || !adminKey) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/workspaces/${sprintId}/pmchat`, {
          cache: 'no-store',
          headers: adminHeaders(adminKey),
        })
        if (!res.ok || cancelled) return
        const data: PmMessage[] = await res.json()
        if (!cancelled) setMessages(data)
      } catch {
        // Transient error. The next poll retries.
      }
    }

    poll()
    const interval = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [adminKey, open, sprintId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  if (!open) return null

  async function handleSend() {
    const content = input.trim()
    if (!content || !sprintId || !adminKey) return
    setInput('')
    setError(null)
    setSending(true)
    // optimistic local echo
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, sender: 'user', content, ts: new Date().toISOString() },
    ])
    try {
      const res = await fetch(`/api/workspaces/${sprintId}/pmchat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...adminHeaders(adminKey),
        },
        body: JSON.stringify({ message: content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `send failed (${res.status})`)
        return
      }
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: `local-reply-${Date.now()}`, sender: 'agent', content: data.reply, ts: new Date().toISOString() },
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <aside className="fixed inset-0 z-50 flex flex-col bg-gray-900 lg:absolute lg:left-auto lg:right-0 lg:top-0 lg:bottom-0 lg:w-[380px] lg:border-l lg:border-gray-800 lg:shadow-2xl">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-800">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Planning agent</p>
            {question && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{question}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm flex-shrink-0 ml-2 rounded-lg px-2 py-1 hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-gray-600 text-center mt-6">
              No messages yet. Ask about recruitment, cost, or progress.
            </p>
          )}
          {messages.map((m) => {
            const isUser = m.sender === 'user'
            return (
              <div key={m.id} className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex flex-col items-start gap-0.5">
              <div className="max-w-[85%] px-3 py-2 rounded-xl text-xs bg-gray-800 text-gray-400 rounded-tl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                <span className="ml-1">agent is planning…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-gray-800 bg-gray-950">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={adminKey ? 'Message the planning agent...' : 'read-only (no admin key)'}
              value={input}
              disabled={!adminKey || sending}
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
              disabled={!input.trim() || sending || !adminKey}
              title={!adminKey ? 'append ?key=ADMIN_KEY to the URL' : undefined}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          {error && (
            <p className="text-[10px] text-red-400 mt-1.5 text-center truncate" title={error}>
              {error}
            </p>
          )}
        </div>
    </aside>
  )
}
