import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminRequest } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: sprints, error } = await db.from('sprints').select().order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sprintIds = (sprints ?? []).map((s) => s.id)

  let subtasks: { id: string; sprint_id: string; status: string }[] = []
  let participants: { submission_id: string; sprint_id: string }[] = []
  if (sprintIds.length) {
    const [subtaskResult, participantResult] = await Promise.all([
      db.from('subtasks').select('id,sprint_id,status').in('sprint_id', sprintIds),
      db.from('participants').select('submission_id,sprint_id').in('sprint_id', sprintIds),
    ])
    if (subtaskResult.error) {
      return NextResponse.json({ error: subtaskResult.error.message }, { status: 500 })
    }
    if (participantResult.error) {
      return NextResponse.json({ error: participantResult.error.message }, { status: 500 })
    }
    subtasks = subtaskResult.data ?? []
    participants = participantResult.data ?? []
  }

  const subtaskIds = subtasks.map((s) => s.id)
  const findingResult = subtaskIds.length
    ? await db.from('findings').select('id,subtask_id').in('subtask_id', subtaskIds)
    : { data: [] }
  if ('error' in findingResult && findingResult.error) {
    return NextResponse.json({ error: findingResult.error.message }, { status: 500 })
  }
  const findingsBySubtask = findingResult.data ?? []

  const subtaskToSprint = new Map(subtasks.map((s) => [s.id, s.sprint_id]))

  const workspaces = (sprints ?? []).map((sprint) => {
    const sprintSubtasks = subtasks.filter((s) => s.sprint_id === sprint.id)
    const subtasksTotal = sprintSubtasks.length
    const subtasksDone = sprintSubtasks.filter((s) => s.status === 'submitted').length
    const workerCount = participants.filter((p) => p.sprint_id === sprint.id).length
    const findingsCount = findingsBySubtask.filter(
      (f) => subtaskToSprint.get(f.subtask_id) === sprint.id
    ).length

    return {
      id: sprint.id,
      question: sprint.question,
      stage: sprint.stage,
      status: sprint.status,
      num_workers: sprint.num_workers,
      cost_cents: sprint.cost_cents,
      terac_opportunity_id: sprint.terac_opportunity_id,
      report_md: sprint.report_md,
      created_at: sprint.created_at,
      workerCount,
      findingsCount,
      subtasksDone,
      subtasksTotal,
    }
  })

  return NextResponse.json(workspaces)
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  let question: string = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })
  if (question.length > 500) question = question.slice(0, 500)

  // No decomposition at creation: the work is divided only after the user
  // decides how many researchers to hire (quote/launch in the planning chat).
  const { data: sprint, error } = await db
    .from('sprints')
    .insert({ question, status: 'active', stage: 'planning' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })


  const { error: eventError } = await db
    .from('events')
    .insert({ sprint_id: sprint.id, type: 'SPRINT_CREATED', payload: { question } })
  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 })
  }

  const { error: pmError } = await db.from('pm_messages').insert({
    sprint_id: sprint.id,
    sender: 'agent',
    content: `Workspace created for: "${question}". How many human researchers do you want? I'll divide the work into exactly that many subtasks — one per researcher — and quote the cost before anything launches.`,
  })
  if (pmError) {
    return NextResponse.json({ error: pmError.message }, { status: 500 })
  }

  return NextResponse.json({ sprint, subtasks: [] })
}
