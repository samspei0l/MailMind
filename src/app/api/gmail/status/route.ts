import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getEmailConnection } from '@/lib/supabase/db';

export async function GET() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connection = await getEmailConnection(user.id, 'gmail');
  return NextResponse.json({
    connected: !!connection,
    email: connection?.email || null,
    last_sync_at: connection?.last_sync_at || null,
  });
}

export async function DELETE() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('email_connections')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('provider', 'gmail');

  return NextResponse.json({ success: true });
}
