import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyEdges } from '@/lib/agent'
import { stageAfterTaskSubmission } from '@/lib/workspaceDomain'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, findings } = await req.json()
  if (!submissionId || !Array.isArray(findings) || findings.length < 2)
    return NextResponse.json({ error: 'submissionId and >=2 findings required' }, { status: 400 })
  for (const f of findings) {
    if (!f.text || !f.source_url) return NextResponse.json({ error: 'each finding needs text and source_url' }, { status: 400 })
  }

  const { data: participant, error: participantError } = await db
    .from('participants')
    .select()
    .eq('submission_id', submissionId)
    .single()
  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 })
  }
  const { data: subtask, error: subtaskError } = await db
    .from('subtasks')
    .select()
    .eq('claimed_by', submissionId)
    .eq('status', 'claimed')
    .limit(1)
    .maybeSingle()
  if (subtaskError) {
    return NextResponse.json({ error: subtaskError.message }, { status: 500 })
  }
  if (!participant || !subtask) return NextResponse.json({ error: 'no claimed subtask' }, { status: 400 })

  const rows = findings.map((f: any) => ({
    subtask_id: subtask.id, submission_id: submissionId,
    text: String(f.text), source_url: String(f.source_url),
    confidence: ['low', 'medium', 'high'].includes(f.confidence) ? f.confidence : 'medium',
    kind: ['fact', 'interpretation', 'hypothesis'].includes(f.kind) ? f.kind : 'fact',
  }))
  const { data: inserted, error } = await db.from('findings').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!inserted) {
    return NextResponse.json({ error: 'findings were not returned' }, { status: 500 })
  }

  const { error: taskUpdateError } = await db
    .from('subtasks')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', subtask.id)
  if (taskUpdateError) {
    return NextResponse.json({ error: taskUpdateError.message }, { status: 500 })
  }

  const { error: participantUpdateError } = await db
    .from('participants')
    .update({ status: 'done' })
    .eq('submission_id', submissionId)
  if (participantUpdateError) {
    return NextResponse.json({ error: participantUpdateError.message }, { status: 500 })
  }

  const { error: eventError } = await db.from('events').insert({
    sprint_id: subtask.sprint_id,
    type: 'FINDINGS_SUBMITTED',
    payload: { subtaskId: subtask.id, submissionId, count: inserted.length },
  })
  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 })
  }

  const { error: thankYouError } = await db.from('messages').insert({
    submission_id: submissionId,
    sender: 'agent',
    content: `Findings received — thank you, ${participant.codename}! You're all set.`,
  })
  if (thankYouError) {
    return NextResponse.json({ error: thankYouError.message }, { status: 500 })
  }

  const { data: workspaceTasks, error: workspaceTasksError } = await db
    .from('subtasks')
    .select('status')
    .eq('sprint_id', subtask.sprint_id)
  if (workspaceTasksError) {
    return NextResponse.json({ error: workspaceTasksError.message }, { status: 500 })
  }
  const nextStage = stageAfterTaskSubmission(
    (workspaceTasks ?? []).map((task) => task.status)
  )
  if (nextStage) {
    const { error: stageError } = await db
      .from('sprints')
      .update({ stage: nextStage })
      .eq('id', subtask.sprint_id)
    if (stageError) {
      return NextResponse.json({ error: stageError.message }, { status: 500 })
    }
  }

  // Classify edges against all other findings in the sprint (best effort — never block payout)
  try {
    const { data: allSubtasks } = await db.from('subtasks').select('id').eq('sprint_id', subtask.sprint_id)
    const { data: existing } = await db.from('findings').select('id,text')
      .in('subtask_id', (allSubtasks ?? []).map((s) => s.id))
      .not('id', 'in', `(${inserted.map((f) => f.id).join(',')})`)
    const edges = await classifyEdges({
      newFindings: inserted.map((f) => ({ id: f.id, text: f.text })),
      existingFindings: (existing ?? []).map((f) => ({ id: f.id, text: f.text })),
    })
    if (edges.length) {
      await db.from('edges').insert(edges.map((e) => ({
        sprint_id: subtask.sprint_id, from_finding: e.from, to_finding: e.to,
        relation: e.relation, rationale: e.rationale,
      })))
      const contradictions = edges.filter((e) => e.relation === 'contradicts')
      if (contradictions.length)
        await db.from('events').insert({ sprint_id: subtask.sprint_id, type: 'CONTRADICTION_DETECTED', payload: { edges: contradictions } })
    }
  } catch (e) {
    console.error('edge classification failed', e)
  }

  // Real workers get redirected back to Terac to trigger payout; sims don't.
  const base = process.env.NEXT_PUBLIC_TERAC_CALLBACK_URL || ''
  const redirect = participant.kind === 'real' && base
    ? `${base}?submissionId=${encodeURIComponent(submissionId)}&teracSubmissionId=${encodeURIComponent(submissionId)}&result=completed`
    : null
  return NextResponse.json({ ok: true, redirect })
}
