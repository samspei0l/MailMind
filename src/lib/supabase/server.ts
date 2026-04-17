import { createServerComponentClient, createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// ============================================================
// SERVER COMPONENT Supabase (use in Server Components)
// ============================================================
export function createSupabaseServerClient() {
  return createServerComponentClient({ cookies });
}

// ============================================================
// SERVER ACTION Supabase (use in Server Actions)
// ============================================================
export function createSupabaseActionClient() {
  return createServerActionClient({ cookies });
}

// ============================================================
// ADMIN Supabase (bypasses RLS — use only in API routes)
// ============================================================
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
