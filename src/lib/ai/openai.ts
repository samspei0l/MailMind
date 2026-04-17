import OpenAI from 'openai';
import type { AIEmailEnrichment, ActionPayload, ActionResult, EmailTone } from '@/types';
import { TONE_LABELS } from '@/types';

const zai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const MODEL = 'google/gemma-3n-e2b-it';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getText(response: OpenAI.Chat.ChatCompletion): string {
  return response.choices[0]?.message?.content ?? '';
}

// Extract JSON from a response that may contain markdown code fences
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return text.trim();
}

// Retry wrapper — handles 429 rate limits
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof OpenAI.APIError && err.status === 429;
      if (!isRateLimit || attempt === retries) throw err;
      const delay = 10000 * (attempt + 1); // 10s, 20s, 30s
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

// ---------------------------------------------------------------------------
// EMAIL ENRICHMENT
// ---------------------------------------------------------------------------
export async function enrichEmail(emailBody: string, subject: string, sender: string): Promise<AIEmailEnrichment> {
  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: 'Executive email assistant. Return ONLY valid JSON — no explanation, no markdown.',
      },
      {
        role: 'user',
        content: `Analyze this email and return JSON with exactly these fields:
{"summary":"2-3 sentences","priority":"HIGH|MEDIUM|LOW","category":"Sales|Client|Internal|Finance|Marketing|Other","type":"New Request|Reply Received|Quotation|Complaint|Update|Other","requires_reply":true|false,"intent":"...","suggested_reply":"..."}

From: ${sender}
Subject: ${subject}
Body: ${emailBody.substring(0, 3000)}`,
      },
    ],
  }));
  return JSON.parse(extractJson(getText(response))) as AIEmailEnrichment;
}

// ---------------------------------------------------------------------------
// INTENT PARSING — natural language → structured action
// ---------------------------------------------------------------------------
export async function parseUserIntent(userMessage: string): Promise<ActionPayload> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: `Convert email commands to JSON. Today: ${today}. Yesterday: ${yesterday}.
Return ONE of:
1. Filter:  {"action":"filter","filters":{"priority"?,"category"?,"type"?,"requires_reply"?,"sender"?,"date_from"?,"date_to"?,"search"?,"limit"?}}
2. Reply:   {"action":"reply","filters":{...},"message":"...","tone"?:"professional|friendly|formal|assertive|concise|apologetic|persuasive"}
3. Summary: {"action":"summary","date_range"?:"today|yesterday|this_week|last_week"}
4. Search:  {"action":"search","query":"..."}
5. Compose: {"action":"compose","prompt":"...","to"?:"email","tone"?:"professional|friendly|..."}
Return ONLY the JSON object. No markdown, no explanation.`,
      },
      { role: 'user', content: userMessage },
    ],
  }));

  try {
    return JSON.parse(extractJson(getText(response))) as ActionPayload;
  } catch {
    return { action: 'search', query: userMessage };
  }
}

// ---------------------------------------------------------------------------
// COMPOSE EMAIL — from natural language prompt + tone
// ---------------------------------------------------------------------------
export interface ComposedEmailContent {
  subject: string;
  body: string;
  to: string;
  cc?: string;
}

export async function composeEmail(options: {
  prompt: string;
  tone: EmailTone;
  fromEmail: string;
  to?: string;
  subject?: string;
  replyContext?: { originalSubject: string; originalSender: string; originalBody: string };
}): Promise<ComposedEmailContent> {
  const { prompt, tone, fromEmail, to, subject, replyContext } = options;
  const toneDesc = TONE_LABELS[tone]?.description || 'professional and clear';

  const systemPrompt = replyContext
    ? `You write email replies. From: ${fromEmail}. Tone: ${tone} (${toneDesc}).
Return ONLY JSON: {"subject":"Re: ...","body":"full reply body","to":"${replyContext.originalSender}","cc":""}
Sign off appropriately for the tone.`
    : `You are an AI email composer. From: ${fromEmail}. Tone: ${tone} (${toneDesc}).
Return ONLY JSON: {"subject":"generated subject","body":"full email body","to":"recipient email","cc":""}
- Extract recipient from prompt if mentioned, else use "${to || ''}"
- Generate subject unless provided
- Write complete email: greeting, content, sign-off`;

  const userContent = replyContext
    ? `Instruction: "${prompt}"\n\nOriginal email:\nFrom: ${replyContext.originalSender}\nSubject: ${replyContext.originalSubject}\nBody: ${replyContext.originalBody.substring(0, 2000)}`
    : `Instruction: "${prompt}"${subject ? `\nSubject hint: ${subject}` : ''}${to ? `\nRecipient: ${to}` : ''}`;

  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  }));

  const parsed = JSON.parse(extractJson(getText(response)));
  return {
    subject: parsed.subject || 'No Subject',
    body: parsed.body || '',
    to: parsed.to || to || '',
    cc: parsed.cc || undefined,
  };
}

