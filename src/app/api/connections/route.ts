import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAllEmailConnections, updateConnectionNickname, removeEmailConnection } from '@/lib/supabase/db';

// GET /api/connections — list all connected accounts
export async function GET() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connections = await getAllEmailConnections(user.id);
  // Strip sensitive tokens before sending to client
  const safe = connections.map(({ access_token, refresh_token, ...rest }) => rest);
  return NextResponse.json({ connections: safe });
  // signature + signature_extracted_at pass through — the composer needs them to decide whether to show the toggle.
}

// PATCH /api/connections — update nickname
export async function PATCH(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, nickname } = await request.json();
  if (!id || !nickname) return NextResponse.json({ error: 'id and nickname required' }, { status: 400 });

  await updateConnectionNickname(id, user.id, nickname.trim());
  return NextResponse.json({ success: true });
}

// DELETE /api/connections — disconnect an account
export async function DELETE(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await removeEmailConnection(id, user.id);
  return NextResponse.json({ success: true });
}
