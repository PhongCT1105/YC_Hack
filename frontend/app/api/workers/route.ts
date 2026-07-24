import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

export async function GET() {
  const { data: sprint } = await db.from('sprints').select('id').order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json([])

  const { data: participants } = await db.from('participants').select().eq('sprint_id', sprint.id).order('joined_at')
  const { data: subtasks } = await db.from('subtasks').select().eq('sprint_id', sprint.id)
  const { data: allMessages } = await db.from('messages').select()
    .in('submission_id', (participants ?? []).map((p) => p.submission_id)).order('ts')

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
