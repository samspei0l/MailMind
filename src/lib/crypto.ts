import crypto from 'crypto';

// ============================================================
// AES-256-GCM for user-supplied API keys.
// The column in profiles stores ciphertext only; plaintext never
// hits the DB. The master secret lives in AI_KEY_ENCRYPTION_SECRET
// (a random 32-byte string, base64 or hex). On-disk format is
// "iv:authTag:ciphertext", all base64 — this lets us rotate the
// secret by re-encrypting if we ever need to.
// ============================================================

function getKey(): Buffer {
  const raw = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!raw) {
    throw new Error(
      'AI_KEY_ENCRYPTION_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to .env.local.',
    );
  }
  // Accept either base64 or hex; derive a 32-byte key via SHA-256 if the raw
  // input isn't exactly 32 bytes after decoding, so misconfigured secrets
  // still produce a usable key rather than crashing the process.
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  const [ivB64, tagB64, ctB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Invalid encrypted payload format');
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// Mask for display — show last 4 characters only.
// Used by the settings UI so users recognize which key is saved
// without exposing the secret.
export function maskKey(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '••••';
  return `${'•'.repeat(Math.max(4, plaintext.length - 4))}${plaintext.slice(-4)}`;
}
