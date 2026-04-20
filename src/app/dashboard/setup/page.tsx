'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, Loader2, CheckCircle, ExternalLink, Key, Shield } from 'lucide-react';
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

  // If the user already configured a key and hit /setup directly (rather than
  // the ?edit=1 flow from settings), send them on to the inbox. The layout
  // guard already redirects unconfigured users *to* this page — we just don't
  // want them to get stuck here once they're done.
  useEffect(() => {
    if (editing) { setInitialCheckDone(true); return; }
    fetch('/api/profile/ai-key').then((r) => r.json()).then((data) => {
      if (data.configured) router.replace('/dashboard/inbox');
      else setInitialCheckDone(true);
    }).catch(() => setInitialCheckDone(true));
  }, [editing, router]);

  // Auto-fill model whenever provider changes so the user sees a reasonable
  // default (they can edit it). Blank for 'custom' because we can't guess.
  useEffect(() => {
    setModel(spec.defaultModel);
    if (!spec.requiresBaseURL) setBaseURL('');
  }, [spec.defaultModel, spec.requiresBaseURL]);

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
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl mb-4">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'DM Serif Display, serif' }}>
            {editing ? 'Update AI provider' : 'One more step'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            MailMind uses an LLM of your choice to summarise, classify and compose email. Bring your own key from any
            supported provider — it's encrypted at rest and never shared.
          </p>
        </div>

        {success ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Key validated and saved.</p>
            <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-1">Taking you to the inbox…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 space-y-4">
            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value as AIProviderId)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50">
                {PROVIDER_LIST.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {spec.docsUrl && (
                <a href={spec.docsUrl} target="_blank" rel="noopener" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                  Get a key <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Custom base URL — only for 'custom' */}
            {spec.requiresBaseURL && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Base URL</label>
                <input type="url" value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1" required
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50" />
                <p className="text-xs text-muted-foreground mt-1">
                  Any OpenAI-compatible endpoint works. The path should end where <code className="text-foreground">/chat/completions</code> would follow.
                </p>
              </div>
            )}

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Model</label>
              <input type="text" value={model} onChange={(e) => setModel(e.target.value)}
                placeholder={spec.defaultModel || 'model-name'} required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50" />
              {spec.defaultModel && (
                <p className="text-xs text-muted-foreground mt-1">Default: <code className="text-foreground">{spec.defaultModel}</code></p>
              )}
            </div>

            {/* API key */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">API key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder={spec.keyHint} required autoComplete="off"
                  className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                We send a tiny test request to verify the key before saving.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg py-2.5 transition-all">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Validating…</> : <><Sparkles className="w-4 h-4" /> Save & continue</>}
            </button>

            <div className="flex items-start gap-2 p-3 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground">
              <Shield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>Your key is encrypted with AES-256-GCM before being stored. It is never returned to the browser and is never logged.</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
