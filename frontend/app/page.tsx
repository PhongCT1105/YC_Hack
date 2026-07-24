'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { jobStore } from '@/lib/jobStore'
import { dashboardWorkspaceHref } from '@/lib/dashboardNavigation'

const SUGGESTIONS = [
  'Build a SaaS authentication system with JWT and OAuth',
  'Research competitors and write a market analysis report',
  'Design and implement a REST API with documentation',
]

export default function HomePage() {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [value])

  function handleSubmit() {
    if (!value.trim()) return
    jobStore.save({ problem: value.trim() })
    router.push('/config')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleOpenWorkspaces() {
    const search = new URLSearchParams(window.location.search)
    router.push(
      dashboardWorkspaceHref('new', search.get('key'))
    )
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Minimal icon rail */}
      <div className="w-14 flex flex-col items-center py-4 gap-6 border-r border-white/5 flex-shrink-0">
        {/* Logo */}
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
          M
        </div>
        <div className="flex flex-col gap-5 mt-2">
          {[
            <svg key="edit" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>,
            <svg key="search" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"/></svg>,
            <svg key="chat" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>,
          ].map((icon, i) => (
            <button key={i} className="text-white/30 hover:text-white/70 transition-colors">
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl">
          {/* Heading */}
          <h1 className="text-3xl font-semibold text-center text-white mb-8 tracking-tight">
            Where should we begin?
          </h1>

          {/* Input pill */}
          <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
              {/* Plus icon */}
              <button className="text-white/40 hover:text-white/70 mt-0.5 flex-shrink-0 transition-colors">
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-white/30 text-[15px] resize-none focus:outline-none leading-relaxed"
                placeholder="Ask anything"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-white disabled:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg width="14" height="14" fill="none" stroke={value.trim() ? 'black' : 'white'} strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/>
                </svg>
              </button>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/5">
              <span className="text-xs text-white/25">Shift+Enter for new line</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/25">Minion HQ</span>
              </div>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="mt-6 space-y-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setValue(s)
                  textareaRef.current?.focus()
                }}
                className="flex items-center gap-3 w-full text-left text-sm text-white/40 hover:text-white/70 py-1.5 transition-colors group"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
                </svg>
                {s}
              </button>
            ))}
          </div>

          <div className="mt-8 border-t border-white/10 pt-5">
            <button
              onClick={handleOpenWorkspaces}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/10 active:scale-[0.99]"
            >
              <span>
                <span className="block text-sm font-semibold text-white">
                  Research workspaces
                </span>
                <span className="mt-0.5 block text-xs text-white/40">
                  Plan recruitment, monitor experts, and synthesize findings.
                </span>
              </span>
              <span className="text-sm text-indigo-300">Open</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
