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
  if (!chatId) return NextResponse.json({ messages: [] })

  try {
    const data = await linqFetch(`/chats/${chatId}/messages`)
    // API returns newest-first; reverse for chronological display
    const messages = (data.messages ?? []).slice().reverse()
    return NextResponse.json({ messages })
  } catch (err) {
    console.error('[linq/thread]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
