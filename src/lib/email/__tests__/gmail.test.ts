import { parseGmailMessage } from '../gmail';
import type { GmailMessage } from '@/types';

// Helpers
function makeBase64(text: string) {
  return Buffer.from(text).toString('base64url');
}

function makeMessage(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    labelIds: ['INBOX'],
    snippet: 'Hello there',
    internalDate: '1700000000000',
    payload: {
      headers: [
        { name: 'From', value: 'Alice Smith <alice@example.com>' },
        { name: 'To', value: 'bob@example.com' },
        { name: 'Subject', value: 'Test email' },
      ],
      body: { data: makeBase64('Plain text body.'), size: 16 },
    },
    ...overrides,
  };
}

describe('parseGmailMessage', () => {
  it('parses sender name and email from "Name <email>" format', () => {
    const result = parseGmailMessage(makeMessage());
    expect(result).not.toBeNull();
    expect(result!.sender).toBe('alice@example.com');
    expect(result!.senderName).toBe('Alice Smith');
  });

  it('falls back to raw address when no display name is present', () => {
    const msg = makeMessage();
    msg.payload.headers![0] = { name: 'From', value: 'alice@example.com' };
    const result = parseGmailMessage(msg);
    // Without angle-bracket format the regex doesn't match, so the email
    // address is used as both sender and senderName (code fallback behaviour).
    expect(result!.sender).toBe('alice@example.com');
    expect(result!.senderName).toBe('alice@example.com');
  });

  it('decodes base64url-encoded plain text body', () => {
    const result = parseGmailMessage(makeMessage());
    expect(result!.body).toBe('Plain text body.');
  });

  it('extracts plain and html parts from multipart message', () => {
    const msg = makeMessage({
      payload: {
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'To', value: 'bob@example.com' },
          { name: 'Subject', value: 'Multi' },
        ],
        body: { size: 0 },
        parts: [
          { mimeType: 'text/plain', body: { data: makeBase64('Plain part'), size: 10 } },
          { mimeType: 'text/html', body: { data: makeBase64('<p>HTML part</p>'), size: 15 } },
        ],
      },
    });
    const result = parseGmailMessage(msg);
    expect(result!.body).toBe('Plain part');
    expect(result!.bodyHtml).toBe('<p>HTML part</p>');
  });

  it('strips HTML to produce body when no plain part exists', () => {
    const msg = makeMessage({
      payload: {
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'To', value: 'bob@example.com' },
          { name: 'Subject', value: 'HTML only' },
        ],
        body: { size: 0 },
        parts: [
          { mimeType: 'text/html', body: { data: makeBase64('<p>Hello <b>world</b></p>'), size: 24 } },
        ],
      },
    });
    const result = parseGmailMessage(msg);
    expect(result!.body).toBe('Hello world');
  });

  it('sets isRead=true when UNREAD label is absent', () => {
    const result = parseGmailMessage(makeMessage({ labelIds: ['INBOX'] }));
    expect(result!.isRead).toBe(true);
  });

  it('sets isRead=false when UNREAD label is present', () => {
    const result = parseGmailMessage(makeMessage({ labelIds: ['INBOX', 'UNREAD'] }));
    expect(result!.isRead).toBe(false);
  });

  it('sets isStarred=true when STARRED label is present', () => {
    const result = parseGmailMessage(makeMessage({ labelIds: ['INBOX', 'STARRED'] }));
    expect(result!.isStarred).toBe(true);
  });

  it('uses "(No Subject)" when Subject header is missing', () => {
    const msg = makeMessage();
    msg.payload.headers = msg.payload.headers!.filter((h) => h.name !== 'Subject');
    const result = parseGmailMessage(msg);
    expect(result!.subject).toBe('(No Subject)');
  });

  it('converts internalDate to a Date object', () => {
    const result = parseGmailMessage(makeMessage({ internalDate: '1700000000000' }));
    expect(result!.receivedAt).toEqual(new Date(1700000000000));
  });

  it('returns null and does not throw on malformed message', () => {
    // @ts-expect-error intentionally malformed
    expect(() => parseGmailMessage(null)).not.toThrow();
    // @ts-expect-error intentionally malformed
    expect(parseGmailMessage(null)).toBeNull();
  });
});
