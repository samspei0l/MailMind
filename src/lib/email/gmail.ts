import { google } from 'googleapis';
import type { ParsedEmail, GmailMessage, GmailPart, EmailAttachment } from '@/types';

// ============================================================
// OAUTH CLIENT
// ============================================================

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGmailAuthUrl(): string {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent', // Force refresh token on every consent
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// ============================================================
// GMAIL CLIENT FACTORY
// ============================================================

export function createGmailClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ============================================================
// FETCH EMAILS
// ============================================================

export async function fetchGmailMessages(
  accessToken: string,
  refreshToken: string,
  options: { maxResults?: number; pageToken?: string; query?: string } = {}
): Promise<{ messages: ParsedEmail[]; nextPageToken?: string }> {
  const gmail = createGmailClient(accessToken, refreshToken);

  // List message IDs
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults: options.maxResults || 50,
    pageToken: options.pageToken,
    q: options.query || 'in:inbox',
  });

  const messageIds = listResponse.data.messages || [];
  if (messageIds.length === 0) return { messages: [] };

  // Fetch full message details in parallel (batched)
  const batchSize = 10;
  const parsedMessages: ParsedEmail[] = [];

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const promises = batch.map(({ id }) =>
      gmail.users.messages.get({ userId: 'me', id: id!, format: 'full' })
    );
    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const parsed = parseGmailMessage(result.value.data as GmailMessage);
        if (parsed) parsedMessages.push(parsed);
      }
    }
  }

  return {
    messages: parsedMessages,
    nextPageToken: listResponse.data.nextPageToken || undefined,
  };
}

// ============================================================
// PARSE GMAIL MESSAGE
// ============================================================

export function parseGmailMessage(message: GmailMessage): ParsedEmail | null {
  try {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const senderMatch = from.match(/^(.*?)\s*<(.+)>$/) || [null, from, from];
    const senderName = senderMatch[1]?.replace(/"/g, '').trim() || '';
    const senderEmail = senderMatch[2]?.trim() || from;

    // Walk the whole MIME tree once: pick the best text/plain + text/html
    // bodies, and collect every part that has a filename — those are the
    // user-facing attachments (logos in signatures come through here too,
    // tagged as inline via Content-Disposition).
    let body = '';
    let bodyHtml = '';
    const attachments: EmailAttachment[] = [];

    const walk = (part: GmailPart) => {
      if (!part) return;
      const isText = part.mimeType === 'text/plain';
      const isHtml = part.mimeType === 'text/html';

      // A part is an attachment if Gmail assigned an attachmentId AND it
      // either has a filename or a Content-Disposition: attachment header.
      const hasAttId = !!part.body?.attachmentId;
      const filename = (part.filename || '').trim();
      const disposition = (part.headers || []).find((h) => h.name.toLowerCase() === 'content-disposition')?.value || '';
      const isInline = /^inline/i.test(disposition);

      if (hasAttId && (filename || /attachment/i.test(disposition))) {
        attachments.push({
          filename: filename || `attachment-${attachments.length + 1}`,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body?.size || 0,
          attachmentId: part.body!.attachmentId!,
          partId: part.partId || '',
          inline: isInline || undefined,
        });
        return; // don't drill into attachment sub-parts
      }

      // Prefer the outermost text parts; but if we haven't found one yet,
      // accept a nested one too.
      if (isText && !body && part.body?.data) body = decodeBase64(part.body.data);
      if (isHtml && !bodyHtml && part.body?.data) bodyHtml = decodeBase64(part.body.data);

      if (part.parts) {
        for (const child of part.parts) walk(child);
      }
    };

    if (message.payload) walk(message.payload);

    if (!body && bodyHtml) {
      body = stripHtml(bodyHtml);
    }

    const labels = message.labelIds || [];
    const isRead = !labels.includes('UNREAD');
    const isStarred = labels.includes('STARRED');

    const { url: unsubscribeUrl, mailto: unsubscribeMailto } = parseListUnsubscribe(getHeader('List-Unsubscribe'));

    return {
      messageId: message.id,
      threadId: message.threadId,
      sender: senderEmail,
      senderName,
      recipient: getHeader('To'),
      subject: getHeader('Subject') || '(No Subject)',
      body: body.substring(0, 10000),
      bodyHtml: bodyHtml.substring(0, 50000),
      snippet: message.snippet || '',
      receivedAt: new Date(parseInt(message.internalDate)),
      labels,
      isRead,
      isStarred,
      unsubscribeUrl,
      unsubscribeMailto,
      attachments,
    };
  } catch (err) {
    console.error('parseGmailMessage error:', err);
    return null;
  }
}

// ============================================================
// FETCH ATTACHMENT BYTES
// ============================================================
//
// Gmail separates attachment bytes from the message payload — the
// payload carries an `attachmentId` reference and you have to hit the
// messages.attachments.get endpoint to retrieve the base64 data. We do
// this on demand from the download API route rather than on sync, so
// we don't pay the bandwidth/storage cost for attachments the user
// never opens.

export async function fetchGmailAttachment(
  accessToken: string,
  refreshToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const gmail = createGmailClient(accessToken, refreshToken);
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res.data?.data;
  if (!data) throw new Error('Attachment has no body data');
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ============================================================
// SEND EMAIL
// ============================================================

// Convert the user's body (which may contain [text](url) markdown links and
// bare URLs) into safe, clickable HTML. Plain text stays plain text for the
// fallback alternative part.
export function renderBodyHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Markdown-style [text](url) → <a href="url">text</a>. Escaping already ran,
  // so the brackets/parens we match here were literal in the source.
  const withMdLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`,
  );

  // Auto-linkify bare URLs that weren't already wrapped by the markdown step.
  // Only match URLs preceded by start-of-string or whitespace — this avoids
  // re-wrapping URLs already sitting inside an <a href="..."> or >URL</a>.
  const withBareLinks = withMdLinks.replace(
    /(^|\s)(https?:\/\/[^\s<]+)/g,
    (_m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url}</a>`,
  );

  return withBareLinks.replace(/\r?\n/g, '<br>');
}

