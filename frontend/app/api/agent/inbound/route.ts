import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { MOCK_WORKERS } from '@/lib/mockWorkers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic()
const MODEL = 'claude-haiku-4-5-20251001'

const LINQ_BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const LINQ_KEY = process.env.LINQ_API_KEY ?? ''
const LINQ_FROM = process.env.LINQ_FROM_NUMBER ?? ''

async function linqReply(chatId: string, content: string) {
  if (!LINQ_KEY) return
  await fetch(`${LINQ_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { parts: [{ type: 'text', value: content }] } }),
  })
}

async function linqSendNew(toPhone: string, content: string) {
  if (!LINQ_KEY) return
  const to = toPhone.startsWith('+') ? toPhone : `+${toPhone}`
  await fetch(`${LINQ_BASE}/chats`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: LINQ_FROM,
      to: [to],
      message: { parts: [{ type: 'text', value: content }] },
    }),
  })
}

// Linq sends a POST webhook when a message arrives on the orchestrator's number.
// Expected payload shape (Linq partner API v3):
// { chatId: string, from: string, message: { parts: [{ type: 'text', value: string }] } }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })

  // Extract the inbound message
  const chatId: string = body.chatId ?? body.chat_id ?? ''
  const fromPhone: string = body.from ?? ''
  const textPart = (body.message?.parts ?? []).find(
    (p: { type: string; value?: string }) => p.type === 'text'
  )
  const userMessage: string = textPart?.value?.trim() ?? ''

  if (!userMessage) return NextResponse.json({ ok: true })

  // Build a quick worker context for the orchestrator
  const workerSummary = MOCK_WORKERS
    .map((w) => `- ${w.name} (${w.status}): ${w.subtaskTitle}`)
    .join('\n')

  const system =
    `You are the Minion HQ orchestrator agent. You coordinate a team of workers for the manager.\n\n` +
    `Workers:\n${workerSummary}\n\n` +
    `The manager is texting you via SMS. Respond helpfully and concisely (2–4 sentences). ` +
    `If you need to message a worker, say you will do so and describe the action you would take.`

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const reply = textBlock && textBlock.type === 'text'
      ? textBlock.text
      : 'Got it — I\'m on it.'

    // Reply back to the sender via Linq
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
