import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getProfile, updateSyncFrequency } from '@/lib/supabase/db';

const ALLOWED_FREQUENCIES = new Set([5, 15, 30, 60]);

export async function GET() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile(user.id);
  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sync_frequency_minutes } = await request.json();

  if (sync_frequency_minutes !== null && !ALLOWED_FREQUENCIES.has(sync_frequency_minutes)) {
    return NextResponse.json({ error: 'Invalid sync frequency' }, { status: 400 });
  }

  await updateSyncFrequency(user.id, sync_frequency_minutes);
  return NextResponse.json({ success: true });
}
