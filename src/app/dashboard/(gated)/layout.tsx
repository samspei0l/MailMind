import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAIConfigForUser } from '@/lib/supabase/db';

// Gate — applies to every dashboard route except /dashboard/setup, which
// lives outside this route group. Users without a valid AI key are bounced
// to /dashboard/setup so the BYOK onboarding cannot be skipped.
export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/auth/login');

  const cfg = await getAIConfigForUser(session.user.id);
  if (!cfg?.has_key) redirect('/dashboard/setup');

  return <>{children}</>;
}
