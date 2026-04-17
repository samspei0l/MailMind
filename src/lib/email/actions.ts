import { getEmailsByFilters, upsertEmails, updateEmailAI, logEmailReply, updateLastSync, getEmailConnection } from '@/lib/supabase/db';
import { enrichEmail, generateEmailReply, generateDailySummary } from '@/lib/ai/openai';
import { fetchGmailMessages, sendGmailReply } from '@/lib/email/gmail';
import type { Email, EmailFilters, EmailConnection, ActionResult, ReplyAction, SummaryAction } from '@/types';
import { subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, format } from 'date-fns';

// ============================================================
// GET EMAILS
// Fetch from DB with filters
// ============================================================

export async function getEmails(userId: string, filters: EmailFilters): Promise<ActionResult> {
  try {
    const emails = await getEmailsByFilters(userId, filters);
    return { emails, message: `Found ${emails.length} email${emails.length !== 1 ? 's' : ''}` };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// ============================================================
// SYNC EMAILS
// Pull from Gmail → store in DB → enrich with AI
// ============================================================

export async function syncEmailsForConnection(
  userId: string,
  connection: EmailConnection,
  maxResults = 50,
): Promise<{ synced: number; enriched: number; error?: string }> {
  try {
    const { messages } = await fetchGmailMessages(
      connection.access_token,
      connection.refresh_token || '',
      { maxResults }
    );

    if (messages.length === 0) {
      await updateLastSync(connection.id);
      return { synced: 0, enriched: 0 };
    }

    const emailRecords = messages.map((m) => ({
      user_id: userId,
      connection_id: connection.id,
      message_id: m.messageId,
      thread_id: m.threadId,
      sender: m.sender,
      sender_name: m.senderName,
      recipient: m.recipient,
      subject: m.subject,
      body: m.body,
      body_html: m.bodyHtml,
      snippet: m.snippet,
      is_read: m.isRead,
      is_starred: m.isStarred,
      labels: m.labels,
      received_at: m.receivedAt.toISOString(),
    }));

    const saved = await upsertEmails(emailRecords);
    await updateLastSync(connection.id);

    // Enrich emails that haven't been processed yet.
    // Capped at 5 per sync and throttled to ~8s apart to respect the
    // OpenRouter free tier limit of 8 requests/minute.
    const unenrichedEmails = (saved || [])
      .filter((e: Email) => !e.ai_processed_at && e.body)
      .slice(0, 5);

    let enriched = 0;
    for (const email of unenrichedEmails) {
      try {
        const result = await enrichEmail(email.body || email.snippet || '', email.subject, email.sender);
        await updateEmailAI(email.id, result);
        enriched++;
        if (enriched < unenrichedEmails.length) {
          await new Promise((r) => setTimeout(r, 8000));
        }
      } catch (err) {
        console.error(`Enrichment failed for email ${email.id}:`, err);
      }
    }

    return { synced: messages.length, enriched };
  } catch (error) {
    return { synced: 0, enriched: 0, error: (error as Error).message };
  }
}

export async function syncEmails(userId: string, maxResults = 50): Promise<{ synced: number; enriched: number; error?: string }> {
  const connection = await getEmailConnection(userId, 'gmail');
  if (!connection) return { synced: 0, enriched: 0, error: 'No Gmail connection found. Please connect your Gmail account.' };
  return syncEmailsForConnection(userId, connection, maxResults);
}

// ============================================================
// SEND REPLY
// Generate AI reply and send via Gmail
// ============================================================

export async function sendReply(
  userId: string,
  action: ReplyAction
): Promise<ActionResult> {
  const connection = await getEmailConnection(userId, 'gmail');
  if (!connection) return { error: 'No Gmail connection found.' };

  // Find matching emails
  const { emails, error: fetchError } = await getEmails(userId, action.filters);
  if (fetchError) return { error: fetchError };
  if (!emails || emails.length === 0) return { message: 'No matching emails found to reply to.' };

  let repliesSent = 0;
  const errors: string[] = [];

  for (const email of emails) {
    try {
      // Generate professional reply
      const replyBody = await generateEmailReply(action.message, {
        subject: email.subject,
        sender: email.sender,
        body: email.body || email.snippet || '',
      });

      // Send via Gmail
      await sendGmailReply(
        connection.access_token,
        connection.refresh_token || '',
        {
          to: email.sender,
          subject: email.subject,
          body: replyBody,
          threadId: email.thread_id || undefined,
        }
      );

      // Log the reply
      await logEmailReply({
        user_id: userId,
        email_id: email.id,
        thread_id: email.thread_id,
        subject: email.subject,
        body: replyBody,
        status: 'sent',
      });

      repliesSent++;
    } catch (err) {
      const msg = `Failed to reply to "${email.subject}": ${(err as Error).message}`;
      errors.push(msg);
      await logEmailReply({
        user_id: userId,
        email_id: email.id,
        thread_id: email.thread_id,
        subject: email.subject,
        body: '',
        status: 'failed',
        error_message: (err as Error).message,
      });
    }
  }

  return {
    replies_sent: repliesSent,
    message: `Sent ${repliesSent} reply${repliesSent !== 1 ? 's' : ''}${errors.length > 0 ? `. ${errors.length} failed.` : ''}`,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ============================================================
// GET SUMMARY
// Summarize emails in a date range
// ============================================================

export async function getSummary(userId: string, action: SummaryAction): Promise<ActionResult> {
  let dateFrom: string;
  let dateTo: string;
  const now = new Date();

  switch (action.date_range) {
    case 'today':
      dateFrom = format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
      dateTo = format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
      break;
    case 'yesterday':
      const yesterday = subDays(now, 1);
      dateFrom = format(startOfDay(yesterday), "yyyy-MM-dd'T'HH:mm:ss");
      dateTo = format(endOfDay(yesterday), "yyyy-MM-dd'T'HH:mm:ss");
      break;
    case 'this_week':
      dateFrom = format(startOfWeek(now), "yyyy-MM-dd'T'HH:mm:ss");
      dateTo = format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
      break;
    case 'last_week':
      const lastWeekStart = startOfWeek(subDays(now, 7));
      dateFrom = format(lastWeekStart, "yyyy-MM-dd'T'HH:mm:ss");
      dateTo = format(endOfWeek(lastWeekStart), "yyyy-MM-dd'T'HH:mm:ss");
      break;
    default:
      dateFrom = action.date_from || format(subDays(now, 1), "yyyy-MM-dd'T'HH:mm:ss");
      dateTo = action.date_to || format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
  }

  const emails = await getEmailsByFilters(userId, { date_from: dateFrom, date_to: dateTo, limit: 50 });

  const summaryEmails = emails.map((e) => ({
    subject: e.subject,
    sender: e.sender,
    summary: e.summary || e.snippet || '(no summary)',
    priority: e.priority || 'LOW',
  }));

  const summary = await generateDailySummary(summaryEmails);
  return { emails, summary };
}
