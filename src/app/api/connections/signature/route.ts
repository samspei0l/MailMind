import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getConnectionById, updateConnectionSignature } from '@/lib/supabase/db';
import { fetchGmailMessages } from '@/lib/email/gmail';
import { getValidAccessToken } from '@/lib/email/token';
import { extractSignatureFromEmails } from '@/lib/ai/openai';

// POST /api/connections/signature — pull the user's recent sent emails for a
// given connection, ask GPT to identify the recurring signature block, persist
// it on the connection. Returns the extracted signature (or empty string if
// the model couldn't find one).
//
// Body: { connection_id: string }
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connection_id } = await request.json();
  if (!connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

  const connection = await getConnectionById(connection_id, user.id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  if (connection.provider !== 'gmail') {
    return NextResponse.json({ error: 'Signature extraction currently supports Gmail only' }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(connection);
    const { messages } = await fetchGmailMessages(accessToken, connection.refresh_token || '', {
      maxResults: 10,
      query: 'in:sent',
    });

    const bodies = messages.map((m) => m.body).filter((b): b is string => !!b && b.length > 40);
    if (bodies.length === 0) {
      return NextResponse.json({ signature: '', message: 'No sent emails found to scan.' });
    }

    const signature = await extractSignatureFromEmails(user.id, bodies);
    await updateConnectionSignature(connection_id, user.id, signature || null);

    return NextResponse.json({
      signature,
      message: signature ? 'Signature detected and saved.' : 'Could not identify a consistent signature.',
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH /api/connections/signature — manually override the signature.
// Body: { connection_id: string, signature: string | null }
export async function PATCH(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connection_id, signature } = await request.json();
  if (!connection_id) return NextResponse.json({ error: 'connection_id required' }, { status: 400 });

  const connection = await getConnectionById(connection_id, user.id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const clean = typeof signature === 'string' ? signature.trim() : null;
  await updateConnectionSignature(connection_id, user.id, clean || null);
  return NextResponse.json({ signature: clean || '' });
}
