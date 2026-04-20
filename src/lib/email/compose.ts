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

  const tone: EmailTone = request.tone || detectToneFromPrompt(request.prompt || '');

  try {
    let composedContent;

    // 2a. body_override — user typed the body themselves (or reviewed an AI draft
    //     and is sending verbatim). Skip the AI entirely so we don't rewrite the
    //     text they just confirmed.
    if (request.body_override && request.body_override.trim()) {
      let subject = request.subject;
      let to = request.to || '';

      if (request.reply_to_email_id) {
        const originalEmail = await getEmailById(request.reply_to_email_id, userId);
        if (!originalEmail) return { error: 'Original email not found.' };
        subject = subject || (originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`);
        to = originalEmail.sender;
      }

      composedContent = {
        subject: subject || '(No Subject)',
        body: request.body_override,
        to,
        cc: request.cc,
      };
    } else if (request.reply_to_email_id) {
      // 2b. Reply via AI — load original for context
      const originalEmail = await getEmailById(request.reply_to_email_id, userId);
      if (!originalEmail) return { error: 'Original email not found.' };

      composedContent = await composeEmail(userId, {
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
      // 3. Compose a brand new email via AI
      composedContent = await composeEmail(userId, {
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

    // 5. If send_immediately, send via the provider.
    //    Safety net: never ship an empty-body email. If the AI comes back with
    //    no body (or only whitespace), fail loudly so the client shows an error
    //    instead of silently sending a blank message.
    if (request.send_immediately && !composedContent.body.trim()) {
      await updateComposedEmailStatus(draft.id, 'failed', { error_message: 'Empty body — nothing to send.' });
      return { error: "The draft came back empty. Click Generate and review the draft before sending." };
    }
    if (request.send_immediately) {
      if (connection.provider === 'gmail') {
        const accessToken = await getValidAccessToken(connection);

        let threadId: string | undefined;
        if (request.reply_to_email_id) {
          const originalEmail = await getEmailById(request.reply_to_email_id, userId);
          threadId = originalEmail?.thread_id || undefined;
        }

        // Append the saved signature unless the caller explicitly opted out.
        // Default is include_signature === true on the client, but we also
        // treat `undefined` as "include it" here so legacy callers keep working.
        const shouldAppendSignature = request.include_signature !== false;
        const signature = shouldAppendSignature ? (connection.signature || '').trim() : '';
        // Only append if the user hasn't already typed the signature into the
        // body — otherwise an AI draft that already includes the saved sign-off
        // would duplicate it.
        const bodyAlreadyHasSignature =
          signature && composedContent.body.trim().endsWith(signature);
        const bodyToSend = signature && !bodyAlreadyHasSignature
          ? `${composedContent.body.replace(/\s+$/, '')}\n\n${signature}`
          : composedContent.body;

        const { messageId } = await sendGmailReply(
          accessToken,
          connection.refresh_token || '',
          {
            to: composedContent.to,
            subject: composedContent.subject,
            body: bodyToSend,
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
