import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { createDraft, launchDraft } from '@/lib/terac'
import { decomposeQuestion } from '@/lib/agent'
import { isAdminRequest } from '@/lib/admin'
import { canLaunchFromMessage } from '@/app/api/workspaces/pmchatPolicy'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic() // reads ANTHROPIC_API_KEY
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_ITERATIONS = 6

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'quote_recruitment',
    description:
      'Get a cost quote from Terac for recruiting N human researchers for this sprint. Call this whenever the user tells you how many people they want, or asks how much it would cost.',
    input_schema: {
      type: 'object',
      properties: {
        num_participants: { type: 'integer', minimum: 1, maximum: 20, description: 'Number of human researchers to recruit' },
      },
      required: ['num_participants'],
    },
  },
  {
    name: 'launch_recruitment',
    description:
      'Launch recruitment on Terac for this workspace. Requires that quote_recruitment has already been called. ONLY call this after the user has clearly confirmed they want to spend the money and launch.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_progress',
    description: 'Get current worker/finding/subtask progress counts for this workspace.',
    input_schema: { type: 'object', properties: {} },
  },
]

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

async function getCounts(sprintId: string) {
  const { data: subtasks } = await db.from('subtasks').select('id,status').eq('sprint_id', sprintId)
  const subtaskIds = (subtasks ?? []).map((s) => s.id)
  const { count: workers } = await db.from('participants').select('*', { count: 'exact', head: true }).eq('sprint_id', sprintId)
  const { count: findings } = subtaskIds.length
    ? await db.from('findings').select('*', { count: 'exact', head: true }).in('subtask_id', subtaskIds)
    : { count: 0 }
  const subtasksTotal = subtasks?.length ?? 0
  const subtasksDone = (subtasks ?? []).filter((s) => s.status === 'submitted').length
  return { workers: workers ?? 0, findings: findings ?? 0, subtasksDone, subtasksTotal }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = params
  const { data: messages, error } = await db.from('pm_messages').select().eq('sprint_id', id).order('ts')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(messages ?? [])
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id: sprintId } = params
  const body = await req.json().catch(() => ({}))
  const message: string = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const { data: sprint, error: sprintError } = await db
    .from('sprints')
    .select()
    .eq('id', sprintId)
    .maybeSingle()
  if (sprintError) {
    return NextResponse.json({ error: sprintError.message }, { status: 500 })
  }
  if (!sprint) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const { error: messageError } = await db
    .from('pm_messages')
    .insert({ sprint_id: sprintId, sender: 'user', content: message })
  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 })
  }

  const { data: subtasks } = await db.from('subtasks').select('id').eq('sprint_id', sprintId)
  const counts = await getCounts(sprintId)

  const { data: priorMessages } = await db
    .from('pm_messages')
    .select()
    .eq('sprint_id', sprintId)
    .order('ts', { ascending: false })
    .limit(20)
  const history = (priorMessages ?? []).reverse()

  const system =
    `You are the recruitment planner for a live research sprint workspace. ` +
    `Sprint question: "${sprint.question}". Stage: ${sprint.stage}. Subtasks: ${subtasks?.length ?? 0}. ` +
    `Current workers: ${counts.workers}, findings: ${counts.findings}, subtasks done: ${counts.subtasksDone}/${counts.subtasksTotal}. ` +
    `Your job is to help the user plan recruitment of human researchers: ask how many people they want if unknown, ` +
    `quote the cost with the quote_recruitment tool, and ONLY call launch_recruitment after the user has clearly ` +
    `confirmed they want to spend the money and launch. Keep replies to 2-4 sentences.`

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  let finalText = ''
  let iterations = 0

  while (iterations < MAX_ITERATIONS) {
    iterations++
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b) => b.type === 'text')
      finalText = textBlock && textBlock.type === 'text' ? textBlock.text : finalText
      break
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      let resultContent: string
      let isError = false

      try {
        if (block.name === 'quote_recruitment') {
          const input = block.input as { num_participants: number }
          const n = Math.max(1, Math.min(20, Math.round(input.num_participants)))
          const draft = await createDraft({
            workspaceId: sprintId,
            question: sprint.question,
            numParticipants: n,
          })
          const { error: quoteError } = await db
            .from('sprints')
            .update({ num_workers: n, cost_cents: draft.totalCents, terac_opportunity_id: draft.id })
            .eq('id', sprintId)
          if (quoteError) throw quoteError
          resultContent = JSON.stringify({
            perHead: centsToDollars(draft.perHeadCents),
            total: centsToDollars(draft.totalCents),
            estimated: draft.estimated,
          })
        } else if (block.name === 'launch_recruitment') {
          const { data: current } = await db.from('sprints').select('terac_opportunity_id').eq('id', sprintId).single()
          const draftId = current?.terac_opportunity_id ?? null
          if (!canLaunchFromMessage(message, draftId)) {
            resultContent = draftId
              ? 'POLICY BLOCK (not a Terac error): the workspace app only launches when the user\'s latest message clearly approves the spend (e.g. "yes", "approve", "yes, launch it"). Ask the user to reply with a clear approval, then call launch_recruitment again on that turn.'
              : 'POLICY BLOCK (not a Terac error): no Terac draft exists yet for this workspace. Call quote_recruitment first, then launch after the user approves.'
            isError = true
          } else {
            // Re-balance subtasks to the hired team size: one subtask per
            // worker, but only while the board is untouched (all open, no
            // findings) — never rip up work in progress.
            let rebalanced = 0
            try {
              const { data: sprintRow } = await db
                .from('sprints').select('question, num_workers').eq('id', sprintId).single()
              const n = sprintRow?.num_workers ?? 0
              const { data: allSubs } = await db
                .from('subtasks').select('id, status').eq('sprint_id', sprintId)
              const allOpen = (allSubs ?? []).every((st) => st.status === 'open')
              const { count: findingCount } = await db
                .from('findings').select('*', { count: 'exact', head: true })
                .in('subtask_id', (allSubs ?? []).map((st) => st.id))
              if (n >= 1 && n <= 8 && allOpen && !findingCount && (allSubs ?? []).length !== n) {
                const fresh = await decomposeQuestion(sprintRow!.question, n)
                await db.from('subtasks').delete().eq('sprint_id', sprintId)
                await db.from('subtasks').insert(
                  fresh.map((t) => ({ sprint_id: sprintId, title: t.title, brief: t.brief }))
                )
                rebalanced = fresh.length
              }
            } catch (e) {
              console.error('rebalance failed, launching with existing subtasks', e)
            }
            const launch = await launchDraft(draftId!)
            if (launch.launched) {
              const { error: stageError } = await db
                .from('sprints')
                .update({ stage: 'recruiting' })
                .eq('id', sprintId)
              if (stageError) throw stageError
            }
            resultContent = JSON.stringify({
              launched: launch.launched,
              note: launch.note,
              subtasksRebalanced: rebalanced || undefined,
            })
            isError = !launch.launched
          }
        } else if (block.name === 'get_progress') {
          const c = await getCounts(sprintId)
          const { data: freshSprint } = await db.from('sprints').select('stage').eq('id', sprintId).single()
          resultContent = JSON.stringify({ ...c, stage: freshSprint?.stage ?? sprint.stage })
        } else {
          resultContent = `unknown tool: ${block.name}`
          isError = true
        }
      } catch (err) {
        const detail = (err instanceof Error ? err.message : String(err)).slice(0, 300)
        console.error('planner tool failed', detail)
        resultContent = `Tool call failed. Raw error (relay the gist honestly to the user, do not speculate beyond it): ${detail}`
        isError = true
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent, is_error: isError })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  if (!finalText) finalText = "Got it. Let me know how many researchers you'd like to recruit."

  const { error: replyError } = await db
    .from('pm_messages')
    .insert({ sprint_id: sprintId, sender: 'agent', content: finalText })
  if (replyError) {
    return NextResponse.json({ error: replyError.message }, { status: 500 })
  }

  return NextResponse.json({ reply: finalText })
}
