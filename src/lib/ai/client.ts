import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/crypto';
import { PROVIDERS, type AIProviderId, type ProviderSpec } from './providers';

// ============================================================
// Per-user AI client. The model is configured per user in their
// profile row (ai_provider, ai_model, ai_base_url, ai_api_key_encrypted).
// Every AI call takes a userId and looks up the caller's config —
// MailMind has no shared LLM spend beyond the admin keys used for
// validation-time test calls.
// ============================================================

export interface UserAIConfig {
  provider: AIProviderId;
  model: string;
  baseURL?: string;    // For 'custom' providers (and used as override for known ones)
  apiKey: string;      // Decrypted
}

export class AIKeyMissingError extends Error {
  constructor() {
    super('AI_KEY_MISSING');
    this.name = 'AIKeyMissingError';
  }
}

const supabase = createSupabaseAdminClient();

// Reads profile row, decrypts the key, returns a normalized config.
// Throws AIKeyMissingError if the user hasn't completed AI setup —
// the caller (API route) surfaces this as a 428 so the UI can prompt.
export async function getUserAIConfig(userId: string): Promise<UserAIConfig> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_provider, ai_model, ai_base_url, ai_api_key_encrypted')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`getUserAIConfig: ${error.message}`);
  if (!data || !data.ai_api_key_encrypted || !data.ai_provider) {
    throw new AIKeyMissingError();
  }

  const spec = PROVIDERS[data.ai_provider as AIProviderId];
  if (!spec) throw new Error(`Unknown provider: ${data.ai_provider}`);

  return {
    provider: data.ai_provider as AIProviderId,
    model: data.ai_model || spec.defaultModel,
    baseURL: data.ai_base_url || spec.baseURL,
    apiKey: decryptSecret(data.ai_api_key_encrypted),
  };
}

// ============================================================
// Unified chat completion — accepts a system + user message pair,
// returns the assistant text. Routes to OpenAI SDK for every
// "openai-compatible" provider and to the Anthropic SDK for Claude.
// ============================================================

export interface ChatRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export async function chatComplete(userId: string, req: ChatRequest): Promise<string> {
  const cfg = await getUserAIConfig(userId);
  return chatCompleteWithConfig(cfg, req);
}

// Same as chatComplete but with a supplied config — used by the setup flow's
// "validate key" step, which has the key in hand but hasn't persisted it yet.
export async function chatCompleteWithConfig(cfg: UserAIConfig, req: ChatRequest): Promise<string> {
  const spec = PROVIDERS[cfg.provider];
  if (!spec) throw new Error(`Unknown provider: ${cfg.provider}`);

  const maxTokens = req.maxTokens ?? 1024;
  const temperature = req.temperature ?? 0.7;

  if (spec.shape === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      temperature,
    });
    const block = response.content[0];
    return block && block.type === 'text' ? block.text : '';
  }

  // OpenAI-compatible path (OpenAI, Gemini, Groq, Mistral, NVIDIA, DeepSeek, xAI, custom)
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
  const response = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
  });
  return response.choices[0]?.message?.content ?? '';
}

// Helper used by /api/profile/ai-key to validate a user-supplied key
// before persisting it. Makes a tiny 1-token call to the configured
// provider/model — any auth/quota failure surfaces as an error string.
export async function validateAIConfig(cfg: UserAIConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await chatCompleteWithConfig(cfg, {
      system: 'You are a test.',
      user: 'Reply with the single word OK.',
      maxTokens: 5,
      temperature: 0,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
