import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminRequest } from '@/lib/admin'
import { requiredWorkspaceId } from '@/lib/workspaceRequest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sprintId = requiredWorkspaceId(req)
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

  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id).order('id')
  const ids = (subtasks ?? []).map((s) => s.id)
  const { data: findings } = ids.length
    ? await db.from('findings').select().in('subtask_id', ids).order('created_at')
    : { data: [] }
  const { data: relEdges } = await db.from('edges').select().eq('sprint_id', sprint.id)
  const { data: participants } = await db.from('participants').select('submission_id,codename,kind').eq('sprint_id', sprint.id)
  const who = new Map((participants ?? []).map((p) => [p.submission_id, p]))

  const findingIds = (findings ?? []).map((f) => f.id)
  const { data: reviews } = findingIds.length
    ? await db.from('claim_reviews').select('finding_id,verdict').in('finding_id', findingIds)
    : { data: [] }
  const endorsements = new Map<string, number>()
  const disputes = new Map<string, number>()
  for (const r of reviews ?? []) {
    if (r.verdict === 'agree') endorsements.set(r.finding_id, (endorsements.get(r.finding_id) ?? 0) + 1)
    else if (r.verdict === 'disagree') disputes.set(r.finding_id, (disputes.get(r.finding_id) ?? 0) + 1)
  }

  const nodes = [
    { id: sprint.id, type: 'question', label: sprint.question, meta: {} },
    ...(subtasks ?? []).map((s) => ({ id: s.id, type: 'subtask', label: s.title, meta: { status: s.status } })),
    ...(findings ?? []).map((f) => {
      const p = who.get(f.submission_id)
      return {
        id: f.id,
        type: 'finding',
        label: f.text,
        meta: {
          confidence: f.confidence,
          kind: f.kind,
          source_url: f.source_url,
          codename: p?.codename ?? '?',
          simulated: p?.kind === 'simulated',
          endorsements: endorsements.get(f.id) ?? 0,
          disputes: disputes.get(f.id) ?? 0,
        },
      }
    }),
  ]
  const edges = [
    ...(subtasks ?? []).map((s) => ({ id: `s-${s.id}`, source: sprint.id, target: s.id, relation: 'structure', rationale: '' })),
    ...(findings ?? []).map((f) => ({ id: `s-${f.id}`, source: f.subtask_id, target: f.id, relation: 'structure', rationale: '' })),
    ...(relEdges ?? []).map((e) => ({ id: e.id, source: e.from_finding, target: e.to_finding, relation: e.relation, rationale: e.rationale })),
  ]
  return NextResponse.json({ sprint, nodes, edges })
}
