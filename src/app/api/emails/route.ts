import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { syncEmails, getEmails } from '@/lib/email/actions';
import type { EmailFilters } from '@/types';

// GET /api/emails - list emails with filters
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filters: EmailFilters = {
    priority: searchParams.get('priority') as EmailFilters['priority'] || undefined,
    category: searchParams.get('category') as EmailFilters['category'] || undefined,
    type: searchParams.get('type') as EmailFilters['type'] || undefined,
    requires_reply: searchParams.get('requires_reply') === 'true' ? true : searchParams.get('requires_reply') === 'false' ? false : undefined,
    sender: searchParams.get('sender') || undefined,
    date_from: searchParams.get('date_from') || undefined,
    date_to: searchParams.get('date_to') || undefined,
    search: searchParams.get('search') || undefined,
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50,
  };

  // Remove undefined keys
  Object.keys(filters).forEach((k) => {
    if (filters[k as keyof EmailFilters] === undefined) delete filters[k as keyof EmailFilters];
  });

  const result = await getEmails(user.id, filters);
  return NextResponse.json(result);
}

// POST /api/emails/sync - trigger email sync
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const maxResults = body.maxResults || 50;

  const result = await syncEmails(user.id, maxResults);
  return NextResponse.json(result);
}
