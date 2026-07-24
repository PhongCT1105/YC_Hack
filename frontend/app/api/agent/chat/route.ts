import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { MOCK_WORKERS } from '@/lib/mockWorkers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_ITERATIONS = 6

const LINQ_BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const LINQ_KEY = process.env.LINQ_API_KEY ?? ''
const LINQ_FROM = process.env.LINQ_FROM_NUMBER ?? ''
const AGENT_PHONE = process.env.AGENT_LINQ_PHONE ?? ''

// ── Linq helper ────────────────────────────────────────────────────────────

async function linqSend(toPhone: string, content: string, chatId?: string) {
  if (!LINQ_KEY) return null
  const headers = {
    Authorization: `Bearer ${LINQ_KEY}`,
    'Content-Type': 'application/json',
  }
  if (chatId) {
    await fetch(`${LINQ_BASE}/chats/${chatId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: { parts: [{ type: 'text', value: content }] } }),
    })
    return chatId
  }
  const to = toPhone.startsWith('+') ? toPhone : `+${toPhone}`
  const res = await fetch(`${LINQ_BASE}/chats`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: LINQ_FROM,
      to: [to],
      message: { parts: [{ type: 'text', value: content }] },
    }),
  })
  const data = await res.json()
  return data.chat?.id ?? null
}

// ── Worker data ────────────────────────────────────────────────────────────

interface WorkerRow {
  id: string
  name: string
  subtaskTitle: string
  status: string
  linqPhone?: string
  messages: { sender: string; content: string }[]
}

async function getWorkers(sprintId: string | null, adminKey: string | null): Promise<WorkerRow[]> {
  if (!sprintId || !adminKey) {
    return MOCK_WORKERS.map((w) => ({
      id: w.id,
      name: w.name,
      subtaskTitle: w.subtaskTitle,
      status: w.status,
      linqPhone: w.linqPhone,
      messages: w.messages.map((m) => ({ sender: m.sender, content: m.content })),
    }))
  }

  const { data: participants } = await db
    .from('participants')
    .select('id,codename,status')
    .eq('sprint_id', sprintId)

  if (!participants?.length) return []

  const rows: WorkerRow[] = await Promise.all(
    participants.map(async (p) => {
      const { data: msgs } = await db
        .from('messages')
        .select('sender,content')
        .eq('submission_id', p.id)
        .order('ts', { ascending: false })
        .limit(3)
      return {
        id: p.id,
        name: p.codename,
        subtaskTitle: '',
        status: p.status,
        messages: (msgs ?? []).reverse(),
      }
    })
  )
  return rows
}

// ── Claude tools ────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_workers',
    description: 'List all current workers with their name, status, subtask, and recent messages.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'message_worker',
    description: 'Send a message to a specific worker by their ID.',
    input_schema: {
      type: 'object',
      properties: {
        worker_id: { type: 'string', description: 'The worker ID' },
        message: { type: 'string', description: 'Message to send to the worker' },
      },
      required: ['worker_id', 'message'],
    },
  },
  {
    name: 'get_worker_thread',
    description: 'Get the last few messages in a specific worker\'s conversation thread.',
    input_schema: {
      type: 'object',
      properties: {
        worker_id: { type: 'string', description: 'The worker ID' },
      },
      required: ['worker_id'],
    },
  },
]

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const userMessage: string = typeof body.message === 'string' ? body.message.trim() : ''
  const history: { role: 'user' | 'assistant'; content: string }[] = body.history ?? []
  const sprintId: string | null = body.sprintId ?? null
  const adminKey: string | null = body.adminKey ?? null
  const linqChatId: string | null = body.linqChatId ?? null  // ongoing Linq thread with user

  if (!userMessage) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const workers = await getWorkers(sprintId, adminKey)

  const workerSummary = workers
    .map((w) => {
      const lastMsg = w.messages[w.messages.length - 1]
      return `- ${w.name} (id:${w.id}) | Status: ${w.status} | Task: ${w.subtaskTitle || 'assigned'}${lastMsg ? ` | Last msg: "${lastMsg.content.slice(0, 80)}"` : ''}`
    })
    .join('\n')

  const system =
    `You are the orchestrator agent for Minion HQ. You coordinate a team of workers and help the manager.\n\n` +
    `Current worker roster:\n${workerSummary || 'No workers yet.'}\n\n` +
    `You can message any worker directly using the message_worker tool. When asked to update someone, ` +
    `brief someone, or send something to a worker — use message_worker. Write the message AS the orchestrator ` +
    `addressing the worker professionally. Keep replies concise (2–4 sentences). After taking actions, ` +
    `tell the manager what you did.`

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ]

  let finalText = ''
  let actionsLog: string[] = []
  let iterations = 0

  while (iterations < MAX_ITERATIONS) {
    iterations++
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
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

      try {
        if (block.name === 'list_workers') {
          resultContent = JSON.stringify(workers.map((w) => ({
            id: w.id,
            name: w.name,
            subtaskTitle: w.subtaskTitle,
            status: w.status,
            hasPhone: Boolean(w.linqPhone),
          })))

        } else if (block.name === 'get_worker_thread') {
          const { worker_id } = block.input as { worker_id: string }
          const worker = workers.find((w) => w.id === worker_id)
          if (!worker) {
            resultContent = `Worker ${worker_id} not found.`
          } else {
            resultContent = JSON.stringify(worker.messages)
          }

        } else if (block.name === 'message_worker') {
          const { worker_id, message } = block.input as { worker_id: string; message: string }
          const worker = workers.find((w) => w.id === worker_id)
          if (!worker) {
            resultContent = `Worker ${worker_id} not found.`
          } else if (worker.linqPhone && LINQ_KEY) {
            await linqSend(worker.linqPhone, message)
            actionsLog.push(`Messaged ${worker.name} via Linq`)
            resultContent = `Message sent to ${worker.name} via SMS.`
          } else if (sprintId && adminKey) {
            await fetch(`${req.nextUrl.origin}/api/sprint/message`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
              body: JSON.stringify({ submissionId: worker_id, content: message }),
            })
            actionsLog.push(`Messaged ${worker.name} via sprint`)
            resultContent = `Message sent to ${worker.name} via sprint channel.`
          } else {
            resultContent = `No contact method available for ${worker.name} in demo mode.`
          }

        } else {
          resultContent = `Unknown tool: ${block.name}`
        }
      } catch (err) {
        resultContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  if (!finalText) finalText = 'Done. Let me know if you need anything else.'

  // Mirror the exchange on Linq if the orchestrator has a number configured
  if (AGENT_PHONE && LINQ_KEY) {
    try {
      const newChatId = await linqSend(AGENT_PHONE, `User: ${userMessage}`, linqChatId ?? undefined)
      if (newChatId) await linqSend(AGENT_PHONE, `Agent: ${finalText}`, newChatId)
    } catch {
      // Non-fatal — Linq mirroring is best-effort
    }
  }

  return NextResponse.json({ reply: finalText, actions: actionsLog })
}