// Plain-text fallback: strip markdown link syntax to `text (url)`.
export function renderBodyPlain(body: string): string {
  return body.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');
}

export async function sendGmailReply(
  accessToken: string,
  refreshToken: string,
  options: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
  }
): Promise<{ messageId: string }> {
  const gmail = createGmailClient(accessToken, refreshToken);

  const subject = options.subject.startsWith('Re:') ? options.subject : `Re: ${options.subject}`;

  const plainBody = renderBodyPlain(options.body);
  const htmlBody = renderBodyHtml(options.body);

  // multipart/alternative — most clients render the HTML, but we include the
  // plain-text part so terminal-only readers and spam filters see clean text.
  const boundary = `mm_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

  const headers = [
    `To: ${options.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : '',
  ].filter(Boolean);

  const bodyParts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    plainBody,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    `<div>${htmlBody}</div>`,
    `--${boundary}--`,
  ];

  const rawEmail = [...headers, '', ...bodyParts].join('\r\n');
  const encodedEmail = Buffer.from(rawEmail).toString('base64url');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
      threadId: options.threadId,
    },
  });

  return { messageId: result.data.id! };
}

// ============================================================
// MAILBOX MUTATIONS
// ============================================================
//
// Gmail's model: every state lives as a label.
//   UNREAD        — presence = unread, removal = read
//   STARRED       — star toggle
//   INBOX         — removal = archived (the "archive" action)
//   TRASH / SPAM  — bucket destinations; managed via dedicated trash/
//                   untrash endpoints or a label modify for spam
//
// All helpers below take an array of Gmail message IDs so the same
// path serves single-row and bulk actions. We use users.messages.modify
// in a loop rather than batchModify because:
//   - batchModify returns no per-id status, so we can't surface
//     partial failures cleanly
//   - the per-call latency is dominated by the round trip the caller
//     already paid; a 50-message bulk is still well under a second
// If we hit scale where this matters, swap to batchModify selectively.

async function modifyGmailLabels(
  accessToken: string,
  refreshToken: string,
  ids: string[],
  add: string[],
  remove: string[],
): Promise<{ affected: number; failed: number }> {
  if (ids.length === 0) return { affected: 0, failed: 0 };
  const gmail = createGmailClient(accessToken, refreshToken);
  const results = await Promise.allSettled(
    ids.map((id) => gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { addLabelIds: add, removeLabelIds: remove },
    })),
  );
  let affected = 0, failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') affected++;
    else failed++;
  }
  return { affected, failed };
}

export async function trashGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  if (ids.length === 0) return { affected: 0, failed: 0 };
  const gmail = createGmailClient(accessToken, refreshToken);
  const results = await Promise.allSettled(ids.map((id) => gmail.users.messages.trash({ userId: 'me', id })));
  return tally(results);
}

export async function untrashGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  if (ids.length === 0) return { affected: 0, failed: 0 };
  const gmail = createGmailClient(accessToken, refreshToken);
  const results = await Promise.allSettled(ids.map((id) => gmail.users.messages.untrash({ userId: 'me', id })));
  return tally(results);
}

// Permanent delete — Gmail's `messages.delete` skips Trash. Use this only
// after explicit confirmation; the operation is irreversible.
export async function deleteGmailMessagesPermanently(accessToken: string, refreshToken: string, ids: string[]) {
  if (ids.length === 0) return { affected: 0, failed: 0 };
  const gmail = createGmailClient(accessToken, refreshToken);
  const results = await Promise.allSettled(ids.map((id) => gmail.users.messages.delete({ userId: 'me', id })));
  return tally(results);
}

