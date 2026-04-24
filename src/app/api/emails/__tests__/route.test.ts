/**
 * Tests for GET /api/emails and POST /api/emails
 *
 * Strategy: mock auth helpers and the actions layer so we test only
 * the route's auth-guard, parameter parsing, and response shaping.
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = jest.fn();

jest.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerComponentClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

jest.mock('next/headers', () => ({ cookies: jest.fn(() => ({})) }));

jest.mock('@/lib/email/actions', () => ({
  getEmails: jest.fn(),
  syncEmails: jest.fn(),
}));

import { getEmails, syncEmails } from '@/lib/email/actions';

const mockedGetEmails = getEmails as jest.MockedFunction<typeof getEmails>;
const mockedSyncEmails = syncEmails as jest.MockedFunction<typeof syncEmails>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost:3000${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

function makePostRequest(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// GET /api/emails
// ---------------------------------------------------------------------------

describe('GET /api/emails', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('/api/emails'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('calls getEmails with the authenticated user id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [], message: 'Found 0 emails' });

    await GET(makeRequest('/api/emails'));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('returns the result from getEmails as JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const payload = { emails: [{ id: 'email-1' }], message: 'Found 1 email' };
    mockedGetEmails.mockResolvedValue(payload as any);

    const res = await GET(makeRequest('/api/emails'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });

  it('parses priority, category, and type query params', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails', { priority: 'HIGH', category: 'Sales', type: 'New Request' }));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.objectContaining({
      priority: 'HIGH',
      category: 'Sales',
      type: 'New Request',
    }));
  });

  it('parses requires_reply=true as boolean true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails', { requires_reply: 'true' }));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.objectContaining({
      requires_reply: true,
    }));
  });

  it('parses requires_reply=false as boolean false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails', { requires_reply: 'false' }));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.objectContaining({
      requires_reply: false,
    }));
  });

  it('parses limit as an integer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails', { limit: '25' }));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 25 }));
  });

  it('defaults limit to 50 when not provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails'));

    expect(mockedGetEmails).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 50 }));
  });

  it('omits undefined filter keys from the object passed to getEmails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedGetEmails.mockResolvedValue({ emails: [] });

    await GET(makeRequest('/api/emails', { priority: 'LOW' }));

    const filters = mockedGetEmails.mock.calls[0][1];
    expect(Object.keys(filters)).not.toContain('category');
    expect(Object.keys(filters)).not.toContain('sender');
  });
});

// ---------------------------------------------------------------------------
// POST /api/emails  (sync trigger)
// ---------------------------------------------------------------------------

describe('POST /api/emails', () => {
  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makePostRequest('/api/emails'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('calls syncEmails with user id and default maxResults=50', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedSyncEmails.mockResolvedValue({ synced: 0, newEmails: 0, enriched: 0 });

    await POST(makePostRequest('/api/emails', {}));

    expect(mockedSyncEmails).toHaveBeenCalledWith('user-1', 50);
  });

  it('uses maxResults from request body when provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedSyncEmails.mockResolvedValue({ synced: 20, newEmails: 12, enriched: 5 });

    await POST(makePostRequest('/api/emails', { maxResults: 100 }));

    expect(mockedSyncEmails).toHaveBeenCalledWith('user-1', 100);
  });

  it('returns sync result as JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedSyncEmails.mockResolvedValue({ synced: 10, newEmails: 3, enriched: 8 });

    const res = await POST(makePostRequest('/api/emails'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ synced: 10, newEmails: 3, enriched: 8 });
  });

  it('handles malformed JSON body gracefully (uses defaults)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedSyncEmails.mockResolvedValue({ synced: 0, newEmails: 0, enriched: 0 });

    const req = new NextRequest('http://localhost:3000/api/emails', {
      method: 'POST',
      body: 'not-json',
    });

    await POST(req);
    // Should still call with default maxResults and not throw
    expect(mockedSyncEmails).toHaveBeenCalledWith('user-1', 50);
  });

  it('propagates sync error message in the response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockedSyncEmails.mockResolvedValue({ synced: 0, newEmails: 0, enriched: 0, error: 'No Gmail connection found.' });

    const res = await POST(makePostRequest('/api/emails'));
    const body = await res.json();
    expect(body.error).toBe('No Gmail connection found.');
  });
});
