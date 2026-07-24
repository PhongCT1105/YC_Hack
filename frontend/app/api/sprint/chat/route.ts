import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatReply, extractFindings } from '@/lib/agent'
import { buildGraphSummary } from '@/lib/graphSummary'
import { computeCriteria, type Criteria } from '@/lib/criteria'
import { getPeerClaims, getReviewsDone } from '@/lib/peerReview'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, message } = await req.json()
  if (!submissionId || !message) return NextResponse.json({ error: 'submissionId and message required' }, { status: 400 })

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })
  const { data: sprint } = await db.from('sprints').select().eq('id', participant.sprint_id).maybeSingle()
  if (!sprint) return NextResponse.json({ error: 'sprint not found' }, { status: 404 })
  const { data: subtask } = await db.from('subtasks').select().eq('claimed_by', submissionId)
    .eq('status', 'claimed')
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: history } = await db.from('messages').select().eq('submission_id', submissionId)
    .order('ts', { ascending: false }).limit(30)

  await db.from('messages').insert({ submission_id: submissionId, sender: 'worker', content: message })

  const peerClaims = await getPeerClaims(participant.sprint_id, submissionId)

  const reply = await chatReply({
    question: sprint.question,
    subtaskTitle: subtask?.title ?? 'general help',
    subtaskBrief: subtask?.brief ?? '',
    codename: participant.codename,
    graphSummary: await buildGraphSummary(participant.sprint_id),
    history: (history ?? []).reverse().map((m) => ({ sender: m.sender, content: m.content })),
    userMessage: message,
    peerFindings: peerClaims.map((p) => ({ codename: p.codename, text: p.text })),
  })
  await db.from('messages').insert({ submission_id: submissionId, sender: 'agent', content: reply })

  // Criteria engine: re-extract findings from the full thread after every
  // worker message. Best-effort — a failed extraction must never break chat.
  let criteria: Criteria | null = null
  if (subtask) {
    try {
      const { data: fullThread } = await db.from('messages').select().eq('submission_id', submissionId).order('ts')
      const { findings } = await extractFindings({
        question: sprint.question,
        subtaskTitle: subtask.title,
        subtaskBrief: subtask.brief,
        transcript: (fullThread ?? []).map((m) => ({ sender: m.sender, content: m.content })),
      })
      await db.from('findings').delete().eq('submission_id', submissionId).eq('subtask_id', subtask.id)
      if (findings.length) {
        await db.from('findings').insert(findings.map((f) => ({
          subtask_id: subtask.id,
          submission_id: submissionId,
          text: f.text,
          source_url: f.source_url,
          confidence: f.confidence,
          kind: f.kind,
        })))
      }
      const reviewsDone = await getReviewsDone(submissionId)
      criteria = computeCriteria(findings, { peerClaimsAvailable: peerClaims.length, reviewsDone })
    } catch (e) {
      console.error('extractFindings failed', e)
    }
  }

  return NextResponse.json({ reply, criteria })
}
