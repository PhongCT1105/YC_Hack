import { createClient } from '@supabase/supabase-js'

// Server-side only. Anon key is fine: RLS is disabled and this module is
// never imported from client components.
export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)
