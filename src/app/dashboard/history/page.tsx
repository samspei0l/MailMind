import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getThreads } from '@/lib/supabase/db';
import HistoryClient from '@/components/history/HistoryClient';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const threads = await getThreads(user.id, 200);
  return <HistoryClient initialThreads={threads} />;
}
