import { NextResponse } from 'next/server';

/**
 * Standardised API error responses
 */
export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiUnauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function apiBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function apiNotFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function apiTooManyRequests(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

/**
 * Wraps an async API handler with error catching
 */
export function withErrorHandler(
  handler: (...args: unknown[]) => Promise<NextResponse>
) {
  return async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error('API Error:', err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      return apiError(message);
    }
  };
}

/**
 * Classify OpenAI errors for better messaging
 */
export function classifyOpenAIError(err: unknown): string {
  const message = (err as Error).message || '';
  if (message.includes('rate_limit')) return 'AI rate limit reached. Please wait a moment.';
  if (message.includes('invalid_api_key')) return 'Invalid OpenAI API key. Check your configuration.';
  if (message.includes('insufficient_quota')) return 'OpenAI quota exceeded. Check your billing.';
  if (message.includes('context_length')) return 'Email is too long for AI processing.';
  return `AI error: ${message}`;
}
