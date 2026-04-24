/**
 * NVIDIA Whisper (whisper-large-v3) transcription.
 *
 * NVIDIA hosts Whisper on an OpenAI-compatible endpoint at
 *   POST https://integrate.api.nvidia.com/v1/audio/transcriptions
 * with the usual multipart/form-data payload (file + model). We keep the
 * implementation plain-fetch rather than going through the openai SDK so
 * the dependency footprint stays small and we can tune the request
 * shape if NVIDIA's variant ever diverges.
 *
 * Config:
 *   process.env.NVIDIA_API_KEY  — nvapi-… token from build.nvidia.com
 *
 * Returns the same shape as the old OpenAI transcriber so callers don't
 * need to change.
 */

const NVIDIA_TRANSCRIBE_URL = 'https://integrate.api.nvidia.com/v1/audio/transcriptions';
const MODEL = 'openai/whisper-large-v3';

export async function transcribeWithNvidia(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{ transcript: string; duration: number }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Voice transcription is not available. Add NVIDIA_API_KEY to .env.local (get one at build.nvidia.com).',
    );
  }

  // Pick a sensible filename extension so NVIDIA's content-type sniffing
  // lines up with the bytes we send. The browser records webm/opus by
  // default; we keep the original mime and let Whisper decode it.
  const ext = extensionFor(mimeType);
  const filename = `voice.${ext}`;

  // Node's Blob/File constructors are globally available in Next 14's
  // runtime, so we can build multipart/form-data without `form-data` pkg.
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', MODEL);
  form.append('language', 'en');
  // verbose_json gives us `duration` which the compose pipeline logs for
  // billing/analytics. If NVIDIA drops this field we just default to 0.
  form.append('response_format', 'verbose_json');

  const res = await fetch(NVIDIA_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  });

  if (!res.ok) {
    // Read once as text so we can surface NVIDIA's error payload whether
    // it's plaintext or JSON. Most failures we've seen: 401 (bad key),
    // 415 (unsupported audio format), 429 (rate limit), 413 (too big).
    const raw = await res.text().catch(() => '');
    let detail = raw;
    try { detail = JSON.parse(raw)?.detail || JSON.parse(raw)?.error?.message || raw; } catch { /* raw */ }
    throw new Error(`NVIDIA Whisper ${res.status}: ${detail || res.statusText}`);
  }

  const data = (await res.json()) as { text?: string; duration?: number };
  const transcript = (data.text || '').trim();
  if (!transcript) {
    throw new Error('NVIDIA Whisper returned an empty transcript. Was the recording audible?');
  }
  return { transcript, duration: data.duration ?? 0 };
}

function extensionFor(mimeType: string): string {
  // Only the first token (before any ;codecs=…) matters.
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/webm': return 'webm';
    case 'audio/ogg':  return 'ogg';
    case 'audio/mp4':
    case 'audio/m4a':  return 'm4a';
    case 'audio/mpeg':
    case 'audio/mp3':  return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave': return 'wav';
    case 'audio/flac': return 'flac';
    default:           return 'webm';
  }
}
