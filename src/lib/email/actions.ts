import {
  getEmailsByFilters, upsertEmails, updateEmailAI, logEmailReply, updateLastSync,
  getEmailConnection, getAllEmailConnections, getConnectionById, getExistingMessageIds,
  updateEmailFlags, deleteEmailsByIds, getEmailsByIds, getEmailsBySender,
  insertBlockedSender, deleteBlockedSendersByEmail,
} from '@/lib/supabase/db';
import { enrichEmail, generateEmailReply, generateDailySummary } from '@/lib/ai/openai';
import {
  fetchGmailMessages, sendGmailReply,
  trashGmailMessages, untrashGmailMessages, deleteGmailMessagesPermanently,
  markGmailAsSpam, markGmailNotSpam, archiveGmailMessages, unarchiveGmailMessages,
  markGmailRead, markGmailUnread, starGmailMessages, unstarGmailMessages,
  createGmailBlockFilter, deleteGmailFilter, sendGmailUnsubscribeEmail,
} from '@/lib/email/gmail';
import type {
  Email, EmailFilters, EmailConnection, ActionResult, ReplyAction, SummaryAction,
  EmailActionRequest, EmailActionResult,
} from '@/types';
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
): Promise<{ synced: number; newEmails: number; enriched: number; error?: string }> {
  try {
    // Pull received + sent in parallel so the History page can show full threads
    const [inboxRes, sentRes] = await Promise.all([
      fetchGmailMessages(connection.access_token, connection.refresh_token || '', { maxResults, query: 'in:inbox' }),
      fetchGmailMessages(connection.access_token, connection.refresh_token || '', { maxResults, query: 'in:sent' }),
    ]);

    const messages = [
      ...inboxRes.messages.map((m) => ({ ...m, direction: 'received' as const })),
      ...sentRes.messages.map((m) => ({ ...m, direction: 'sent' as const })),
    ];

    if (messages.length === 0) {
      await updateLastSync(connection.id);
      return { synced: 0, newEmails: 0, enriched: 0 };
    }

    // Count genuinely new messages before upsert. Gmail always returns the
    // latest N — without this check `synced` would be N every time and we
    // couldn't tell the user "you're already up to date."
    const existingIds = await getExistingMessageIds(userId, messages.map((m) => m.messageId));
    const newEmails = messages.filter((m) => !existingIds.has(m.messageId)).length;

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
      direction: m.direction,
      unsubscribe_url: m.unsubscribeUrl,
      unsubscribe_mailto: m.unsubscribeMailto,
      attachments: m.attachments || [],
    }));

    const saved = await upsertEmails(emailRecords);
    await updateLastSync(connection.id);

    // Enrich emails that haven't been processed yet. Capped at 5 per sync and
    // run in parallel — withRetry() backs off on 429 if NVIDIA rate-limits us.
    // Sent emails skip enrichment (no need to categorize your own outgoing).
    const unenrichedEmails = (saved || [])
      .filter((e: Email) => !e.ai_processed_at && e.body && e.direction !== 'sent')
      .slice(0, 5);

    const results = await Promise.allSettled(
      unenrichedEmails.map(async (email) => {
        const result = await enrichEmail(userId, email.body || email.snippet || '', email.subject, email.sender);
        await updateEmailAI(email.id, result);
      })
    );
    const enriched = results.filter((r) => r.status === 'fulfilled').length;
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`Enrichment failed for email ${unenrichedEmails[i].id}:`, r.reason);
    });

    return { synced: messages.length, newEmails, enriched };
  } catch (error) {
    return { synced: 0, newEmails: 0, enriched: 0, error: (error as Error).message };
  }
}

export async function syncEmails(userId: string, maxResults = 50): Promise<{ synced: number; newEmails: number; enriched: number; error?: string }> {
  const connection = await getEmailConnection(userId, 'gmail');
  if (!connection) return { synced: 0, newEmails: 0, enriched: 0, error: 'No Gmail connection found. Please connect your Gmail account.' };
  return syncEmailsForConnection(userId, connection, maxResults);
}

