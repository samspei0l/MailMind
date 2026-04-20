import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getAIConfigForUser, updateUserAIConfig } from '@/lib/supabase/db';
import { encryptSecret } from '@/lib/crypto';
import { PROVIDERS, type AIProviderId } from '@/lib/ai/providers';
import { validateAIConfig } from '@/lib/ai/client';

// GET /api/profile/ai-key — return masked config (never the plaintext key).
// The UI reads this to render the setup/settings form without exposing the
// secret — we only confirm whether a key is present.
export async function GET() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cfg = await getAIConfigForUser(user.id);
  return NextResponse.json({
    configured: !!cfg?.has_key,
    provider: cfg?.ai_provider ?? null,
    model: cfg?.ai_model ?? null,
    base_url: cfg?.ai_base_url ?? null,
  });
}

// POST /api/profile/ai-key — save provider + key after a test call to the
// target model. If the test call fails (bad key, wrong base URL, quota)
// we reject with a 400 so the UI can show the underlying error.
//
// Body: { provider: AIProviderId, api_key: string, model?: string, base_url?: string }
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const provider = body.provider as AIProviderId | undefined;
  const apiKey = (body.api_key || '').toString().trim();
  const modelIn = (body.model || '').toString().trim();
  const baseUrlIn = (body.base_url || '').toString().trim();

  if (!provider || !PROVIDERS[provider]) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
  }

  const spec = PROVIDERS[provider];
  const model = modelIn || spec.defaultModel;
  const baseURL = baseUrlIn || spec.baseURL;

  if (spec.requiresBaseURL && !baseURL) {
    return NextResponse.json({ error: 'base_url is required for custom providers' }, { status: 400 });
  }
  if (spec.shape === 'openai-compatible' && !model) {
    return NextResponse.json({ error: 'model is required' }, { status: 400 });
  }

  // 1-token test call before persisting. Catches bad keys, wrong endpoints,
  // and unreachable custom URLs before the user hits them from the app.
  const validation = await validateAIConfig({ provider, model, baseURL, apiKey });
  if (!validation.ok) {
    return NextResponse.json({
      error: `Validation failed: ${validation.error}`,
    }, { status: 400 });
  }

  const encryptedKey = encryptSecret(apiKey);
  await updateUserAIConfig(user.id, {
    email: user.email || `${user.id}@unknown`,
    provider,
    model,
    baseURL: baseURL || null,
    encryptedKey,
  });

  return NextResponse.json({
    configured: true,
    provider,
    model,
    base_url: baseURL || null,
  });
}