export function markGmailAsSpam(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, ['SPAM'], ['INBOX']);
}

export function markGmailNotSpam(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, ['INBOX'], ['SPAM']);
}

// "Archive" in Gmail = remove from Inbox. The message stays accessible via
// All Mail / search but disappears from the inbox list.
export function archiveGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, [], ['INBOX']);
}

export function unarchiveGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, ['INBOX'], []);
}

export function markGmailRead(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, [], ['UNREAD']);
}

export function markGmailUnread(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, ['UNREAD'], []);
}

export function starGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, ['STARRED'], []);
}

export function unstarGmailMessages(accessToken: string, refreshToken: string, ids: string[]) {
  return modifyGmailLabels(accessToken, refreshToken, ids, [], ['STARRED']);
}

function tally(results: PromiseSettledResult<unknown>[]): { affected: number; failed: number } {
  let affected = 0, failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') affected++;
    else failed++;
  }
  return { affected, failed };
}

// ============================================================
// GMAIL FILTERS — the "Block sender" backbone
// ============================================================
//
// When a user blocks a sender, we create a real Gmail server-side filter
// so the rule survives MailMind being uninstalled and so future mail is
// auto-routed to spam without us having to re-process it. Action.spec:
// `from:` matches the sender; the action skips Inbox and applies SPAM.

export async function createGmailBlockFilter(
  accessToken: string,
  refreshToken: string,
  senderEmail: string,
): Promise<{ filterId: string }> {
  const gmail = createGmailClient(accessToken, refreshToken);
  const res = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      criteria: { from: senderEmail },
      action: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
    },
  });
  return { filterId: res.data.id || '' };
}

export async function deleteGmailFilter(accessToken: string, refreshToken: string, filterId: string) {
  if (!filterId) return;
  const gmail = createGmailClient(accessToken, refreshToken);
  try {
    await gmail.users.settings.filters.delete({ userId: 'me', id: filterId });
  } catch (err) {
    // 404 is fine — filter was already deleted on Gmail's side.
    const code = (err as { code?: number })?.code;
    if (code !== 404) throw err;
  }
}

// ============================================================
// UNSUBSCRIBE HELPERS
// ============================================================
//
// The List-Unsubscribe header (RFC 2369) is a comma-separated list of
// `<target>` tokens. Each target is either a mailto: or an https URL.
// We extract the first of each kind so the UI can pick: mailto fires
// in-app via Gmail send; URLs are opened in a new tab (we can't do a
// silent POST because that requires server-side CORS + the sender has
// to trust our IP as the unsubscribe origin).

export function parseListUnsubscribe(header: string): { url: string | null; mailto: string | null } {
  if (!header) return { url: null, mailto: null };
  const tokens = header.match(/<([^>]+)>/g) || [];
  let url: string | null = null;
  let mailto: string | null = null;
  for (const raw of tokens) {
    const value = raw.slice(1, -1).trim();
    if (!value) continue;
    if (value.toLowerCase().startsWith('mailto:') && !mailto) {
      mailto = value;
    } else if (/^https?:\/\//i.test(value) && !url) {
      url = value;
    }
  }
  return { url, mailto };
}

// Send a one-line unsubscribe email to the mailto target extracted from the
// List-Unsubscribe header. The target often encodes a token in the
// local-part or subject query — we honour that by preserving the query
// string and using "unsubscribe" as the body and subject when none is given.
export async function sendGmailUnsubscribeEmail(
  accessToken: string,
  refreshToken: string,
  mailtoTarget: string,
): Promise<{ messageId: string }> {
  const gmail = createGmailClient(accessToken, refreshToken);

  // Strip mailto: prefix, split address from query params.
  const without = mailtoTarget.replace(/^mailto:/i, '');
  const [addr, queryString = ''] = without.split('?');
  const query = new URLSearchParams(queryString);
  const subject = query.get('subject') || 'unsubscribe';
  const body = query.get('body') || 'unsubscribe';

  const headers = [
    `To: ${addr}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  const raw = [...headers, '', body].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
  return { messageId: result.data.id! };
}

// ============================================================
// GET USER EMAIL
// ============================================================

export async function getGmailUserEmail(accessToken: string): Promise<string> {
  const oauth2 = google.oauth2({ version: 'v2', auth: createOAuthClient() });
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: accessToken });
  const info = await google.oauth2({ version: 'v2', auth }).userinfo.get();
  return info.data.email || '';
}

// ============================================================
// UTILITIES
// ============================================================

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// OUTLOOK PROVIDER (Placeholder for future integration)
// ============================================================

export interface EmailProvider {
  fetchMessages(options?: Record<string, unknown>): Promise<ParsedEmail[]>;
  sendReply(options: Record<string, unknown>): Promise<{ messageId: string }>;
  getUserEmail(): Promise<string>;
}

// export class OutlookProvider implements EmailProvider { ... }
// Add Outlook integration here following the same interface
