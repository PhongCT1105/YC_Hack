import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Combined health: sprint pipeline (db) + jobs/linq system (supabase).
// Each check is tolerant — one subsystem being down doesn't hide the other.
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  // Sprint pipeline (sprints/subtasks/findings on the primary client)
  try {
    const { error } = await db.from('sprints').select('id').limit(1)
    checks.sprints = { ok: !error, detail: error ? error.message : 'connected' }
  } catch (e) {
    checks.sprints = { ok: false, detail: String(e) }
  }

  // Jobs system (teammate's schema — may share the same project)
  try {
    const { error } = await supabase.from('jobs').select('id').limit(1)
    checks.jobs_table = { ok: !error, detail: error ? `${error.code}: ${error.message}` : 'jobs table reachable' }
  } catch (e) {
    checks.jobs_table = { ok: false, detail: String(e) }
  }

  try {
    const { error } = await supabase.from('agent_files').select('id').limit(1)
    checks.agent_files_table = { ok: !error, detail: error ? `${error.code}: ${error.message}` : 'agent_files table reachable' }
  } catch (e) {
    checks.agent_files_table = { ok: false, detail: String(e) }
  }

  // ok reflects the sprint pipeline (the live demo path); other checks are informational.
  return NextResponse.json({ ok: checks.sprints.ok, checks })
}
