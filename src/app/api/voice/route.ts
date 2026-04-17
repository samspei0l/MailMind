import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { voiceToEmail } from '@/lib/email/compose';

// POST /api/voice — receive audio blob, transcribe, compose email
// Expects multipart/form-data with:
//   audio: Blob (webm, mp4, wav, etc.)
//   from_connection_id: string
//   send_immediately: "true" | "false"

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const fromConnectionId = formData.get('from_connection_id') as string | null;
    const sendImmediately = formData.get('send_immediately') === 'true';

    if (!audioFile) return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    if (!fromConnectionId) return NextResponse.json({ error: 'from_connection_id is required' }, { status: 400 });

    // Validate file size (max 25MB — Whisper limit)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file too large (max 25MB)' }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || 'audio/webm';

    const result = await voiceToEmail(user.id, audioBuffer, mimeType, fromConnectionId, sendImmediately);

    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
