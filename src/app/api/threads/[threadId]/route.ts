import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getThreadMessages } from '@/lib/supabase/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const messages = await getThreadMessages(user.id, params.threadId);
  return NextResponse.json({ messages });
}
