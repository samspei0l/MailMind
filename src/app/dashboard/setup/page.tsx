'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  Sparkles, Loader2, CheckCircle, ExternalLink, Key, Shield, Globe,
} from 'lucide-react';
import { PROVIDER_LIST, PROVIDERS, type AIProviderId } from '@/lib/ai/providers';

export default function AISetupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editing = params.get('edit') === '1';

  const [provider, setProvider] = useState<AIProviderId>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const spec = PROVIDERS[provider];

  // Setup-flow guard: a configured user lands here only via ?edit=1.
  // Otherwise bounce to the inbox so they don't get stuck.
  useEffect(() => {
    if (editing) { setInitialCheckDone(true); return; }
    fetch('/api/profile/ai-key').then((r) => r.json()).then((data) => {
      if (data.configured) router.replace('/dashboard/inbox');
      else setInitialCheckDone(true);
    }).catch(() => setInitialCheckDone(true));
  }, [editing, router]);

  // Provider switch resets model + (if applicable) base URL to provider defaults.
  useEffect(() => {
    setModel(spec.defaultModel);
    setBaseURL(spec.requiresBaseURL || spec.baseURLEditable ? (spec.baseURL || '') : '');
  }, [spec.defaultModel, spec.requiresBaseURL, spec.baseURLEditable, spec.baseURL]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/profile/ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          api_key: apiKey.trim(),
          model: model.trim(),
          base_url: baseURL.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return; }
      setSuccess(true);
      setLoading(false);
      setTimeout(() => router.replace('/dashboard/inbox'), 900);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (!initialCheckDone) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'hsl(var(--brand-lime))' }} />
      </div>
    );
  }

  const showBaseURL = !!(spec.requiresBaseURL || spec.baseURLEditable);
  const hasModelDropdown = !!(spec.models && spec.models.length);

  return (
    <div
      className="flex-1 overflow-y-auto relative"
      style={{
        background:
          'radial-gradient(800px 400px at 50% -100px, rgba(0,78,110,0.08), transparent 60%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background)) 100%)',
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl" style={{ background: 'rgba(141,198,63,0.06)' }} />
        <div className="absolute -bottom-32 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl" style={{ background: 'rgba(0,95,135,0.06)' }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        {/* Branded header */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 8px 28px rgba(0,78,110,0.18), inset 0 1px 0 rgba(255,255,255,0.8)',
              padding: 12,
            }}
          >
            <Image src="/mailmind-logo.png" alt="MailMind" width={44} height={44} className="object-contain" priority />
          </div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'DM Serif Display, serif' }}>
            {editing ? 'Update AI provider' : 'Connect your AI'}
          </h1>
          <p className="text-[11px] font-medium text-muted-foreground/70 mt-0.5 tracking-wide">
            by Verizon Group
          </p>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-md mx-auto">
            MailMind uses an LLM of your choice to summarise, classify and compose email. Bring your own key —
            it's encrypted at rest and never shared.
          </p>
        </div>

        {success ? (
          <div className="bg-card border rounded-2xl p-6 text-center" style={{ borderColor: 'rgba(141,198,63,0.4)', background: 'rgba(141,198,63,0.06)' }}>
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(141,198,63,0.18)', border: '1px solid rgba(141,198,63,0.4)' }}
            >
              <CheckCircle className="w-7 h-7" style={{ color: 'hsl(var(--brand-limeD))' }} />
            </div>
            <p className="text-base font-semibold text-foreground">Key validated and saved</p>
            <p className="text-sm text-muted-foreground mt-1">Taking you to the inbox…</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm"
            style={{ boxShadow: '0 4px 24px rgba(0,78,110,0.06)' }}
          >
            {/* Provider grid */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Provider</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROVIDER_LIST.map((p) => {
                  const selected = provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProvider(p.id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-all text-sm ${
                        selected
                          ? 'font-semibold'
                          : 'border-border hover:border-primary/30 hover:bg-primary/5 text-foreground'
                      }`}
                      style={
                        selected
                          ? {
                              borderColor: 'hsl(var(--brand-lime))',
                              background: 'rgba(141,198,63,0.10)',
                              color: 'hsl(var(--brand-limeD))',
                            }
                          : undefined
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {spec.docsUrl && (
                <a
                  href={spec.docsUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  style={{ color: 'hsl(var(--brand-limeD))' }}
                >
                  Get a {spec.label} key <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Base URL — for 'custom' (required) or any provider that lets you override (Ollama) */}
            {showBaseURL && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  Base URL {spec.requiresBaseURL ? <span className="text-red-500">*</span> : <span className="text-xs font-normal text-muted-foreground">(override default)</span>}
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="url"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    placeholder={spec.baseURL || 'https://api.example.com/v1'}
                    required={spec.requiresBaseURL}
                    className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 transition-all"
                    style={{ outline: 'none' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--brand-lime))'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(141,198,63,0.15)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                  />
                </div>
                {provider === 'ollama' && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Default is Ollama Cloud. Self-hosted users can point this at e.g. <code className="text-foreground">http://localhost:11434/v1</code>.
                  </p>
                )}
                {spec.requiresBaseURL && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Any OpenAI-compatible endpoint. The path should end where <code className="text-foreground">/chat/completions</code> would follow.
                  </p>
                )}
              </div>
            )}

            {/* Model — dropdown when provider has a known model list, otherwise free text */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Model</label>
              {hasModelDropdown ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none transition-all"
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--brand-lime))'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(141,198,63,0.15)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                  {spec.models!.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={spec.defaultModel || 'model-name'}
                  required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none transition-all"
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--brand-lime))'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(141,198,63,0.15)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                />
              )}
              {!hasModelDropdown && spec.defaultModel && (
                <p className="text-xs text-muted-foreground mt-1.5">Default: <code className="text-foreground">{spec.defaultModel}</code></p>
              )}
              {provider === 'ollama' && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Cloud-hosted models run on Ollama&apos;s GPUs. The <code className="text-foreground">-cloud</code> suffix routes the request to a hosted instance.
                </p>
              )}
            </div>

            {/* API key */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">API key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={spec.keyHint}
                  required
                  autoComplete="off"
                  className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono focus:outline-none transition-all"
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'hsl(var(--brand-lime))'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(141,198,63,0.15)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = ''; }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                We send a tiny test request to verify the key before saving.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-lg py-3 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'hsl(var(--brand-lime))',
                boxShadow: '0 4px 14px rgba(141,198,63,0.35)',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'hsl(var(--brand-limeD))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'hsl(var(--brand-lime))'; }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Validating…</>
                : <><Sparkles className="w-4 h-4" /> Save &amp; continue</>}
            </button>

            <div
              className="flex items-start gap-2 p-3 rounded-lg text-xs"
              style={{ background: 'rgba(0,78,110,0.04)', border: '1px solid rgba(0,78,110,0.1)' }}
            >
              <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--brand-limeD))' }} />
              <span className="text-muted-foreground leading-relaxed">
                Your key is encrypted with <strong className="text-foreground">AES-256-GCM</strong> before being stored. It is never returned to the browser and is never logged.
              </span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
