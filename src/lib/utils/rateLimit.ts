/**
 * Simple in-memory rate limiter for API routes.
 * For production, replace with Redis-backed limiter (e.g. @upstash/ratelimit).
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

interface RateLimitOptions {
  maxRequests: number;   // Max requests in window
  windowMs: number;      // Window size in milliseconds
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    // New window
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    store.set(key, newRecord);
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: newRecord.resetAt };
  }

  if (record.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: options.maxRequests - record.count, resetAt: record.resetAt };
}

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) store.delete(key);
    }
  }, 60_000);
}

// Pre-configured limiters
export const chatRateLimit = (userId: string) =>
  rateLimit(`chat:${userId}`, { maxRequests: 30, windowMs: 60_000 }); // 30/min

export const syncRateLimit = (userId: string) =>
  rateLimit(`sync:${userId}`, { maxRequests: 5, windowMs: 60_000 }); // 5/min
