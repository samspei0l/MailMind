import { getConnectionById, getEmailById, saveComposedEmail, updateComposedEmailStatus, saveVoiceTranscription } from '@/lib/supabase/db';
import { composeEmail, generateEmailReply, transcribeVoice } from '@/lib/ai/openai';
import { sendGmailReply } from '@/lib/email/gmail';
import { getValidAccessToken } from '@/lib/email/token';
import type { ComposeRequest, ComposeResult, EmailTone, ActionResult } from '@/types';

// ============================================================
// COMPOSE AND OPTIONALLY SEND A NEW EMAIL
// Core feature: AI generates subject + body from natural language prompt
// Sends from the exact connection the user selected
// ============================================================

export async function composeAndSend(
  userId: string,
  request: ComposeRequest
): Promise<ActionResult> {
  // 1. Load the "from" connection
  const connection = await getConnectionById(request.from_connection_id, userId);
  if (!connection) {
    return { error: 'Selected email account not found. Please reconnect it in Settings.' };
  }

  const tone: EmailTone = request.tone || detectToneFromPrompt(request.prompt);

  try {
    let composedContent;

    // 2. If this is a reply to an existing email, load it for context
    if (request.reply_to_email_id) {
      const originalEmail = await getEmailById(request.reply_to_email_id, userId);
      if (!originalEmail) return { error: 'Original email not found.' };

      composedContent = await composeEmail({
        prompt: request.prompt,
        tone,
        fromEmail: connection.email,
        replyContext: {
          originalSubject: originalEmail.subject,
          originalSender: originalEmail.sender,
          originalBody: originalEmail.body || originalEmail.snippet || '',
        },
      });

      // Ensure reply goes back to the original sender
      composedContent.to = originalEmail.sender;
    } else {
      // 3. Compose a brand new email
      composedContent = await composeEmail({
        prompt: request.prompt,
        tone,
        fromEmail: connection.email,
        to: request.to,
        subject: request.subject,
      });
    }

    // 4. Save as draft first
    const draft = await saveComposedEmail({
      user_id: userId,
      connection_id: connection.id,
      from_email: connection.email,
      to_email: composedContent.to,
      cc: request.cc || composedContent.cc || null,
      subject: composedContent.subject,
      body: composedContent.body,
      prompt: request.prompt,
      tone,
      status: 'draft',
    });

    const result: ComposeResult = {
      subject: composedContent.subject,
      body: composedContent.body,
      to: composedContent.to,
      cc: composedContent.cc,
      tone,
      from_email: connection.email,
      composed_email_id: draft.id,
      sent: false,
    };

    // 5. If send_immediately, send via the provider
    if (request.send_immediately) {
      if (connection.provider === 'gmail') {
        const accessToken = await getValidAccessToken(connection);

        let threadId: string | undefined;
        if (request.reply_to_email_id) {
          const originalEmail = await getEmailById(request.reply_to_email_id, userId);
          threadId = originalEmail?.thread_id || undefined;
        }

        const { messageId } = await sendGmailReply(
          accessToken,
          connection.refresh_token || '',
          {
            to: composedContent.to,
            subject: composedContent.subject,
            body: composedContent.body,
            threadId,
          }
        );

        await updateComposedEmailStatus(draft.id, 'sent', { sent_message_id: messageId });
        result.sent = true;
      }
      // Outlook support: add provider === 'outlook' branch here
    }

    return {
      compose_result: result,
      message: result.sent
        ? `Email sent from ${connection.email} to ${composedContent.to}`
        : `Email drafted successfully`,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ============================================================
// VOICE TO EMAIL
// Transcribes audio then pipes through composeAndSend
// ============================================================

export async function voiceToEmail(
  userId: string,
  audioBuffer: Buffer,
  mimeType: string,
  fromConnectionId: string,
  sendImmediately = false
): Promise<ActionResult> {
  try {
    const { transcript, duration } = await transcribeVoice(audioBuffer, mimeType);

    // Save transcription for audit
    await saveVoiceTranscription({
      user_id: userId,
      transcript,
      audio_duration_seconds: duration,
    });

    // Detect tone from voice transcript automatically
    const tone = detectToneFromPrompt(transcript);

    // Compose the email from the transcript
    const result = await composeAndSend(userId, {
      prompt: transcript,
      tone,
      from_connection_id: fromConnectionId,
      send_immediately: sendImmediately,
    });

    // Link transcription to composed email if available
    if (result.compose_result?.composed_email_id) {
      await saveVoiceTranscription({
        user_id: userId,
        transcript,
        audio_duration_seconds: duration,
        composed_email_id: result.compose_result.composed_email_id,
      });
    }

    return result;
  } catch (err) {
    return { error: `Voice processing failed: ${(err as Error).message}` };
  }
}

// ============================================================
// TONE DETECTION — extracts tone keywords from prompt
// ============================================================

export function detectToneFromPrompt(prompt: string): EmailTone {
  const lower = prompt.toLowerCase();
  if (lower.match(/\b(formal|official|executive|c-suite|board)\b/)) return 'formal';
  if (lower.match(/\b(friendly|casual|warm|personal|hey|hi there)\b/)) return 'friendly';
  if (lower.match(/\b(assertive|firm|direct|strong|demand)\b/)) return 'assertive';
  if (lower.match(/\b(brief|short|quick|concise|tl;dr|tldr)\b/)) return 'concise';
  if (lower.match(/\b(sorry|apologise|apology|apologies|regret)\b/)) return 'apologetic';
  if (lower.match(/\b(persuade|convince|sell|pitch|proposal)\b/)) return 'persuasive';
  return 'professional';
}
