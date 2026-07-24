'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { jobStore } from '@/lib/jobStore'
import { useMode } from '@/lib/modeContext'
import { FileViewer, type ViewableFile } from '@/components/FileViewer'
import { createJob, createWorkerAgent, createAgentFile, updateAgentFile, getAgentFile } from '@/lib/agentFiles'

// ── 2D SVG Minion ────────────────────────────────────────────────────────────

const OVERALL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function MinionSVG2D({ index, visible }: { index: number; visible: boolean }) {
  const color = OVERALL_COLORS[index % OVERALL_COLORS.length]
  return (
    <div
      className="transition-all duration-500"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.4) translateY(12px)',
      }}
    >
      <svg width="56" height="76" viewBox="0 0 56 76" fill="none">
        <rect x="15" y="60" width="10" height="15" rx="4" fill="#1B4FD8"/>
        <rect x="31" y="60" width="10" height="15" rx="4" fill="#1B4FD8"/>
        <ellipse cx="28" cy="48" rx="17" ry="19" fill="#FFD93D"/>
        <ellipse cx="28" cy="58" rx="17" ry="12" fill={color}/>
        <rect x="19" y="42" width="5" height="14" rx="2" fill={color}/>
        <rect x="32" y="42" width="5" height="14" rx="2" fill={color}/>
        <circle cx="28" cy="23" r="19" fill="#FFD93D"/>
        <rect x="9" y="18" width="38" height="11" rx="5.5" fill="#374151"/>
        <circle cx="28" cy="23" r="10" fill="white" fillOpacity="0.95"/>
        <circle cx="28" cy="23" r="7" fill="#BAE6FD"/>
        <circle cx="28" cy="23" r="4" fill="#111827"/>
        <circle cx="30" cy="21" r="1.5" fill="white"/>
        <ellipse cx="9" cy="48" rx="5" ry="9" fill="#FFD93D" transform="rotate(-8 9 48)"/>
        <ellipse cx="47" cy="48" rx="5" ry="9" fill="#FFD93D" transform="rotate(8 47 48)"/>
        <path d="M22 30 Q28 35 34 30" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
  )
}

// ── Log types ─────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number
  type: 'text' | 'file'
  content?: string
  filename?: string
  size?: string
}

// ── Mock file content generators ──────────────────────────────────────────────

function buildOrchestratorMd(problem: string, workerCount: number, tasks: string[]): string {
  return [
    `# Orchestrator Context`,
    ``,
    `## Problem Statement`,
    problem,
    ``,
    `## Project Structure`,
    `Work decomposed into **${workerCount}** independent parallel workstreams.`,
    ``,
    `## Subtask Assignments`,
    ...tasks.map((t, i) => `- **Worker ${i + 1}**: ${t}`),
    ``,
    `## Constraints`,
    `- All workers must follow the project style guide`,
    `- Deliverables must pass acceptance criteria before submission`,
    `- Use existing tooling and conventions where possible`,
    `- Report blockers immediately via Linq`,
    ``,
    `## Glossary`,
    `- **Worker Agent**: AI agent responsible for one subtask`,
    `- **Orchestrator**: Coordinating agent that manages all workers`,
    `- **Linq**: Messaging layer for agent-worker communication`,
    ``,
    `## Success Criteria`,
    `- All subtasks completed and quality-gated`,
    `- Final synthesis passes Orchestrator review`,
    `- Deliverable delivered within deadline`,
  ].join('\n')
}

function buildWorkerConfigJson(
  index: number,
  task: string,
  problem: string,
  deadline: string
): string {
  const perspectives = ['backend', 'frontend', 'testing', 'infrastructure', 'documentation', 'security', 'performance', 'data']
  return JSON.stringify(
    {
      id: `worker-${index + 1}`,
      subtask_title: task,
      perspective: perspectives[index % perspectives.length],
      model: 'gemini-2.0-flash',
      job_context: problem.slice(0, 120),
      acceptance_criteria: [
        `Complete ${task.toLowerCase()} to a production-ready standard`,
        'All edge cases handled and documented',
        'Code/output reviewed against acceptance criteria in orchestrator-context.md',
      ],
      deadline,
      orchestrator_ref: 'orchestrator-context.md',
      linq_conversation_id: null,
      status: 'pending',
    },
    null,
    2
  )
}

// ── Generation sequence builder ───────────────────────────────────────────────