// ---------------------------------------------------------------------------
// REPLY GENERATION — for existing emails (action handler)
// ---------------------------------------------------------------------------
export async function generateEmailReply(
  instruction: string,
  original: { subject: string; sender: string; body: string },
  tone: EmailTone = 'professional',
): Promise<string> {
  const toneDesc = TONE_LABELS[tone]?.description || 'professional';

  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `Write email replies. Tone: ${tone} (${toneDesc}). Body only — no subject line. Sign off appropriately.`,
      },
      {
        role: 'user',
        content: `Instruction: "${instruction}"\n\nOriginal:\nFrom: ${original.sender}\nSubject: ${original.subject}\nBody: ${original.body.substring(0, 2000)}`,
      },
    ],
  }));

  return getText(response) || 'Thank you for your email. I will get back to you shortly.';
}

// ---------------------------------------------------------------------------
// VOICE TRANSCRIPTION
// Z_AI does not support audio. Set OPENAI_WHISPER_KEY in .env.local
// to enable voice features with OpenAI Whisper.
// ---------------------------------------------------------------------------
export async function transcribeVoice(audioBuffer: Buffer, mimeType: string): Promise<{ transcript: string; duration: number }> {
  const whisperKey = process.env.OPENAI_WHISPER_KEY;
  if (!whisperKey) {
    throw new Error('Voice transcription is not available. Add OPENAI_WHISPER_KEY to .env.local with a valid OpenAI key.');
  }
  const whisper = new OpenAI({ apiKey: whisperKey });
  const audioFile = new File([new Uint8Array(audioBuffer)], 'voice.webm', { type: mimeType });
  const result = await whisper.audio.transcriptions.create({
    model: 'whisper-1', file: audioFile, language: 'en', response_format: 'verbose_json',
  });
  const duration = (result as unknown as { duration?: number }).duration ?? 0;
  return { transcript: result.text, duration };
}

// ---------------------------------------------------------------------------
// CHAT RESPONSE
// ---------------------------------------------------------------------------
export async function generateChatResponse(
  userMessage: string,
  actionResult: ActionResult,
  actionPayload: ActionPayload,
): Promise<string> {
  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content: 'Helpful AI email assistant. Give a friendly 1-2 sentence response. Be specific about what was done.',
      },
      {
        role: 'user',
        content: `User: "${userMessage}"\nResult: ${JSON.stringify({
          action: actionPayload.action,
          email_count: (actionResult.emails as unknown[])?.length || 0,
          summary: actionResult.summary,
          replies_sent: actionResult.replies_sent,
          compose_result: actionResult.compose_result,
          error: actionResult.error,
        })}`,
      },
    ],
  }));

  return getText(response) || 'Done.';
}

// ---------------------------------------------------------------------------
// DAILY SUMMARY
// ---------------------------------------------------------------------------
export async function generateDailySummary(
  emails: Array<{ subject: string; sender: string; summary: string; priority: string }>,
): Promise<string> {
  if (!emails.length) return 'No emails to summarise for this period.';

  const list = emails
    .slice(0, 30)
    .map((e, i) => `${i + 1}. [${e.priority}] ${e.sender}: ${e.subject} — ${e.summary}`)
    .join('\n');

  const response = await withRetry(() => zai.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: 'Executive assistant writing a daily email digest. Concise, highlight action items.',
      },
      {
        role: 'user',
        content: `Summarise ${emails.length} emails:\n${list}\n\nFormat: brief overview, then bullet points for HIGH priority items, then note about remaining emails.`,
      },
    ],
  }));

  return getText(response) || 'Unable to generate summary.';
}
