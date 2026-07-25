import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()
const MODEL = 'claude-haiku-4-5-20251001'

const LINQ_BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const LINQ_KEY = process.env.LINQ_API_KEY ?? ''
const LINQ_FROM = process.env.LINQ_FROM_NUMBER ?? ''

async function linqFetch(path: string) {
  const res = await fetch(`${LINQ_BASE}${path}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${LINQ_KEY}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Linq ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function linqReply(chatId: string, content: string) {
  if (!LINQ_KEY) return
  await fetch(`${LINQ_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { parts: [{ type: 'text', value: content }] } }),
  })
}

async function linqSendNew(toPhone: string, content: string) {
  if (!LINQ_KEY) return
  const to = toPhone.startsWith('+') ? toPhone : `+${toPhone}`
  await fetch(`${LINQ_BASE}/chats`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LINQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: LINQ_FROM,
      to: [to],
      message: { parts: [{ type: 'text', value: content }] },
    }),
  })
}

type ClaudeMessage = { role: 'user' | 'assistant'; content: string }

// Fetch the Linq thread and map to Claude's message format.
// is_from_me=true  → assistant (the agent's number sent this)
// is_from_me=false → user     (the manager / worker texted in)
async function buildThreadHistory(chatId: string): Promise<ClaudeMessage[]> {
  try {
    const data = await linqFetch(`/chats/${chatId}/messages`)
    const raw: { is_from_me: boolean; parts: { type: string; value?: string }[] }[] =
      (data.messages ?? []).slice().reverse() // oldest first

    const messages: ClaudeMessage[] = []
    for (const msg of raw) {
      const text = (msg.parts ?? []).find((p) => p.type === 'text')?.value ?? ''
      if (!text) continue
      const role: 'user' | 'assistant' = msg.is_from_me ? 'assistant' : 'user'
      // Merge consecutive same-role messages (back-to-back texts)
      const last = messages[messages.length - 1]
      if (last && last.role === role) {
        last.content += '\n' + text
      } else {
        messages.push({ role, content: text })
      }
    }
    return messages
  } catch {
    return []
  }
}

// Pull the most recent sprint + worker status from Supabase for the system prompt.
async function buildSprintContext(): Promise<string> {
  try {
    const { data: sprint } = await db
      .from('sprints')
      .select('id, question')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sprint) return 'No active sprint.'

    const [{ data: participants }, { data: subtasks }] = await Promise.all([
      db.from('participants').select('submission_id, codename, status').eq('sprint_id', sprint.id).order('joined_at'),
      db.from('subtasks').select('claimed_by, title, status').eq('sprint_id', sprint.id),
    ])

    const workerLines = (participants ?? [])
      .map((p) => {
        const st = (subtasks ?? []).find((s) => s.claimed_by === p.submission_id)
        return `- ${p.codename}: ${st?.title ?? 'awaiting assignment'} [${st?.status ?? p.status}]`
      })
      .join('\n')

    return `Sprint question: "${sprint.question}"\n\nWorkers:\n${workerLines || 'No workers yet.'}`
  } catch {
    return 'Worker context unavailable.'
  }
}

// Linq sends a POST webhook when a message arrives on the agent's number.
// Payload shape (Linq partner API v3):
// { chatId: string, from: string, message: { parts: [{ type: 'text', value: string }] } }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  const chatId: string = body.chatId ?? body.chat_id ?? ''
  const fromPhone: string = body.from ?? ''
  const textPart = (body.message?.parts ?? []).find(
    (p: { type: string; value?: string }) => p.type === 'text'
  )
  const userMessage: string = textPart?.value?.trim() ?? ''

  if (!userMessage) return NextResponse.json({ ok: true })

  // Fetch thread history + sprint context in parallel
  const [threadHistory, sprintContext] = await Promise.all([
    chatId ? buildThreadHistory(chatId) : Promise.resolve([]),
    buildSprintContext(),
  ])

  const system =
    `You are the Minion HQ orchestrator agent. You coordinate a team of workers for the manager.\n\n` +
    `${sprintContext}\n\n` +
    `The manager is texting you via SMS. Respond helpfully and concisely (2–4 sentences). ` +
    `If you need to message a worker, say you will do so and describe the action you would take.`

  // The Linq thread already includes the incoming message (webhook fires after save),
  // so use it directly. Fall back to just the new message if the fetch failed.
  let messages: ClaudeMessage[]
  if (threadHistory.length > 0 && threadHistory[threadHistory.length - 1].role === 'user') {
    messages = threadHistory
  } else if (threadHistory.length > 0) {
    messages = [...threadHistory, { role: 'user', content: userMessage }]
  } else {
    messages = [{ role: 'user', content: userMessage }]
  }

  // Claude requires the first message to be from the user
  if (messages[0]?.role === 'assistant') {
    messages = messages.slice(1)
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      messages,
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const reply = textBlock && textBlock.type === 'text' ? textBlock.text : "Got it — I'm on it."

    if (chatId) {
      await linqReply(chatId, reply)
    } else if (fromPhone) {
      await linqSendNew(fromPhone, reply)
    }
  } catch (err) {
    console.error('[agent/inbound]', err)
    if (chatId) {
      await linqReply(chatId, 'Sorry, I hit an error. Please try again.')
    }
  }

  return NextResponse.json({ ok: true })
}
