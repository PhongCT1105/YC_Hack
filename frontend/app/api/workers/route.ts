import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminRequest } from '@/lib/admin'
import { requiredWorkspaceId } from '@/lib/workspaceRequest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Existing 6-desk grid from lib/mockWorkers.ts
const DESKS: [number, number, number][] = [
  [-4, 0, -2.5], [0, 0, -2.5], [4, 0, -2.5], [-4, 0, 1.5], [0, 0, 1.5], [4, 0, 1.5],
]

function mapStatus(p: any, subtaskStatus: string | null): string {
  if (p.status === 'abandoned') return 'blocked'
  if (p.status === 'done') return 'done'
  if (subtaskStatus === 'submitted') return 'review'
  if (subtaskStatus === 'claimed') return 'in-progress'
  return 'pending'
}

function ago(ts: string): string {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  return m < 1 ? 'just now' : `${m} min ago`
}

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
    .select('id')
    .eq('id', sprintId)
    .maybeSingle()
  if (sprintError) {
    return NextResponse.json({ error: sprintError.message }, { status: 500 })
  }
  if (!sprint) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const { data: participants, error: participantError } = await db
    .from('participants')
    .select()
    .eq('sprint_id', sprint.id)
    .order('joined_at')
  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 })
  }

  const { data: subtasks, error: subtaskError } = await db
    .from('subtasks')
    .select()
    .eq('sprint_id', sprint.id)
  if (subtaskError) {
    return NextResponse.json({ error: subtaskError.message }, { status: 500 })
  }

  const submissionIds = (participants ?? []).map((p) => p.submission_id)
  const messageResult = submissionIds.length
    ? await db
        .from('messages')
        .select()
        .in('submission_id', submissionIds)
        .order('ts')
    : { data: [], error: null }
  if (messageResult.error) {
    return NextResponse.json({ error: messageResult.error.message }, { status: 500 })
  }
  const allMessages = messageResult.data ?? []

  const workers = (participants ?? []).map((p, i) => {
    const st = (subtasks ?? []).find((s) => s.claimed_by === p.submission_id)
    const msgs = (allMessages ?? []).filter((m) => m.submission_id === p.submission_id)
    const last = msgs[msgs.length - 1]
    return {
      id: p.submission_id,
      name: p.kind === 'simulated' ? `${p.codename} (AI stand-in)` : p.codename,
      teracId: p.submission_id.slice(0, 8).toUpperCase(),
      subtaskTitle: st?.title ?? 'Awaiting assignment',
      status: mapStatus(p, st?.status ?? null),
      lastMessage: last?.content?.slice(0, 120) ?? '',
      lastUpdated: ago(p.last_seen),
      position: DESKS[i % DESKS.length],
      messages: msgs.map((m) => ({
        id: String(m.id), sender: m.sender, content: m.content,
        timestamp: new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })),
    }
  })
  return NextResponse.json(workers)
}
