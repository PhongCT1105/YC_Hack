import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const { error } = await db.from('sprints').select('id').limit(1)
  return NextResponse.json({ ok: !error, db: error ? error.message : 'connected' })
}
