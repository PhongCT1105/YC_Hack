import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatReply } from '@/lib/agent'
import { buildGraphSummary } from '@/lib/graphSummary'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const { submissionId, message } = await req.json()
  if (!submissionId || !message) return NextResponse.json({ error: 'submissionId and message required' }, { status: 400 })

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })
  const { data: sprint } = await db.from('sprints').select().eq('id', participant.sprint_id).single()
  const { data: subtask } = await db.from('subtasks').select().eq('claimed_by', submissionId)
    .order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  const { data: history } = await db.from('messages').select().eq('submission_id', submissionId).order('ts').limit(30)

  await db.from('messages').insert({ submission_id: submissionId, sender: 'worker', content: message })

  const reply = await chatReply({
    question: sprint.question,
    subtaskTitle: subtask?.title ?? 'general help',
    subtaskBrief: subtask?.brief ?? '',
    codename: participant.codename,
    graphSummary: await buildGraphSummary(participant.sprint_id),
    history: (history ?? []).map((m) => ({ sender: m.sender, content: m.content })),
    userMessage: message,
  })
  await db.from('messages').insert({ submission_id: submissionId, sender: 'agent', content: reply })
  return NextResponse.json({ reply })
}
