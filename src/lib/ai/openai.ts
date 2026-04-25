import type { AIEmailEnrichment, ActionPayload, ActionResult, EmailTone } from '@/types';
import { TONE_LABELS } from '@/types';
import { chatComplete } from './client';

// ============================================================
// EVERY function in this file now takes `userId` as its first
// argument. The AI call is routed through the per-user client
// (see ./client.ts) which reads the user's provider + key from
// the profiles table. MailMind no longer runs any shared LLM
// spend — each tester brings their own key at signup.
//
// Whisper is the exception: speech-to-text goes through the
// operator-supplied NVIDIA_API_KEY (see ./nvidia-whisper.ts)
// because not every supported LLM provider offers a Whisper
// endpoint. If that key is unset, voice features surface a
// friendly error and are disabled.
// ============================================================

// ---------------------------------------------------------------------------
// Helpers — JSON extraction from model output
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return text.trim();
}

// ---------------------------------------------------------------------------
// EMAIL ENRICHMENT
// ---------------------------------------------------------------------------
export async function enrichEmail(
  userId: string,
  emailBody: string,
  subject: string,
  sender: string,
): Promise<AIEmailEnrichment> {
  const text = await chatComplete(userId, {
    system: 'Executive email assistant. Return ONLY valid JSON — no explanation, no markdown.',
    user: `Analyze this email and return JSON with exactly these fields:
{"summary":"2-3 sentences","priority":"HIGH|MEDIUM|LOW","category":"Sales|Client|Internal|Finance|Marketing|Other","type":"New Request|Reply Received|Quotation|Complaint|Update|Other","requires_reply":true|false,"intent":"...","suggested_reply":"..."}

From: ${sender}
Subject: ${subject}
Body: ${emailBody.substring(0, 3000)}`,
    maxTokens: 1024,
  });
  return JSON.parse(extractJson(text)) as AIEmailEnrichment;
}

// ---------------------------------------------------------------------------
// INTENT PARSING — natural language → structured action
// ---------------------------------------------------------------------------
export async function parseUserIntent(userId: string, userMessage: string): Promise<ActionPayload> {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const text = await chatComplete(userId, {
    system: `Convert email commands to JSON. Today: ${today}. Yesterday: ${yesterday}.
Return ONE of:
1. Filter:       {"action":"filter","filters":{"priority"?,"category"?,"type"?,"requires_reply"?,"sender"?,"date_from"?,"date_to"?,"search"?,"limit"?}}
2. Reply:        {"action":"reply","filters":{...},"message":"...","tone"?:"professional|friendly|formal|assertive|concise|apologetic|persuasive"}
3. Summary:      {"action":"summary","date_range"?:"today|yesterday|this_week|last_week"}
4. Search:       {"action":"search","query":"..."}
5. Compose:      {"action":"compose","prompt":"...","to"?:"email","tone"?:"professional|friendly|..."}
6. Email action: {"action":"email_action","email_action":"trash|untrash|archive|unarchive|spam|not_spam|delete_forever|mark_read|mark_unread|star|unstar|block_sender|unblock_sender|unsubscribe","filters"?:{...},"sender_email"?:"..."}

Pick email_action when the user says delete / trash / archive / mark as spam / unsubscribe / block, etc. Use filters to describe which emails (e.g. category:"Marketing", sender:"@newsletter.com"). Use sender_email only for block_sender / unblock_sender. "delete" without further qualification means "trash" (reversible); only use delete_forever if the user explicitly says "permanently" or "forever".

Return ONLY the JSON object. No markdown, no explanation.`,
    user: userMessage,
    maxTokens: 512,
  });

  try {
    return JSON.parse(extractJson(text)) as ActionPayload;
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

export async function composeEmail(userId: string, options: {
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

  const text = await chatComplete(userId, {
    system: systemPrompt,
    user: userContent,
    maxTokens: 2048,
  });

  const parsed = JSON.parse(extractJson(text));
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
  userId: string,
  instruction: string,
  original: { subject: string; sender: string; body: string },
  tone: EmailTone = 'professional',
): Promise<string> {
  const toneDesc = TONE_LABELS[tone]?.description || 'professional';

  const text = await chatComplete(userId, {
    system: `Write email replies. Tone: ${tone} (${toneDesc}). Body only — no subject line. Sign off appropriately.`,
    user: `Instruction: "${instruction}"\n\nOriginal:\nFrom: ${original.sender}\nSubject: ${original.subject}\nBody: ${original.body.substring(0, 2000)}`,
    maxTokens: 1024,
  });

  return text || 'Thank you for your email. I will get back to you shortly.';
}


// ---------------------------------------------------------------------------
// CHAT RESPONSE
// ---------------------------------------------------------------------------
export async function generateChatResponse(
  userId: string,
  userMessage: string,
  actionResult: ActionResult,
  actionPayload: ActionPayload,
): Promise<string> {
  const text = await chatComplete(userId, {
    system: 'Helpful AI email assistant. Give a friendly 1-2 sentence response. Be specific about what was done.',
    user: `User: "${userMessage}"\nResult: ${JSON.stringify({
      action: actionPayload.action,
      email_count: (actionResult.emails as unknown[])?.length || 0,
      summary: actionResult.summary,
      replies_sent: actionResult.replies_sent,
      compose_result: actionResult.compose_result,
      action_result: actionResult.action_result,
      error: actionResult.error,
    })}`,
    maxTokens: 256,
  });

  return text || 'Done.';
}

// ---------------------------------------------------------------------------
// SIGNATURE EXTRACTION — find the user's recurring sign-off from recent sent mail
// ---------------------------------------------------------------------------
export async function extractSignatureFromEmails(
  userId: string,
  sentBodies: string[],
): Promise<string> {
  if (!sentBodies.length) return '';

  const tails = sentBodies
    .slice(0, 8)
    .map((b, i) => `--- Email ${i + 1} ---\n${b.slice(-600).trim()}`)
    .join('\n\n');

  const raw = await chatComplete(userId, {
    system:
      'You extract email signatures. Given the tails of several emails the same person sent, return ONLY the recurring signature block (name, title, contact details). Preserve line breaks. No commentary, no quotes. If no consistent signature exists, return the single word NONE.',
    user: `Find the repeating signature across these emails:\n\n${tails}`,
    maxTokens: 256,
  });

  const cleaned = raw.trim();
  if (!cleaned || cleaned === 'NONE' || cleaned.toUpperCase() === 'NONE') return '';
  return cleaned.replace(/^```[a-z]*\n?|```$/gi, '').replace(/^["']|["']$/g, '').trim();
}

// ---------------------------------------------------------------------------
// DAILY SUMMARY
// ---------------------------------------------------------------------------
export async function generateDailySummary(
  userId: string,
  emails: Array<{ subject: string; sender: string; summary: string; priority: string }>,
): Promise<string> {
  if (!emails.length) return 'No emails to summarise for this period.';

  const list = emails
    .slice(0, 30)
    .map((e, i) => `${i + 1}. [${e.priority}] ${e.sender}: ${e.subject} — ${e.summary}`)
    .join('\n');

  const text = await chatComplete(userId, {
    system: 'Executive assistant writing a daily email digest. Concise, highlight action items.',
    user: `Summarise ${emails.length} emails:\n${list}\n\nFormat: brief overview, then bullet points for HIGH priority items, then note about remaining emails.`,
    maxTokens: 1024,
  });

  return text || 'Unable to generate summary.';
}
