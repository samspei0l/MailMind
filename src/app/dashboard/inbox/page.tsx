import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getEmailsByFilters } from '@/lib/supabase/db';
import InboxClient from '@/components/inbox/InboxClient';

export const dynamic = 'force-dynamic';

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { priority?: string; category?: string; type?: string; requires_reply?: string; search?: string };
}) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const filters = {
    priority: searchParams.priority as any,
    category: searchParams.category as any,
    type: searchParams.type as any,
    requires_reply: searchParams.requires_reply === 'true' ? true : searchParams.requires_reply === 'false' ? false : undefined,
    search: searchParams.search,
    direction: 'received' as const,
    limit: 50,
  };

  // Clean undefined
  Object.keys(filters).forEach((k) => {
    if ((filters as any)[k] === undefined) delete (filters as any)[k];
  });

  const emails = await getEmailsByFilters(user.id, filters);

  return <InboxClient initialEmails={emails} initialFilters={filters} />;
}
