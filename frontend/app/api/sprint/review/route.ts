import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VERDICTS = new Set(['agree', 'disagree', 'skip'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : ''
  const findingId = typeof body.findingId === 'string' ? body.findingId.trim() : ''
  const verdict = typeof body.verdict === 'string' ? body.verdict : ''
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''

  if (!submissionId || !findingId || !VERDICTS.has(verdict)) {
    return NextResponse.json({ error: 'submissionId, findingId, and a valid verdict are required' }, { status: 400 })
  }

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })

  const { data: finding } = await db.from('findings').select().eq('id', findingId).maybeSingle()
  if (!finding) return NextResponse.json({ error: 'finding not found' }, { status: 404 })
  if (finding.submission_id === submissionId) {
    return NextResponse.json({ error: 'cannot review your own finding' }, { status: 400 })
  }

  const { error: upsertError } = await db.from('claim_reviews').upsert(
    {
      finding_id: findingId,
      reviewer_submission_id: submissionId,
      verdict,
      comment: comment || null,
    },
    { onConflict: 'finding_id,reviewer_submission_id' }
  )
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  // Best-effort: a disagree with a real reason becomes a new finding for the
  // reviewer plus a `contradicts` edge back to the reviewed claim. Never let
  // this fail the review submission itself.
  if (verdict === 'disagree' && comment) {
    try {
      const { data: myClaimedSubtask } = await db
        .from('subtasks')
        .select('id,sprint_id')
        .eq('claimed_by', submissionId)
        .in('status', ['claimed', 'submitted'])
        .order('claimed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const subtaskId = myClaimedSubtask?.id ?? finding.subtask_id
      const sprintId = myClaimedSubtask?.sprint_id ?? participant.sprint_id

      const { data: newFinding, error: findingError } = await db
        .from('findings')
        .insert({
          subtask_id: subtaskId,
          submission_id: submissionId,
          text: comment,
          source_url: '',
          confidence: 'medium',
          kind: 'interpretation',
        })
        .select()
        .single()
      if (findingError) throw findingError

      const { error: edgeError } = await db.from('edges').insert({
        sprint_id: sprintId,
        from_finding: newFinding.id,
        to_finding: findingId,
        relation: 'contradicts',
        rationale: `Reviewer disagreed: ${comment.slice(0, 120)}`,
      })
      if (edgeError) throw edgeError

      await db.from('events').insert({
        sprint_id: sprintId,
        type: 'CONTRADICTION_DETECTED',
        payload: { findingId, reviewerFindingId: newFinding.id, reviewerSubmissionId: submissionId },
      })
    } catch (e) {
      console.error('review disagree follow-up failed', e)
    }
  }

  return NextResponse.json({ ok: true, reviewed: findingId })
}
