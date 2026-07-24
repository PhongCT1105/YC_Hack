import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { synthesize } from '@/lib/agent'
import { isAdminRequest } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const sprintId =
    typeof body.sprintId === 'string' ? body.sprintId.trim() : ''
  if (!sprintId) {
    return NextResponse.json({ error: 'sprintId required' }, { status: 400 })
  }

  const { data: sprint, error: sprintError } = await db
    .from('sprints')
    .select()
    .eq('id', sprintId)
    .maybeSingle()
  if (sprintError) {
    return NextResponse.json({ error: sprintError.message }, { status: 500 })
  }
  if (!sprint) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id)
  if (!subtasks?.length) {
    return NextResponse.json({ error: 'no subtasks found' }, { status: 400 })
  }
  const byId = new Map((subtasks ?? []).map((s) => [s.id, s.title]))
  const { data: findings } = await db.from('findings').select().in('subtask_id', (subtasks ?? []).map((s) => s.id))
  const { data: edges } = await db.from('edges').select().eq('sprint_id', sprint.id)
  if (!findings?.length) return NextResponse.json({ error: 'no findings yet' }, { status: 400 })

  const report = await synthesize({
    question: sprint.question,
    findings: findings.map((f) => ({ id: f.id, text: f.text, source_url: f.source_url, confidence: f.confidence, kind: f.kind, subtask: byId.get(f.subtask_id) ?? '' })),
    edges: (edges ?? []).map((e) => ({ from: e.from_finding, to: e.to_finding, relation: e.relation, rationale: e.rationale })),
  })
  await db
    .from('sprints')
    .update({ report_md: report, status: 'complete', stage: 'complete' })
    .eq('id', sprint.id)
  await db.from('events').insert({ sprint_id: sprint.id, type: 'REPORT_GENERATED', payload: {} })
  return NextResponse.json({ report })
}
