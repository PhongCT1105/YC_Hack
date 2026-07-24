import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  // 1. Env vars present
  checks.env = {
    ok: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    detail: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`
      : 'NEXT_PUBLIC_SUPABASE_URL is missing',
  }

  // 2. Can reach Supabase (query a known system table)
  try {
    const { error } = await supabase.from('jobs').select('id').limit(1)
    checks.jobs_table = {
      ok: !error,
      detail: error ? `${error.code}: ${error.message}` : 'jobs table reachable',
    }
  } catch (e) {
    checks.jobs_table = { ok: false, detail: String(e) }
  }

  // 3. Can reach agent_files table
  try {
    const { error } = await supabase.from('agent_files').select('id').limit(1)
    checks.agent_files_table = {
      ok: !error,
      detail: error ? `${error.code}: ${error.message}` : 'agent_files table reachable',
    }
  } catch (e) {
    checks.agent_files_table = { ok: false, detail: String(e) }
  }

  // 4. Write test — insert + delete a dummy row
  try {
    const { data, error: insertErr } = await supabase
      .from('jobs')
      .insert({ problem: '__health_check__', worker_count: 0, orchestrator_agent: {} })
      .select('id')
      .single()

    if (insertErr) throw insertErr

    const { error: deleteErr } = await supabase.from('jobs').delete().eq('id', data.id)
    checks.write = {
      ok: !deleteErr,
      detail: deleteErr ? `insert ok, delete failed: ${deleteErr.message}` : 'insert + delete succeeded',
    }
  } catch (e) {
    checks.write = { ok: false, detail: String(e) }
  }

  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 })
}
