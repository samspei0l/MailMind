/**
 * Tests for the Outlook OAuth callback route.
 *
 * The route handler itself uses Next.js internals (cookies, redirect) that
 * cannot run outside the Next.js runtime, so we test the underlying library
 * functions in `src/lib/email/outlook.ts` that the callback depends on.
 */

// ── Env setup ──────────────────────────────────────────────────────────────
process.env.MICROSOFT_CLIENT_ID = 'test-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-client-secret';
process.env.MICROSOFT_REDIRECT_URI = 'http://localhost:3000/api/auth/outlook/callback';

import { getOutlookAuthUrl, exchangeOutlookCodeForTokens, getOutlookUserEmail } from '@/lib/email/outlook';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseQuery(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

// ── getOutlookAuthUrl ────────────────────────────────────────────────────────

describe('getOutlookAuthUrl', () => {
  it('points to the Microsoft /authorize endpoint', () => {
    const url = getOutlookAuthUrl();
    expect(url).toContain('login.microsoftonline.com');
    expect(url).toContain('/oauth2/v2.0/authorize');
  });

  it('uses the callback URI — not the connect URI', () => {
    const url = getOutlookAuthUrl();
    const params = parseQuery(url);
    expect(params.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/outlook/callback'
    );
    expect(params.get('redirect_uri')).not.toContain('/connect');
  });

  it('requests offline_access so we receive a refresh token', () => {
    const url = getOutlookAuthUrl();
    const scope = parseQuery(url).get('scope') ?? '';
    expect(scope).toContain('offline_access');
  });

  it('requests User.Read, Mail.Read, Mail.Send, and Mail.ReadWrite scopes', () => {
    const url = getOutlookAuthUrl();
    const scope = parseQuery(url).get('scope') ?? '';
    expect(scope).toContain('User.Read');
    expect(scope).toContain('Mail.Read');
    expect(scope).toContain('Mail.Send');
    expect(scope).toContain('Mail.ReadWrite');
  });

  it('sets client_id from env', () => {
    const url = getOutlookAuthUrl();
    const params = parseQuery(url);
    expect(params.get('client_id')).toBe('test-client-id');
  });

  it('uses response_type=code (authorization code flow)', () => {
    const url = getOutlookAuthUrl();
    expect(parseQuery(url).get('response_type')).toBe('code');
  });
});

// ── exchangeOutlookCodeForTokens ─────────────────────────────────────────────

describe('exchangeOutlookCodeForTokens', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to the Microsoft /token endpoint with the callback redirect_uri', async () => {
    let capturedUrl = '';
    let capturedBody = '';

    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = (init?.body as string) ?? '';
      return new Response(
        JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as jest.Mock;

    await exchangeOutlookCodeForTokens('auth-code-123');

    expect(capturedUrl).toContain('/oauth2/v2.0/token');
    const body = new URLSearchParams(capturedBody);
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/api/auth/outlook/callback');
    expect(body.get('redirect_uri')).not.toContain('/connect');
    expect(body.get('code')).toBe('auth-code-123');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
  });

  it('returns access_token, refresh_token, and expires_in', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as jest.Mock;

    const tokens = await exchangeOutlookCodeForTokens('code');
    expect(tokens.access_token).toBe('AT');
    expect(tokens.refresh_token).toBe('RT');
    expect(tokens.expires_in).toBe(3600);
  });

  it('throws when Microsoft returns a non-OK response', async () => {
    global.fetch = jest.fn(async () =>
      new Response('invalid_grant', { status: 400 })
    ) as jest.Mock;

    await expect(exchangeOutlookCodeForTokens('bad-code')).rejects.toThrow(
      'Microsoft token exchange failed'
    );
  });
});

// ── getOutlookUserEmail ──────────────────────────────────────────────────────

describe('getOutlookUserEmail', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the mail field when present', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ mail: 'user@outlook.com', userPrincipalName: 'user@tenant.onmicrosoft.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as jest.Mock;

    const email = await getOutlookUserEmail('access-token');
    expect(email).toBe('user@outlook.com');
  });

  it('falls back to userPrincipalName when mail is absent', async () => {
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ userPrincipalName: 'user@tenant.onmicrosoft.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as jest.Mock;

    const email = await getOutlookUserEmail('access-token');
    expect(email).toBe('user@tenant.onmicrosoft.com');
  });

  it('sends Authorization: Bearer header', async () => {
    let capturedHeaders: Record<string, string> = {};

    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return new Response(
        JSON.stringify({ mail: 'x@y.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as jest.Mock;

    await getOutlookUserEmail('my-token');
    expect(capturedHeaders['Authorization']).toBe('Bearer my-token');
  });

  it('throws when Graph API returns a non-OK response', async () => {
    global.fetch = jest.fn(async () =>
      new Response('Unauthorized', { status: 401 })
    ) as jest.Mock;

    await expect(getOutlookUserEmail('bad-token')).rejects.toThrow(
      'Microsoft Graph /me failed'
    );
  });
});
