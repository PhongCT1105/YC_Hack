import { NextRequest, NextResponse } from 'next/server'

const BASE = process.env.LINQ_API_URL ?? 'https://api.linqapp.com/api/partner/v3'
const KEY  = process.env.LINQ_API_KEY ?? ''

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

export async function GET(req: NextRequest) {
  const chatId = req.nextUrl.searchParams.get('chatId')
  const phone = req.nextUrl.searchParams.get('phone')

  if (!chatId && !phone) return NextResponse.json({ messages: [], chatId: null })

  try {
    let resolvedChatId = chatId

    if (!resolvedChatId && phone) {
      const data = await linqFetch('/chats')
      const chats: Record<string, unknown>[] = data.chats ?? data.items ?? data.data ?? []
      const digits = phone.replace(/\D/g, '')
      const found = chats.find((c) => {
        const handles = (c.handles ?? c.participants ?? c.members ?? []) as Record<string, unknown>[]
        return handles.some((p) => {
          const ph = String(p.handle ?? p.phone ?? p.number ?? '')
          return ph.replace(/\D/g, '').endsWith(digits)
        })
      })
      if (!found) return NextResponse.json({ messages: [], chatId: null })
      resolvedChatId = found.id as string
    }

    const data = await linqFetch(`/chats/${resolvedChatId}/messages`)
    const messages = (data.messages ?? []).slice().reverse()
    return NextResponse.json({ messages, chatId: resolvedChatId })
  } catch (err) {
    console.error('[linq/thread]', err)
    return NextResponse.json({ error: String(err), messages: [], chatId: null }, { status: 500 })
  }
}
