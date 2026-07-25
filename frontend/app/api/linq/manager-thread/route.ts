import { NextRequest, NextResponse } from 'next/server'

const BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const KEY = process.env.LINQ_API_KEY ?? ''
const FROM = process.env.LINQ_FROM_NUMBER ?? ''
const MANAGER_PHONE = '+16473271398'

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

// GET: find the chat with the manager phone and return messages + chatId
export async function GET() {
  if (!KEY) return NextResponse.json({ messages: [], chatId: null })

  try {
    const data = await linqFetch('/chats')
    const chats: Record<string, unknown>[] = data.chats ?? data.items ?? data.data ?? []

    const managerDigits = MANAGER_PHONE.replace(/\D/g, '')
    const managerChat = chats.find((c) => {
      const handles: Record<string, unknown>[] = (c.handles ?? c.participants ?? c.members ?? []) as Record<string, unknown>[]
      return handles.some((p) => {
        const phone = String(p.handle ?? p.phone ?? p.number ?? '')
        return phone.replace(/\D/g, '').endsWith(managerDigits)
      })
    })

    if (!managerChat) return NextResponse.json({ messages: [], chatId: null })

    const msgs = await linqFetch(`/chats/${managerChat.id}/messages`)
    const messages = (msgs.messages ?? []).slice().reverse()
    return NextResponse.json({ messages, chatId: managerChat.id })
  } catch (err) {
    console.error('[linq/manager-thread GET]', err)
    return NextResponse.json({ messages: [], chatId: null, error: String(err) })
  }
}

// POST: send a message from the Linq number to the manager phone
export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: 'LINQ_API_KEY not set' }, { status: 500 })

  const { content, chatId } = await req.json() as { content: string; chatId?: string | null }
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })

  try {
    let resultChatId: string

    if (chatId) {
      await linqFetch(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: { parts: [{ type: 'text', value: content }] } }),
      })
      resultChatId = chatId
    } else {
      const result = await linqFetch('/chats', {
        method: 'POST',
        body: JSON.stringify({
          from: FROM,
          to: [MANAGER_PHONE],
          message: { parts: [{ type: 'text', value: content }] },
        }),
      })
      resultChatId = result.chat?.id
    }

    return NextResponse.json({ ok: true, chatId: resultChatId })
  } catch (err) {
    console.error('[linq/manager-thread POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
