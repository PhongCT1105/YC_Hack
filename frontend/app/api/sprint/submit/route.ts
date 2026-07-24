import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { finishSubmission } from '@/lib/finishSubmission'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Legacy findings-form submission path. Kept for backward compatibility —
// interview-mode workers use /api/sprint/finish instead, which reuses
// stored (agent-extracted) findings rather than a client-submitted form.
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

  const result = await finishSubmission(participant, subtask, inserted)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, redirect: result.redirect })
}
