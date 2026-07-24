import { NextRequest, NextResponse } from 'next/server'

const BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const KEY  = process.env.LINQ_API_KEY ?? ''
const FROM = process.env.LINQ_FROM_NUMBER ?? ''

async function linqFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Linq ${res.status}: ${text}`)
  return JSON.parse(text)
}

export async function POST(req: NextRequest) {
  const { phone, content, chatId } = await req.json() as {
    phone: string
    content: string
    chatId?: string
  }
  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }

  try {
    let resultChatId: string

    if (chatId) {
      // Send to existing chat
      await linqFetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          message: { parts: [{ type: 'text', value: content }] },
        }),
      })
      resultChatId = chatId
    } else {
      // Create new chat
      if (!phone) return NextResponse.json({ error: 'phone required for new chat' }, { status: 400 })
      const to = phone.startsWith('+') ? phone : `+${phone}`
      const result = await linqFetch('/chats', {
        method: 'POST',
        body: JSON.stringify({
          from: FROM,
          to: [to],
          message: { parts: [{ type: 'text', value: content }] },
        }),
      })
      resultChatId = result.chat?.id
    }

    return NextResponse.json({ ok: true, chatId: resultChatId })
  } catch (err) {
    console.error('[linq/send]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
