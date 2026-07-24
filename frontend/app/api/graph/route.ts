import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const { data: sprint } = await db.from('sprints').select().order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json({ sprint: null, nodes: [], edges: [] })

  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id).order('id')
  const ids = (subtasks ?? []).map((s) => s.id)
  const { data: findings } = ids.length
    ? await db.from('findings').select().in('subtask_id', ids).order('created_at')
    : { data: [] }
  const { data: relEdges } = await db.from('edges').select().eq('sprint_id', sprint.id)
  const { data: participants } = await db.from('participants').select('submission_id,codename,kind').eq('sprint_id', sprint.id)
  const who = new Map((participants ?? []).map((p) => [p.submission_id, p]))

  const nodes = [
    { id: sprint.id, type: 'question', label: sprint.question, meta: {} },
    ...(subtasks ?? []).map((s) => ({ id: s.id, type: 'subtask', label: s.title, meta: { status: s.status } })),
    ...(findings ?? []).map((f) => {
      const p = who.get(f.submission_id)
      return { id: f.id, type: 'finding', label: f.text, meta: { confidence: f.confidence, kind: f.kind, source_url: f.source_url, codename: p?.codename ?? '?', simulated: p?.kind === 'simulated' } }
    }),
  ]
  const edges = [
    ...(subtasks ?? []).map((s) => ({ id: `s-${s.id}`, source: sprint.id, target: s.id, relation: 'structure', rationale: '' })),
    ...(findings ?? []).map((f) => ({ id: `s-${f.id}`, source: f.subtask_id, target: f.id, relation: 'structure', rationale: '' })),
    ...(relEdges ?? []).map((e) => ({ id: e.id, source: e.from_finding, target: e.to_finding, relation: e.relation, rationale: e.rationale })),
  ]
  return NextResponse.json({ sprint, nodes, edges })
}
