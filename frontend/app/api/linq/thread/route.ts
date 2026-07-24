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

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ messages: [] })

  try {
    const data = await linqFetch(`/conversations/${conversationId}/messages`)
    return NextResponse.json({ messages: data.messages ?? data })
  } catch (err) {
    console.error('[linq/thread]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
