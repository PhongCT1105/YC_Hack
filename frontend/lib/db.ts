import { createClient } from '@supabase/supabase-js'

// Server-side only. Anon key is fine: RLS is disabled and this module is
// never imported from client components.
// global.fetch override: opt every request out of Next.js's Data Cache —
// polling routes must always see fresh rows.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  }
)
