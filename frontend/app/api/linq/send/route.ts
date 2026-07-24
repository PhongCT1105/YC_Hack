import { NextRequest, NextResponse } from 'next/server'

const BASE = process.env.LINQ_API_URL ?? 'https://api.linq.com/v1'
const KEY  = process.env.LINQ_API_KEY ?? ''

async function linqFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
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
  const { phone, content, conversationId } = await req.json() as {
    phone: string
    content: string
    conversationId?: string
  }
  if (!phone || !content) {
    return NextResponse.json({ error: 'phone and content required' }, { status: 400 })
  }

  try {
    let convId = conversationId

    // Create a new conversation if we don't have one yet
    if (!convId) {
      const created = await linqFetch('/conversations', {
        method: 'POST',
        body: JSON.stringify({ participant_id: phone }),
      })
      convId = created.id as string
    }

    const msg = await linqFetch(`/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, sender_type: 'agent' }),
    })

    return NextResponse.json({ ok: true, conversationId: convId, message: msg })
  } catch (err) {
    console.error('[linq/send]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
