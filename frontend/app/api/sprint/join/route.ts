import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { randomCodename } from '@/lib/codenames'
import {
  stageAfterParticipantJoin,
  type WorkspaceStage,
} from '@/lib/workspaceDomain'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const submissionId =
    typeof body.submissionId === 'string' ? body.submissionId.trim() : ''
  const workspaceId =
    typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
  const kind = body.kind
  if (!submissionId) return NextResponse.json({ error: 'submissionId required' }, { status: 400 })

  const sprintQuery = workspaceId
    ? db.from('sprints').select().eq('id', workspaceId).maybeSingle()
    : db
        .from('sprints')
        .select()
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
  const { data: sprint, error: sprintError } = await sprintQuery
  if (sprintError) {
    return NextResponse.json({ error: sprintError.message }, { status: 500 })
  }
  if (!sprint) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const { error: releaseError } = await db.rpc('release_stale_claims', {
    p_sprint_id: sprint.id,
  })
  if (releaseError) {
    return NextResponse.json({ error: releaseError.message }, { status: 500 })
  }

  // Upsert participant (idempotent on refresh)
  const { data: existing, error: existingError } = await db
    .from('participants')
    .select()
    .eq('submission_id', submissionId)
    .maybeSingle()
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }
  if (existing && existing.sprint_id !== sprint.id) {
    return NextResponse.json(
      { error: 'submission already belongs to another workspace' },
      { status: 409 }
    )
  }

  let participant = existing
  if (!participant) {
    const { data: created, error } = await db.from('participants').insert({
      submission_id: submissionId, sprint_id: sprint.id,
      codename: randomCodename(), kind: kind === 'simulated' ? 'simulated' : 'real',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    participant = created
    const { error: eventError } = await db.from('events').insert({
      sprint_id: sprint.id,
      type: 'PARTICIPANT_JOINED',
      payload: {
        submissionId,
        codename: created.codename,
        kind: created.kind,
      },
    })
    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }
  } else {
    const { error: seenError } = await db
      .from('participants')
      .update({ last_seen: new Date().toISOString() })
      .eq('submission_id', submissionId)
    if (seenError) {
      return NextResponse.json({ error: seenError.message }, { status: 500 })
    }
  }

  const nextStage = stageAfterParticipantJoin(
    (sprint.stage ?? 'planning') as WorkspaceStage
  )
  if (nextStage !== sprint.stage) {
    const { error: stageError } = await db
      .from('sprints')
      .update({ stage: nextStage })
      .eq('id', sprint.id)
    if (stageError) {
      return NextResponse.json({ error: stageError.message }, { status: 500 })
    }
    sprint.stage = nextStage
  }

  const { data: claimed, error: claimError } = await db.rpc('claim_subtask', {
    p_sprint_id: sprint.id,
    p_submission_id: submissionId,
  })
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 })
  }
  const subtask = Array.isArray(claimed) ? claimed[0] : claimed
  if (subtask && subtask.status === 'claimed') {
    const { error: claimEventError } = await db.from('events').insert({
      sprint_id: sprint.id,
      type: 'SUBTASK_CLAIMED',
      payload: { subtaskId: subtask.id, submissionId },
    })
    if (claimEventError) {
      return NextResponse.json({ error: claimEventError.message }, { status: 500 })
    }
    // Greeting message if first time
    const { count } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('submission_id', submissionId)
    if (!count) {
      const { error: greetingError } = await db.from('messages').insert({
        submission_id: submissionId, sender: 'agent',
        content: `Hi ${participant.codename}! Your subtask: **${subtask.title}**. ${subtask.brief} Submit at least 2 findings, each with a source URL. Ask me anything.`,
      })
      if (greetingError) {
        return NextResponse.json({ error: greetingError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ participant, subtask: subtask ?? null, sprint })
}
