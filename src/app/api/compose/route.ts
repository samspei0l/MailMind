import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { composeAndSend } from '@/lib/email/compose';
import { getComposedEmails } from '@/lib/supabase/db';
import type { ComposeRequest } from '@/types';

// POST /api/compose — compose and optionally send an email
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: ComposeRequest = await request.json();

  if (!body.prompt && !body.body_override) {
    return NextResponse.json({ error: 'prompt or body_override is required' }, { status: 400 });
  }
  if (!body.from_connection_id) {
    return NextResponse.json({ error: 'from_connection_id is required' }, { status: 400 });
  }

  const result = await composeAndSend(user.id, body);

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

// GET /api/compose — list composed/sent emails
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  const emails = await getComposedEmails(user.id, limit);
  return NextResponse.json({ emails });
}
