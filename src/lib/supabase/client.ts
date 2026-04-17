import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// ============================================================
// CLIENT-SIDE Supabase (use in Client Components only)
// ============================================================
export function createSupabaseClient() {
  return createClientComponentClient();
}