function buildSequence(workerCount: number, problem: string) {
  const tasks = [
    'Build REST API endpoints',
    'Design database schema',
    'Write unit tests',
    'Build frontend UI components',
    'Set up CI/CD pipeline',
    'Write API documentation',
    'Implement caching layer',
    'Set up monitoring & alerts',
    'Perform security audit',
    'Load testing & optimization',
    'Deploy infrastructure',
    'Create admin dashboard',
  ].slice(0, workerCount)

  type Step =
    | { type: 'text'; text: string; speed?: number }
    | { type: 'file'; filename: string; size: string; workerIndex?: number }
    | { type: 'reveal-minion'; index: number }
    | { type: 'wait'; ms: number }

  const steps: Step[] = [
    { type: 'text', text: `Analyzing problem statement...\n` },
    { type: 'wait', ms: 300 },
    { type: 'text', text: `\nBreaking "${problem.slice(0, 60)}${problem.length > 60 ? '…' : ''}" into parallel workstreams.\n` },
    { type: 'wait', ms: 400 },
    { type: 'text', text: `\nIdentified ${workerCount} independent subtasks. Assigning to screened workers via Terac.\n` },
    { type: 'wait', ms: 500 },
    { type: 'text', text: `\nGenerating orchestrator context file...\n`, speed: 18 },
    { type: 'file', filename: 'orchestrator-context.md', size: `${(1.8 + workerCount * 0.2).toFixed(1)} KB` },
    { type: 'wait', ms: 300 },
  ]

  for (let i = 0; i < workerCount; i++) {
    steps.push({ type: 'wait', ms: 180 })
    steps.push({ type: 'text', text: `\nConfiguring Worker ${i + 1} → ${tasks[i]}\n`, speed: 22 })
    steps.push({ type: 'file', filename: `worker-${i + 1}.config.json`, size: `${(600 + Math.random() * 400).toFixed(0)} B`, workerIndex: i })
    steps.push({ type: 'reveal-minion', index: i })
    steps.push({ type: 'wait', ms: 120 })
  }

  steps.push({ type: 'wait', ms: 400 })
  steps.push({ type: 'text', text: `\nSynthesizing task dependency graph...\n` })
  steps.push({ type: 'wait', ms: 500 })
  steps.push({ type: 'text', text: `All ${workerCount} worker configurations complete. Ready to deploy.\n` })

  return { steps, tasks }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter()
  const { mode } = useMode()
  const isLive = mode === 'live'

  const [log, setLog] = useState<LogEntry[]>([])
  const [visibleMinions, setVisibleMinions] = useState<boolean[]>([])
  const [workerTasks, setWorkerTasks] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [workerCount, setWorkerCount] = useState(6)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)

  // Stores generated file content keyed by filename
  const [storedFiles, setStoredFiles] = useState<Map<string, ViewableFile>>(new Map())
  const [fetchingFile, setFetchingFile] = useState<string | null>(null) // filename being fetched
  const [liveError, setLiveError] = useState<string | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)
  // Live-mode Supabase refs
  const jobIdRef = useRef<string | null>(null)
  const workerAgentIdsRef = useRef<string[]>([])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    // Read mode directly from localStorage so we get the correct value
    // regardless of whether ModeProvider's own useEffect has run yet.
    const liveMode = localStorage.getItem('yc-hack-mode') === 'live'

    const cfg = jobStore.get()
    const count = cfg.workerCount ?? 6
    const problem = cfg.problem ?? 'Build a full-stack web application'
    const deadline = cfg.deadline ?? new Date(Date.now() + 86400000 * 3).toISOString()
    setWorkerCount(count)
    setVisibleMinions(Array(count).fill(false))

    const { steps, tasks } = buildSequence(count, problem)
    setWorkerTasks(tasks)

    let cancelled = false
    const nextId = () => ++idRef.current

    async function sleep(ms: number) {
      await new Promise((r) => setTimeout(r, ms))
    }

    async function appendText(text: string, speed = 25) {
      const entryId = nextId()
      setLog((prev) => [...prev, { id: entryId, type: 'text', content: '' }])
      for (let i = 0; i < text.length; i++) {
        if (cancelled) return
        const char = text[i]
        setLog((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, content: (e.content ?? '') + char } : e))
        )
        await sleep(speed)
      }
    }

    async function run() {
      // ── Live mode: set up Supabase job + worker agents before animation ──
      if (liveMode) {
        try {
          const jobId = await createJob({ problem, workerCount: count, deadline, linqPhone: cfg.linqPhone })
          jobIdRef.current = jobId
          const agentIds = await Promise.all(
            tasks.map((task, i) =>
              createWorkerAgent({
                jobId,
                workerIndex: i,
                subtaskTitle: task,
                config: {
                  model: 'gemini-2.0-flash',
                  perspective: ['backend', 'frontend', 'testing', 'infrastructure', 'documentation', 'security', 'performance', 'data'][i % 8],
                  deadline,
                  orchestrator_ref: 'orchestrator-context.md',
                },
              })
            )
          )
          workerAgentIdsRef.current = agentIds
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[live] Failed to create job/agents in Supabase:', err)
          setLiveError(`Supabase setup failed: ${msg}`)
          // Continue with animation even if Supabase fails
        }
      }

      // ── Animation ──
      for (const step of steps) {
        if (cancelled) return

        if (step.type === 'text') {
          await appendText(step.text, step.speed ?? 25)

        } else if (step.type === 'file') {
          const id = nextId()
          setLog((prev) => [...prev, { id, type: 'file', filename: step.filename, size: step.size }])

          // Generate mock content for this file
          const isJson = step.filename.endsWith('.json')
          const content = isJson
            ? buildWorkerConfigJson(step.workerIndex ?? 0, tasks[step.workerIndex ?? 0] ?? '', problem, deadline)
            : buildOrchestratorMd(problem, count, tasks)
          const fileType: 'md' | 'json' = isJson ? 'json' : 'md'

          let fileId: string | undefined
          if (liveMode && jobIdRef.current) {
            try {
              fileId = await createAgentFile({
                jobId: jobIdRef.current,
                workerAgentId: step.workerIndex != null ? workerAgentIdsRef.current[step.workerIndex] : null,
                filename: step.filename,
                content,
                sizeLabel: step.size,
              })
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              console.error('[live] Failed to write file to Supabase:', err)
              setLiveError(`Failed to write ${step.filename}: ${msg}`)
            }
          }

          setStoredFiles((prev) => {
            const next = new Map(prev)
            next.set(step.filename, { id: fileId, filename: step.filename, content, fileType })
            return next
          })

          await sleep(60)

        } else if (step.type === 'reveal-minion') {
          const idx = step.index
          setVisibleMinions((prev) => {
            const next = [...prev]
            next[idx] = true
            return next
          })

        } else if (step.type === 'wait') {
          await sleep(step.ms)
        }
      }

      if (!cancelled) setDone(true)
    }

    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getMinionPosition(index: number, total: number) {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2
    const r = Math.min(140, 80 + total * 10)
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
  }

  async function handleFileClick(filename: string) {
    if (selectedFilename === filename) {
      setSelectedFilename(null)
      return
    }
    const local = storedFiles.get(filename)
    if (!local) return

    // In live mode: fetch latest content from Supabase
    if (isLive && local.id) {
      setFetchingFile(filename)
      setSelectedFilename(filename)
      try {
        const fresh = await getAgentFile(local.id)
        const fileType: 'md' | 'json' = fresh.file_type
        setStoredFiles((prev) => {
          const next = new Map(prev)
          next.set(filename, { id: fresh.id, filename: fresh.filename, content: fresh.content, fileType })
          return next
        })
      } catch (err) {
        console.error('[live] Failed to fetch file from Supabase:', err)
      } finally {
        setFetchingFile(null)
      }
    } else {
      setSelectedFilename(filename)
    }
  }

  async function handleFileUpdate(id: string | undefined, newContent: string) {
    // Always update local state so the editor reflects the save
    setStoredFiles((prev) => {
      const next = new Map(prev)
      if (selectedFilename) {
        const existing = next.get(selectedFilename)
        if (existing) next.set(selectedFilename, { ...existing, content: newContent })
      }
      return next
    })
    // Persist to Supabase only in live mode when we have a DB row ID
    if (isLive && id) {
      await updateAgentFile(id, newContent)
    }
  }

  const selectedFile = selectedFilename ? (storedFiles.get(selectedFilename) ?? null) : null

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">M</div>
          <span className="text-sm text-white/40">Minion HQ</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/30">
          {!done ? (
            <>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-white/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
              Generating plan...
            </>
          ) : (
            <span className="text-green-400">Plan complete</span>
          )}
        </div>
        <div className="w-24" />
      </div>

      {/* Split pane */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT PANEL: generation log ────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-white/8 bg-[#0d0d0d]">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-white/40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"/>
            </svg>
            <span className="text-xs font-medium text-white/50 uppercase tracking-widest">Orchestrator</span>
            {isLive && !liveError && (
              <span className="ml-auto text-[10px] text-green-400/60 font-mono">● live</span>
            )}
            {liveError && (
              <span className="ml-auto text-[10px] text-red-400 font-mono truncate max-w-[160px]" title={liveError}>⚠ {liveError}</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 font-mono text-xs leading-relaxed">
            {log.map((entry) => {
              if (entry.type === 'text') {
                return (
                  <span key={entry.id} className="text-white/75 whitespace-pre-wrap">
                    {entry.content}
                  </span>
                )
              }
              if (entry.type === 'file') {
                const isClickable = storedFiles.has(entry.filename!)
                const isSelected = selectedFilename === entry.filename
                const isFetching = fetchingFile === entry.filename
                return (
                  <div key={entry.id} className="flex items-center gap-2 my-1.5 animate-in fade-in duration-300">
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-green-400 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                    </svg>
                    <button
                      onClick={() => isClickable && !isFetching ? handleFileClick(entry.filename!) : undefined}
                      disabled={!isClickable || isFetching}
                      className={`
                        flex-1 text-left text-green-400 truncate font-mono text-xs
                        transition-all rounded px-1 -ml-1
                        ${isSelected ? 'bg-green-400/10 underline underline-offset-2' : ''}
                        ${isClickable && !isFetching ? 'hover:underline hover:underline-offset-2 cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      {entry.filename}
                    </button>
                    {isFetching ? (
                      <svg className="animate-spin w-3 h-3 text-white/30 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                    ) : isSelected ? (
                      <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="text-green-400/60 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                      </svg>
                    ) : null}
                    <span className="text-white/20 flex-shrink-0">{entry.size}</span>
                  </div>
                )
              }
              return null
            })}
            {!done && (
              <span className="inline-block w-1.5 h-3.5 bg-white/60 animate-pulse ml-0.5 align-middle" />
            )}
            <div ref={logEndRef} />
          </div>

          <div className="p-4 border-t border-white/8">
            <button
              onClick={() => router.push(`/dashboard/${jobIdRef.current ?? 'demo-job-001'}`)}
              disabled={!done}
              className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/90 transition-all flex items-center justify-center gap-2"
            >
              Deploy workers
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL: file viewer or worker circle ───────────── */}
        {selectedFile ? (
          <FileViewer
            file={selectedFile}
            onClose={() => setSelectedFilename(null)}
            onUpdate={handleFileUpdate}
            isLive={isLive}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center relative bg-[#080808]">
            <div className="absolute top-0 left-0 right-0 px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">Worker assignments</h2>
            </div>

            <div className="relative" style={{ width: 400, height: 400 }}>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums text-white">
                    {visibleMinions.filter(Boolean).length}
                    <span className="text-white/20">/{workerCount}</span>
                  </div>
                  <p className="text-xs text-white/30 mt-1">workers ready</p>
                </div>
              </div>

              <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.06 }}>
                <circle
                  cx="200" cy="200"
                  r={Math.min(140, 80 + workerCount * 10)}
                  fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 6"
                />
              </svg>

              {Array.from({ length: workerCount }).map((_, i) => {
                const { x, y } = getMinionPosition(i, workerCount)
                const task = workerTasks[i] ?? `Task ${i + 1}`
                const visible = visibleMinions[i] ?? false
                return (
                  <div
                    key={i}
                    className="absolute flex flex-col items-center gap-1"
                    style={{ left: 200 + x, top: 200 + y, transform: 'translate(-50%, -50%)', width: 100 }}
                  >
                    <MinionSVG2D index={i} visible={visible} />
                    <div
                      className="text-center transition-all duration-500"
                      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(4px)' }}
                    >
                      <div className="text-[9px] font-medium text-white/60 leading-tight text-center line-clamp-2 max-w-[90px]">
                        {task}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="absolute bottom-8 flex gap-1.5">
              {Array.from({ length: workerCount }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{ backgroundColor: visibleMinions[i] ? OVERALL_COLORS[i % OVERALL_COLORS.length] : 'rgba(255,255,255,0.1)' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
