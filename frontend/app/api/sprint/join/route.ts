import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomCodename } from '@/lib/codenames'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, kind } = await req.json()
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: sprint } = await db.from('sprints').select().eq('status', 'active')
    .order('created_at', { ascending: false }).limit(1).single()
  if (!sprint) return NextResponse.json({ error: 'no active sprint' }, { status: 404 })

  await db.rpc('release_stale_claims', { p_sprint_id: sprint.id })

  // Upsert participant (idempotent on refresh)
  const { data: existing } = await db.from('participants').select().eq('submission_id', submissionId).single()
  let participant = existing
  if (!participant) {
    const { data: created, error } = await db.from('participants').insert({
      submission_id: submissionId, sprint_id: sprint.id,
      codename: randomCodename(), kind: kind === 'simulated' ? 'simulated' : 'real',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    participant = created
    await db.from('events').insert({ sprint_id: sprint.id, type: 'PARTICIPANT_JOINED', payload: { submissionId, codename: created.codename, kind: created.kind } })
  } else {
    await db.from('participants').update({ last_seen: new Date().toISOString() }).eq('submission_id', submissionId)
  }

  const { data: claimed } = await db.rpc('claim_subtask', { p_sprint_id: sprint.id, p_submission_id: submissionId })
  const subtask = Array.isArray(claimed) ? claimed[0] : claimed
  if (subtask && subtask.status === 'claimed') {
    await db.from('events').insert({ sprint_id: sprint.id, type: 'SUBTASK_CLAIMED', payload: { subtaskId: subtask.id, submissionId } })
    // Greeting message if first time
    const { count } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('submission_id', submissionId)
    if (!count) {
      await db.from('messages').insert({
        submission_id: submissionId, sender: 'agent',
        content: `Hi ${participant.codename}! Your subtask: **${subtask.title}**. ${subtask.brief} Submit at least 2 findings, each with a source URL. Ask me anything.`,
      })
    }
  }

  return NextResponse.json({ participant, subtask: subtask ?? null, sprint })
}