// Sync every active connection in parallel. Used by the "Sync All Inboxes"
// button so users with multiple accounts pull them all in one click.
export async function syncAllEmails(userId: string, maxResults = 50): Promise<{ synced: number; newEmails: number; enriched: number; accounts: number; error?: string }> {
  const connections = await getAllEmailConnections(userId);
  if (connections.length === 0) {
    return { synced: 0, newEmails: 0, enriched: 0, accounts: 0, error: 'No email accounts connected.' };
  }

  const results = await Promise.allSettled(
    connections.map((c) => syncEmailsForConnection(userId, c, maxResults))
  );

  let synced = 0;
  let newEmails = 0;
  let enriched = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      synced += r.value.synced;
      newEmails += r.value.newEmails;
      enriched += r.value.enriched;
      if (r.value.error) errors.push(r.value.error);
    } else {
      errors.push((r.reason as Error).message);
    }
  }

  return { synced, newEmails, enriched, accounts: connections.length, error: errors.length ? errors.join('; ') : undefined };
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
      const replyBody = await generateEmailReply(userId, action.message, {
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

  const summary = await generateDailySummary(userId, summaryEmails);
  return { emails, summary };
}

// ============================================================
// MAILBOX ACTIONS — trash / spam / archive / delete / block / unsubscribe
// ============================================================
//
// All mailbox mutations route through here. Responsibilities:
//   1. Resolve the operand set (by email_ids, by sender_email, or by
//      filters for chat commands like "delete all marketing emails").
//   2. Fire the equivalent Gmail API call, grouped by the connection
//      that owns each message (multi-account users have different
//      access tokens per account).
//   3. Mirror the result on the DB side via soft-delete flag columns
//      so the inbox query can hide trashed/spam/archived rows without
//      a second round-trip to Gmail.
//
// Failures are partial by design — if Gmail accepts 9 of 10 ids we
// still update the 9 in our DB and surface `failed: 1` to the user.

type ConnBuckets = Map<string, { connection: EmailConnection; messageIds: string[]; rowIds: string[] }>;

async function bucketByConnection(userId: string, emails: Email[]): Promise<ConnBuckets> {
  const buckets: ConnBuckets = new Map();
  const connCache = new Map<string, EmailConnection | null>();
  for (const e of emails) {
    if (!e.connection_id) continue;
    if (!connCache.has(e.connection_id)) {
      connCache.set(e.connection_id, await getConnectionById(e.connection_id, userId));
    }
    const conn = connCache.get(e.connection_id);
    if (!conn) continue;
    const key = conn.id;
    const entry = buckets.get(key) || { connection: conn, messageIds: [], rowIds: [] };
    entry.messageIds.push(e.message_id);
    entry.rowIds.push(e.id);
    buckets.set(key, entry);
  }
  return buckets;
}

type GmailOp = (accessToken: string, refreshToken: string, ids: string[]) => Promise<{ affected: number; failed: number }>;

// Shared path for the label-flip actions (trash/spam/archive/read/star +
// their inverses). Runs the Gmail op per-connection, then updates the DB
// flag columns in one shot for every row Gmail accepted.
async function runLabelAction(
  userId: string,
  emails: Email[],
  gmailOp: GmailOp,
  dbFlags: Parameters<typeof updateEmailFlags>[2],
): Promise<EmailActionResult> {
  const buckets = await bucketByConnection(userId, emails);
  if (buckets.size === 0) return { ok: false, affected: 0, error: 'No matching emails with an active connection.' };

  let affected = 0;
  let failed = 0;
  const succeededRowIds: string[] = [];

  for (const { connection, messageIds, rowIds } of Array.from(buckets.values())) {
    try {
      const res = await gmailOp(connection.access_token, connection.refresh_token || '', messageIds);
      affected += res.affected;
      failed += res.failed;
      // Best-effort: we don't get per-id status back, so if any succeeded we
      // flip DB flags for the whole bucket. The Gmail state is the source of
      // truth — on next sync any mismatched row will re-converge.
      if (res.affected > 0) succeededRowIds.push(...rowIds);
    } catch (err) {
      failed += messageIds.length;
      console.error('runLabelAction bucket failed:', (err as Error).message);
    }
  }

  if (succeededRowIds.length) {
    await updateEmailFlags(userId, succeededRowIds, dbFlags);
  }
  return { ok: affected > 0, affected, failed };
}

// Resolve the operand emails from whichever of {email_ids, sender_email,
// filters} the caller supplied. Chat usually supplies filters + sender; the
// UI usually supplies a single email_id.
async function resolveOperandEmails(userId: string, req: EmailActionRequest & { filters?: EmailFilters }): Promise<Email[]> {
  if (req.email_ids?.length) {
    return getEmailsByIds(userId, req.email_ids);
  }
  if (req.sender_email) {
    return getEmailsBySender(userId, req.sender_email, req.connection_id);
  }
  if (req.filters) {
    // The chat layer passes filters when user says "delete all marketing emails".
    // Default limit keeps runaway deletes bounded; user can re-run if more.
    return getEmailsByFilters(userId, { ...req.filters, limit: req.filters.limit || 100 });
  }
  return [];
}

export async function executeEmailAction(
  userId: string,
  req: EmailActionRequest & { filters?: EmailFilters },
): Promise<EmailActionResult> {
  try {
    // --- block / unblock: special path. Can work with or without email_ids ---
    if (req.action === 'block_sender') return blockSender(userId, req);
    if (req.action === 'unblock_sender') return unblockSender(userId, req);

    const emails = await resolveOperandEmails(userId, req);
    if (emails.length === 0) {
      return { ok: false, affected: 0, message: 'No matching emails found.' };
    }

    switch (req.action) {
      case 'mark_read':
        return runLabelAction(userId, emails, markGmailRead, { is_read: true });
      case 'mark_unread':
        return runLabelAction(userId, emails, markGmailUnread, { is_read: false });
      case 'star':
        return runLabelAction(userId, emails, starGmailMessages, { is_starred: true });
      case 'unstar':
        return runLabelAction(userId, emails, unstarGmailMessages, { is_starred: false });
      case 'archive':
        return runLabelAction(userId, emails, archiveGmailMessages, { is_archived: true });
      case 'unarchive':
        return runLabelAction(userId, emails, unarchiveGmailMessages, { is_archived: false });
      case 'trash':
        return runLabelAction(userId, emails, trashGmailMessages, { is_trashed: true });
      case 'untrash':
        return runLabelAction(userId, emails, untrashGmailMessages, { is_trashed: false, is_archived: false });
      case 'spam':
        return runLabelAction(userId, emails, markGmailAsSpam, { is_spam: true });
      case 'not_spam':
        return runLabelAction(userId, emails, markGmailNotSpam, { is_spam: false });
      case 'delete_forever':
        return deleteForever(userId, emails);
      case 'unsubscribe':
        return unsubscribe(userId, emails);
      default:
        return { ok: false, affected: 0, error: `Unsupported action: ${req.action}` };
    }
  } catch (err) {
    return { ok: false, affected: 0, error: (err as Error).message };
  }
}

async function deleteForever(userId: string, emails: Email[]): Promise<EmailActionResult> {
  const buckets = await bucketByConnection(userId, emails);
  let affected = 0;
  let failed = 0;
  const succeededRowIds: string[] = [];

  for (const { connection, messageIds, rowIds } of Array.from(buckets.values())) {
    try {
      const res = await deleteGmailMessagesPermanently(
        connection.access_token, connection.refresh_token || '', messageIds,
      );
      affected += res.affected;
      failed += res.failed;
      if (res.affected > 0) succeededRowIds.push(...rowIds);
    } catch (err) {
      failed += messageIds.length;
      console.error('deleteForever bucket failed:', (err as Error).message);
    }
  }
  if (succeededRowIds.length) await deleteEmailsByIds(userId, succeededRowIds);
  return { ok: affected > 0, affected, failed };
}

// Unsubscribe strategy per email:
//   1. Prefer mailto: target — fire a send from the connection that received
//      this email. This is usually the fastest and doesn't require user action.
//   2. If no mailto but we have a URL, add it to `unsubscribe_urls` so the
//      client opens the sender's landing page in a new tab.
//   3. If neither, the email doesn't support List-Unsubscribe; skip it.
// In every successful case we also move the email to trash so it disappears
// from the inbox and the sender's future mail (post-processing) is easier to
// block if the unsubscribe is ignored.
async function unsubscribe(userId: string, emails: Email[]): Promise<EmailActionResult> {
  const urlsToOpen: string[] = [];
  const mailtoTargets: Array<{ connection: EmailConnection; mailto: string; rowId: string }> = [];
  const rowsToTrash: string[] = [];

  const connCache = new Map<string, EmailConnection | null>();
  const loadConn = async (id: string) => {
    if (!connCache.has(id)) connCache.set(id, await getConnectionById(id, userId));
    return connCache.get(id) || null;
  };

  for (const e of emails) {
    if (e.unsubscribe_mailto && e.connection_id) {
      const conn = await loadConn(e.connection_id);
      if (conn) mailtoTargets.push({ connection: conn, mailto: e.unsubscribe_mailto, rowId: e.id });
      continue;
    }
    if (e.unsubscribe_url) {
      urlsToOpen.push(e.unsubscribe_url);
      rowsToTrash.push(e.id);
    }
  }

  if (mailtoTargets.length === 0 && urlsToOpen.length === 0) {
    return { ok: false, affected: 0, message: 'None of the selected emails support one-click unsubscribe.' };
  }

  // De-duplicate mailto targets within the same account — a newsletter sent
  // 20 emails, we only need one unsubscribe.
  const seen = new Set<string>();
  let affected = 0;
  let failed = 0;
  const trashRowIds: string[] = [...rowsToTrash];
  const trashBuckets: ConnBuckets = new Map();

  for (const { connection, mailto, rowId } of mailtoTargets) {
    const key = `${connection.id}|${mailto.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      try {
        await sendGmailUnsubscribeEmail(connection.access_token, connection.refresh_token || '', mailto);
        affected++;
      } catch (err) {
        failed++;
        console.error('unsubscribe mailto failed:', (err as Error).message);
        continue;
      }
    }
    trashRowIds.push(rowId);
  }

  // Trash the unsubscribed emails per-connection.
  const toTrash = await getEmailsByIds(userId, Array.from(new Set(trashRowIds)));
  const buckets = await bucketByConnection(userId, toTrash);
  for (const { connection, messageIds, rowIds } of Array.from(buckets.values())) {
    try {
      await trashGmailMessages(connection.access_token, connection.refresh_token || '', messageIds);
      trashBuckets.set(connection.id, { connection, messageIds, rowIds });
    } catch (err) {
      console.error('unsubscribe trash bucket failed:', (err as Error).message);
    }
  }
  const allTrashRows: string[] = [];
  Array.from(trashBuckets.values()).forEach((b) => allTrashRows.push(...b.rowIds));
  if (allTrashRows.length) await updateEmailFlags(userId, allTrashRows, { is_trashed: true });

  // URL-only counts toward affected too — the user will open them next.
  affected += urlsToOpen.length;

  return {
    ok: affected > 0,
    affected,
    failed,
    unsubscribe_urls: urlsToOpen.length ? Array.from(new Set(urlsToOpen)) : undefined,
    message: urlsToOpen.length
      ? `Unsubscribed ${affected - urlsToOpen.length}. Open the returned URL(s) to finish the rest.`
      : undefined,
  };
}

// Normalise to the bare email address Gmail expects in a filter's `from:`
// criterion. Drops display names like `Acme <alerts@acme.com>` → `alerts@acme.com`.
function normaliseSenderEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

async function blockSender(userId: string, req: EmailActionRequest & { filters?: EmailFilters }): Promise<EmailActionResult> {
  // Resolve sender: explicit in request, or derived from email_ids.
  let senderEmail = req.sender_email ? normaliseSenderEmail(req.sender_email) : '';
  if (!senderEmail && req.email_ids?.length) {
    const rows = await getEmailsByIds(userId, req.email_ids);
    if (rows[0]) senderEmail = normaliseSenderEmail(rows[0].sender);
  }
  if (!senderEmail) return { ok: false, affected: 0, error: 'No sender to block.' };

  // Which connections to apply to. If scoped, just that one; else every active Gmail.
  const connections = req.connection_id
    ? [await getConnectionById(req.connection_id, userId)].filter(Boolean) as EmailConnection[]
    : (await getAllEmailConnections(userId)).filter((c) => c.provider === 'gmail');

  if (connections.length === 0) return { ok: false, affected: 0, error: 'No Gmail connection to apply the block on.' };

  let affected = 0;
  let failed = 0;
  for (const conn of connections) {
    try {
      const { filterId } = await createGmailBlockFilter(conn.access_token, conn.refresh_token || '', senderEmail);
      await insertBlockedSender({
        user_id: userId,
        connection_id: conn.id,
        sender_email: senderEmail,
        gmail_filter_id: filterId || null,
      });
      affected++;
    } catch (err) {
      failed++;
      console.error('blockSender connection failed:', (err as Error).message);
    }
  }

  // Retroactively move existing inbox mail from this sender to spam so the
  // user doesn't have to manually clean up what arrived before the block.
  const existing = await getEmailsBySender(userId, senderEmail, req.connection_id);
  if (existing.length > 0) {
    await runLabelAction(userId, existing, markGmailAsSpam, { is_spam: true });
  }

  return {
    ok: affected > 0,
    affected,
    failed,
    message: `Blocked ${senderEmail} on ${affected} account${affected === 1 ? '' : 's'}.`,
  };
}

async function unblockSender(userId: string, req: EmailActionRequest): Promise<EmailActionResult> {
  const senderEmail = req.sender_email ? normaliseSenderEmail(req.sender_email) : '';
  if (!senderEmail) return { ok: false, affected: 0, error: 'sender_email required.' };

  const rows = await deleteBlockedSendersByEmail(userId, senderEmail, req.connection_id);
  if (rows.length === 0) return { ok: false, affected: 0, message: `${senderEmail} wasn't blocked.` };

  // Revoke each Gmail filter so future mail flows back to inbox.
  let failed = 0;
  for (const row of rows) {
    if (!row.gmail_filter_id || !row.connection_id) continue;
    const conn = await getConnectionById(row.connection_id, userId);
    if (!conn) continue;
    try {
      await deleteGmailFilter(conn.access_token, conn.refresh_token || '', row.gmail_filter_id);
    } catch (err) {
      failed++;
      console.error('unblockSender filter delete failed:', (err as Error).message);
    }
  }

  return {
    ok: true,
    affected: rows.length,
    failed: failed || undefined,
    message: `Unblocked ${senderEmail}.`,
  };
}
