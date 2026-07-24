import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeCriteria } from '@/lib/criteria'
import { finishSubmission } from '@/lib/finishSubmission'
import { getPeerClaims, getReviewsDone } from '@/lib/peerReview'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Interview-mode finish gate. The worker never fills out a findings form —
// findings are agent-extracted from the chat thread by /api/sprint/chat as
// the conversation progresses (see lib/agent.ts extractFindings + criteria
// engine). This route just verifies the stored findings meet the bar and,
// if so, runs the same close-out sequence as the legacy /api/sprint/submit.
export async function POST(req: Request) {
  const { submissionId } = await req.json().catch(() => ({}))
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const { data: participant, error: participantError } = await db
    .from('participants')
    .select()
    .eq('submission_id', submissionId)
    .single()
  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 })
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })

  const { data: subtask, error: subtaskError } = await db
    .from('subtasks')
    .select()
    .eq('claimed_by', submissionId)
    .eq('status', 'claimed')
    .limit(1)
    .maybeSingle()
  if (subtaskError) return NextResponse.json({ error: subtaskError.message }, { status: 500 })
  if (!subtask) return NextResponse.json({ error: 'no claimed subtask' }, { status: 400 })

  const { data: findings, error: findingsError } = await db
    .from('findings')
    .select()
    .eq('submission_id', submissionId)
    .eq('subtask_id', subtask.id)
  if (findingsError) return NextResponse.json({ error: findingsError.message }, { status: 500 })

  const [peerClaims, reviewsDone] = await Promise.all([
    getPeerClaims(participant.sprint_id, submissionId),
    getReviewsDone(submissionId),
  ])
  const criteria = computeCriteria(findings ?? [], { peerClaimsAvailable: peerClaims.length, reviewsDone })
  if (!criteria.met) {
    return NextResponse.json({ error: 'criteria not met yet', criteria }, { status: 400 })
  }

  const result = await finishSubmission(participant, subtask, findings ?? [])
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, redirect: result.redirect })
}
