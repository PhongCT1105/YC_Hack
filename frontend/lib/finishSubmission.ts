import { db } from '@/lib/db'
import { classifyEdges } from '@/lib/agent'
import { stageAfterTaskSubmission } from '@/lib/workspaceDomain'

export type FinishParticipant = {
  submission_id: string
  codename: string
  kind: 'real' | 'simulated'
}

export type FinishSubtask = {
  id: string
  sprint_id: string
}

export type FinishFinding = { id: string; text: string }

export type FinishResult =
  | { ok: true; redirect: string | null }
  | { ok: false; error: string; status: number }

/**
 * Shared tail-end of a worker submission: marks the subtask submitted, the
 * participant done, logs events, thanks the worker, classifies edges against
 * the rest of the sprint's findings (best-effort), and computes the Terac
 * payout redirect for real workers. Used by both /api/sprint/submit (legacy
 * findings-form path) and /api/sprint/finish (interview-mode path).
 */
export async function finishSubmission(
  participant: FinishParticipant,
  subtask: FinishSubtask,
  insertedFindings: FinishFinding[]
): Promise<FinishResult> {
  const { error: taskUpdateError } = await db
    .from('subtasks')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', subtask.id)
  if (taskUpdateError) return { ok: false, error: taskUpdateError.message, status: 500 }

  const { error: participantUpdateError } = await db
    .from('participants')
    .update({ status: 'done' })
    .eq('submission_id', participant.submission_id)
  if (participantUpdateError) return { ok: false, error: participantUpdateError.message, status: 500 }

  const { error: eventError } = await db.from('events').insert({
    sprint_id: subtask.sprint_id,
    type: 'FINDINGS_SUBMITTED',
    payload: { subtaskId: subtask.id, submissionId: participant.submission_id, count: insertedFindings.length },
  })
  if (eventError) return { ok: false, error: eventError.message, status: 500 }

  const { error: thankYouError } = await db.from('messages').insert({
    submission_id: participant.submission_id,
    sender: 'agent',
    content: `Findings received — thank you, ${participant.codename}! You're all set.`,
  })
  if (thankYouError) return { ok: false, error: thankYouError.message, status: 500 }

  const { data: workspaceTasks, error: workspaceTasksError } = await db
    .from('subtasks')
    .select('status')
    .eq('sprint_id', subtask.sprint_id)
  if (workspaceTasksError) return { ok: false, error: workspaceTasksError.message, status: 500 }
  const nextStage = stageAfterTaskSubmission((workspaceTasks ?? []).map((task) => task.status))
  if (nextStage) {
    const { error: stageError } = await db.from('sprints').update({ stage: nextStage }).eq('id', subtask.sprint_id)
    if (stageError) return { ok: false, error: stageError.message, status: 500 }
  }

  // Classify edges against all other findings in the sprint (best effort — never block payout)
  try {
    if (insertedFindings.length) {
      const { data: allSubtasks } = await db.from('subtasks').select('id').eq('sprint_id', subtask.sprint_id)
      const { data: existing } = await db.from('findings').select('id,text')
        .in('subtask_id', (allSubtasks ?? []).map((s) => s.id))
        .not('id', 'in', `(${insertedFindings.map((f) => f.id).join(',')})`)
      const edges = await classifyEdges({
        newFindings: insertedFindings.map((f) => ({ id: f.id, text: f.text })),
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
    }
  } catch (e) {
    console.error('edge classification failed', e)
  }

  // Real workers get redirected back to Terac to trigger payout; sims don't.
  const base = process.env.NEXT_PUBLIC_TERAC_CALLBACK_URL || ''
  const redirect = participant.kind === 'real' && base
    ? `${base}?submissionId=${encodeURIComponent(participant.submission_id)}&teracSubmissionId=${encodeURIComponent(participant.submission_id)}&result=completed`
    : null

  return { ok: true, redirect }
}
