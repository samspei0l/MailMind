import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { transcribeVoice } from '@/lib/ai/openai';
import { saveVoiceTranscription } from '@/lib/supabase/db';

// POST /api/voice/transcribe — transcribe audio and return the raw text.
//
// Unlike /api/voice (which pipes the transcript through the LLM to compose
// an email), this endpoint just does speech-to-text and returns the
// transcript. AI Chat uses it so the user can speak a query, review it in
// the composer, edit if needed, and hit Send themselves.
//
// Expects multipart/form-data with:
//   audio: Blob (webm, mp4, wav, …)

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }
    // 25 MB is NVIDIA Whisper's per-request cap.
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file too large (max 25MB)' }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || 'audio/webm';

    const { transcript, duration } = await transcribeVoice(audioBuffer, mimeType);

    // Log the transcription for audit / usage metrics (same table the email
    // voice flow writes to). Non-fatal if the insert fails — we'd rather
    // return the transcript than block the UI on a logging error.
    try {
      await saveVoiceTranscription({
        user_id: user.id,
        transcript,
        audio_duration_seconds: duration,
      });
    } catch {
      /* swallow — transcription itself succeeded */
    }

    return NextResponse.json({ transcript, duration });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
