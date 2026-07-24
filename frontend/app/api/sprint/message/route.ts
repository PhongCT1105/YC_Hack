import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (req.headers.get('x-admin-key') !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { submissionId, content } = await req.json().catch(() => ({}))
  if (!submissionId || !content) {
    return NextResponse.json({ error: 'submissionId and content required' }, { status: 400 })
  }

  const { data: participant } = await db.from('participants').select().eq('submission_id', submissionId).single()
  if (!participant) return NextResponse.json({ error: 'not joined' }, { status: 404 })

  const { error } = await db.from('messages').insert({ submission_id: submissionId, sender: 'agent', content })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
