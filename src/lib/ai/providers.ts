// ============================================================
// LLM PROVIDERS REGISTRY
// Each user brings their own key for one of these providers.
// Most providers are OpenAI-compatible — we route them through
// the OpenAI SDK with a custom baseURL. Anthropic is the one
// outlier that needs its own SDK.
// ============================================================

export type AIProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'nvidia'
  | 'deepseek'
  | 'xai'
  | 'custom';

export interface ProviderSpec {
  id: AIProviderId;
  label: string;
  shape: 'openai-compatible' | 'anthropic';  // How we talk to the API
  baseURL?: string;                            // Not applicable to 'anthropic'
  defaultModel: string;
  keyHint: string;                             // UI helper: expected key prefix/format
  docsUrl: string;
  requiresBaseURL?: boolean;                   // 'custom' lets the user enter one
}

export const PROVIDERS: Record<AIProviderId, ProviderSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shape: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyHint: 'starts with sk-',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    shape: 'anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyHint: 'starts with sk-ant-',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    shape: 'openai-compatible',
    // Gemini exposes an OpenAI-compatible endpoint — no extra SDK needed.
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    keyHint: 'starts with AIza',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    shape: 'openai-compatible',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHint: 'starts with gsk_',
    docsUrl: 'https://console.groq.com/keys',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    shape: 'openai-compatible',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyHint: '32-character string',
    docsUrl: 'https://console.mistral.ai/api-keys',
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA',
    shape: 'openai-compatible',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'google/gemma-3n-e2b-it',
    keyHint: 'starts with nvapi-',
    docsUrl: 'https://build.nvidia.com/settings/api-keys',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    shape: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    keyHint: 'starts with sk-',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    shape: 'openai-compatible',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-latest',
    keyHint: 'starts with xai-',
    docsUrl: 'https://console.x.ai',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    shape: 'openai-compatible',
    defaultModel: '',
    keyHint: 'any string your endpoint accepts',
    docsUrl: '',
    requiresBaseURL: true,
  },
};

export const PROVIDER_LIST: ProviderSpec[] = Object.values(PROVIDERS);
