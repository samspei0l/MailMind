import { google } from 'googleapis';
import type { ParsedEmail, GmailMessage } from '@/types';

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

    // Extract body
    let body = '';
    let bodyHtml = '';

    if (message.payload?.body?.data) {
      body = decodeBase64(message.payload.body.data);
    } else if (message.payload?.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = decodeBase64(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          bodyHtml = decodeBase64(part.body.data);
        }
      }
    }

    if (!body && bodyHtml) {
      body = stripHtml(bodyHtml);
    }

    const labels = message.labelIds || [];
    const isRead = !labels.includes('UNREAD');
    const isStarred = labels.includes('STARRED');

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
    };
  } catch (err) {
    console.error('parseGmailMessage error:', err);
    return null;
  }
}

// ============================================================
// SEND EMAIL
// ============================================================

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

  const emailLines = [
    `To: ${options.to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    options.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : '',
    '',
    options.body,
  ].filter(Boolean);

  const rawEmail = emailLines.join('\r\n');
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
