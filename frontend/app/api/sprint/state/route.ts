import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeCriteria } from '@/lib/criteria'
import { getPeerClaims, getReviewsDone } from '@/lib/peerReview'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const submissionId = new URL(req.url).searchParams.get('submissionId')
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })

  await db.from('participants').update({ last_seen: new Date().toISOString() }).eq('submission_id', submissionId)

  const { data: sprint } = await db.from('sprints').select().eq('id', participant.sprint_id).single()
  const { data: subtask } = await db.from('subtasks').select()
    .eq('claimed_by', submissionId).in('status', ['claimed', 'submitted'])
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: messages } = await db.from('messages').select().eq('submission_id', submissionId).order('ts')
  const { count: findingsCount } = await db.from('findings').select('*', { count: 'exact', head: true }).eq('submission_id', submissionId)

  const peerClaims = sprint ? await getPeerClaims(participant.sprint_id, submissionId) : []
  const reviewsDone = await getReviewsDone(submissionId)

  let criteria = null
  if (subtask) {
    const { data: findings } = await db.from('findings').select('source_url,kind')
      .eq('submission_id', submissionId).eq('subtask_id', subtask.id)
    criteria = computeCriteria(findings ?? [], { peerClaimsAvailable: peerClaims.length, reviewsDone })
  }

  return NextResponse.json({ participant, sprint, subtask, messages: messages ?? [], findingsCount: findingsCount ?? 0, criteria, peerClaims })
}
