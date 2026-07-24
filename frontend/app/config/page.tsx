'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { jobStore } from '@/lib/jobStore'

function StepIndicator({ current }: { current: number }) {
  const steps = ['Describe', 'Configure', 'Generate', 'Deploy']
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const num = i + 1
        const active = num === current
        const done = num < current
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs ${active ? 'text-white' : done ? 'text-white/40' : 'text-white/20'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${active ? 'border-white bg-white text-black' : done ? 'border-white/40 bg-white/10' : 'border-white/15'}`}>
                {done ? '✓' : num}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px ${num < current ? 'bg-white/30' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

async function addLinqContact(phone: string): Promise<{ smsLink: string }> {
  // TODO: replace with real Linq API call
  // await fetch('/api/linq/contact', { method: 'POST', body: JSON.stringify({ phone }) })
  await new Promise((r) => setTimeout(r, 1100))
  const body = encodeURIComponent("Hi! I'm your AI work coordinator from Minion HQ. Reply here to receive task updates and stay in sync.")
  return { smsLink: `sms:${phone}?body=${body}` }
}

export default function ConfigPage() {
  const router = useRouter()
  const [workerCount, setWorkerCount] = useState(6)
  const [deadline, setDeadline] = useState('')
  const [phone, setPhone] = useState('')
  const [linqLoading, setLinqLoading] = useState(false)
  const [linqResult, setLinqResult] = useState<{ smsLink: string } | null>(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const saved = jobStore.get()
    if (saved.problem) setProblem(saved.problem)
    if (saved.workerCount) setWorkerCount(saved.workerCount)
    if (saved.deadline) setDeadline(saved.deadline)
    if (saved.linqPhone) setPhone(saved.linqPhone)
  }, [])

  async function handleAddLinq() {
    if (!phone.trim()) return
    setLinqLoading(true)
    try {
      const result = await addLinqContact(phone.trim())
      setLinqResult(result)
      jobStore.save({ linqPhone: phone.trim() })
    } finally {
      setLinqLoading(false)
    }
  }

  function handleNext() {
    jobStore.save({ workerCount, deadline, linqPhone: phone })
    router.push('/generate')
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">M</div>
          <span className="text-sm text-white/50 font-medium">Minion HQ</span>
        </div>
        <StepIndicator current={2} />
        <div className="w-24" />
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Configure your deployment</h1>
            {problem && (
              <p className="mt-2 text-sm text-white/40 line-clamp-2">"{problem}"</p>
            )}
          </div>

          {/* Worker count */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Number of workers</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setWorkerCount(Math.max(1, workerCount - 1))}
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-lg font-light transition-colors"
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-bold tabular-nums">{workerCount}</span>
                <p className="text-xs text-white/30 mt-1">parallel workers</p>
              </div>
              <button
                onClick={() => setWorkerCount(Math.min(12, workerCount + 1))}
                className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-lg font-light transition-colors"
              >
                +
              </button>
            </div>
            <div className="flex gap-1 mt-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setWorkerCount(i + 1)}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${i < workerCount ? 'bg-white' : 'bg-white/10'}`}
                />
              ))}
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/70">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* Linq setup */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-white/70">Linq contact</label>
              <p className="text-xs text-white/30 mt-0.5">
                Add your phone number so the orchestrator agent can reach you via SMS
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleAddLinq}
                disabled={!phone.trim() || linqLoading || !!linqResult}
                className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2"
              >
                {linqLoading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Adding...
                  </>
                ) : linqResult ? (
                  <>
                    <span className="text-green-400">✓</span> Added
                  </>
                ) : (
                  'Add contact'
                )}
              </button>
            </div>

            {/* SMS link result */}
            {linqResult && (
              <a
                href={linqResult.smsLink}
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm hover:bg-green-500/15 transition-colors group"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
                </svg>
                <span className="flex-1">Contact added — tap to open SMS thread</span>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="opacity-50 group-hover:opacity-100 transition-opacity">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
                </svg>
              </a>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={handleNext}
            className="w-full py-3.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
          >
            Generate plan
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
