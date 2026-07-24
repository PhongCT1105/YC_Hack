import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decomposeQuestion } from '@/lib/agent'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_QUESTION =
  'Compare 6 leading AI coding assistants (GitHub Copilot, Cursor, Claude Code, Windsurf, Aider, Replit Agent): current pricing, one sourced user complaint, and one differentiator each.'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const question: string = body.question || DEFAULT_QUESTION

  const subtasks = await decomposeQuestion(question)
  const { data: sprint, error } = await db.from('sprints').insert({ question }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = subtasks.map((s) => ({ sprint_id: sprint.id, title: s.title, brief: s.brief }))
  const { data: inserted, error: e2 } = await db.from('subtasks').insert(rows).select()
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  await db.from('events').insert({ sprint_id: sprint.id, type: 'SPRINT_CREATED', payload: { question } })
  return NextResponse.json({ sprintId: sprint.id, subtasks: inserted })
}
