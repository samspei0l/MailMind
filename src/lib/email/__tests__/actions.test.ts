import { getEmails, syncEmails } from '../actions';

// ---------------------------------------------------------------------------
// Mock all external dependencies
// ---------------------------------------------------------------------------

jest.mock('@/lib/supabase/db', () => ({
  getEmailsByFilters: jest.fn(),
  upsertEmails: jest.fn(),
  updateEmailAI: jest.fn(),
  updateLastSync: jest.fn(),
  getEmailConnection: jest.fn(),
  logEmailReply: jest.fn(),
}));

jest.mock('@/lib/email/gmail', () => ({
  fetchGmailMessages: jest.fn(),
  sendGmailReply: jest.fn(),
}));

jest.mock('@/lib/ai/openai', () => ({
  enrichEmail: jest.fn(),
  generateEmailReply: jest.fn(),
  generateDailySummary: jest.fn(),
}));

import {
  getEmailsByFilters,
  upsertEmails,
  updateEmailAI,
  updateLastSync,
  getEmailConnection,
} from '@/lib/supabase/db';
import { fetchGmailMessages } from '@/lib/email/gmail';
import { enrichEmail } from '@/lib/ai/openai';
import type { Email, EmailConnection } from '@/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    user_id: 'user-1',
    connection_id: 'conn-1',
    message_id: 'msg-1',
    thread_id: 'thread-1',
    sender: 'sender@example.com',
    sender_name: 'Sender',
    recipient: 'me@example.com',
    subject: 'Hello',
    body: 'Body text',
    body_html: null,
    snippet: 'Body text',
    is_read: false,
    is_starred: false,
    labels: ['INBOX'],
    received_at: new Date().toISOString(),
    direction: 'received',
    summary: null,
    priority: null,
    category: null,
    type: null,
    requires_reply: false,
    intent: null,
    suggested_reply: null,
    ai_processed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeConnection(overrides: Partial<EmailConnection> = {}): EmailConnection {
  return {
    id: 'conn-1',
    user_id: 'user-1',
    provider: 'gmail',
    email: 'me@example.com',
    nickname: null,
    color: '#3b82f6',
    sort_order: 0,
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_expiry: null,
    is_active: true,
    last_sync_at: null,
    signature: null,
    signature_extracted_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getEmails
// ---------------------------------------------------------------------------

describe('getEmails', () => {
  const mockedGetEmailsByFilters = getEmailsByFilters as jest.MockedFunction<typeof getEmailsByFilters>;

  it('returns emails and a count message on success', async () => {
    const emails = [makeEmail(), makeEmail({ id: 'email-2' })];
    mockedGetEmailsByFilters.mockResolvedValue(emails);

    const result = await getEmails('user-1', { limit: 50 });

    expect(result.emails).toEqual(emails);
    expect(result.message).toBe('Found 2 emails');
    expect(result.error).toBeUndefined();
  });

  it('uses singular form for exactly one email', async () => {
    mockedGetEmailsByFilters.mockResolvedValue([makeEmail()]);
    const result = await getEmails('user-1', {});
    expect(result.message).toBe('Found 1 email');
  });

  it('returns error string when getEmailsByFilters throws', async () => {
    mockedGetEmailsByFilters.mockRejectedValue(new Error('DB connection failed'));
    const result = await getEmails('user-1', {});
    expect(result.error).toBe('DB connection failed');
    expect(result.emails).toBeUndefined();
  });

  it('passes filters through to the db query', async () => {
    mockedGetEmailsByFilters.mockResolvedValue([]);
    await getEmails('user-1', { priority: 'HIGH', sender: 'boss@co.com', limit: 10 });
    expect(mockedGetEmailsByFilters).toHaveBeenCalledWith('user-1', {
      priority: 'HIGH',
      sender: 'boss@co.com',
      limit: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// syncEmails
// ---------------------------------------------------------------------------

describe('syncEmails', () => {
  const mockedGetEmailConnection = getEmailConnection as jest.MockedFunction<typeof getEmailConnection>;
  const mockedFetchGmailMessages = fetchGmailMessages as jest.MockedFunction<typeof fetchGmailMessages>;
  const mockedUpsertEmails = upsertEmails as jest.MockedFunction<typeof upsertEmails>;
  const mockedUpdateLastSync = updateLastSync as jest.MockedFunction<typeof updateLastSync>;
  const mockedEnrichEmail = enrichEmail as jest.MockedFunction<typeof enrichEmail>;
  const mockedUpdateEmailAI = updateEmailAI as jest.MockedFunction<typeof updateEmailAI>;

  beforeEach(() => {
    mockedUpdateLastSync.mockResolvedValue(undefined);
    mockedUpdateEmailAI.mockResolvedValue(undefined);
  });

  it('returns error when no Gmail connection exists', async () => {
    mockedGetEmailConnection.mockResolvedValue(null);
    const result = await syncEmails('user-1');
    expect(result).toEqual({
      synced: 0,
      enriched: 0,
      error: 'No Gmail connection found. Please connect your Gmail account.',
    });
  });

  it('returns synced=0 enriched=0 when Gmail has no messages', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({ messages: [] });

    const result = await syncEmails('user-1');
    expect(result).toEqual({ synced: 0, enriched: 0 });
    expect(mockedUpsertEmails).not.toHaveBeenCalled();
  });

  it('upserts messages and updates last sync timestamp', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({
      messages: [
        {
          messageId: 'msg-1', threadId: 'thread-1',
          sender: 'a@b.com', senderName: 'A',
          recipient: 'me@b.com', subject: 'Hello',
          body: 'Hi', bodyHtml: '', snippet: 'Hi',
          receivedAt: new Date(), labels: [], isRead: true, isStarred: false,
        },
      ],
    });
    mockedUpsertEmails.mockResolvedValue([makeEmail({ ai_processed_at: 'already-done' })]);

    const result = await syncEmails('user-1');

    expect(mockedUpsertEmails).toHaveBeenCalledTimes(1);
    expect(mockedUpdateLastSync).toHaveBeenCalledWith('conn-1');
    expect(result.synced).toBe(1);
  });

  it('enriches unenriched emails (up to 20) after upsert', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({
      messages: [
        {
          messageId: 'msg-1', threadId: 'thread-1',
          sender: 'a@b.com', senderName: 'A',
          recipient: 'me@b.com', subject: 'Hello',
          body: 'Hi', bodyHtml: '', snippet: 'Hi',
          receivedAt: new Date(), labels: [], isRead: false, isStarred: false,
        },
      ],
    });
    // Email has no ai_processed_at — should be enriched
    mockedUpsertEmails.mockResolvedValue([makeEmail({ ai_processed_at: null })]);
    mockedEnrichEmail.mockResolvedValue({
      summary: 'A summary',
      priority: 'LOW',
      category: 'Other',
      type: 'Other',
      requires_reply: false,
      intent: 'greeting',
      suggested_reply: 'Hi back',
    });

    const result = await syncEmails('user-1');

    expect(mockedEnrichEmail).toHaveBeenCalledTimes(1);
    expect(mockedUpdateEmailAI).toHaveBeenCalledTimes(1);
    expect(result.enriched).toBe(1);
  });

  it('skips enrichment for emails that already have ai_processed_at', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({
      messages: [{
        messageId: 'msg-1', threadId: 'thread-1',
        sender: 'a@b.com', senderName: 'A',
        recipient: 'me@b.com', subject: 'Hello',
        body: 'Hi', bodyHtml: '', snippet: 'Hi',
        receivedAt: new Date(), labels: [], isRead: true, isStarred: false,
      }],
    });
    mockedUpsertEmails.mockResolvedValue([makeEmail({ ai_processed_at: '2024-01-01T00:00:00Z' })]);

    const result = await syncEmails('user-1');

    expect(mockedEnrichEmail).not.toHaveBeenCalled();
    expect(result.enriched).toBe(0);
  });

  it('returns error when fetchGmailMessages throws', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockRejectedValue(new Error('Gmail API error'));

    const result = await syncEmails('user-1');
    expect(result).toEqual({ synced: 0, enriched: 0, error: 'Gmail API error' });
  });

  it('continues enriching remaining emails when one enrichment fails', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({
      messages: [
        { messageId: 'msg-1', threadId: 't-1', sender: 'a@b.com', senderName: 'A', recipient: 'me@b.com', subject: 'S1', body: 'B1', bodyHtml: '', snippet: 'S1', receivedAt: new Date(), labels: [], isRead: false, isStarred: false },
        { messageId: 'msg-2', threadId: 't-2', sender: 'b@b.com', senderName: 'B', recipient: 'me@b.com', subject: 'S2', body: 'B2', bodyHtml: '', snippet: 'S2', receivedAt: new Date(), labels: [], isRead: false, isStarred: false },
      ],
    });
    mockedUpsertEmails.mockResolvedValue([
      makeEmail({ id: 'e-1', ai_processed_at: null }),
      makeEmail({ id: 'e-2', ai_processed_at: null }),
    ]);
    mockedEnrichEmail
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({ summary: 'ok', priority: 'LOW', category: 'Other', type: 'Other', requires_reply: false, intent: '', suggested_reply: '' });

    const result = await syncEmails('user-1');
    expect(result.enriched).toBe(1); // only second succeeded
  });

  it('respects custom maxResults parameter', async () => {
    mockedGetEmailConnection.mockResolvedValue(makeConnection());
    mockedFetchGmailMessages.mockResolvedValue({ messages: [] });

    await syncEmails('user-1', 100);

    expect(mockedFetchGmailMessages).toHaveBeenCalledWith(
      'access-token',
      'refresh-token',
      { maxResults: 100 }
    );
  });
});
