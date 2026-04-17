'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle, XCircle, Loader2, RefreshCw, Trash2,
  Plus, Edit2, Check, Shield, X, Clock,
} from 'lucide-react';
import { ACCOUNT_COLORS, MAX_EMAIL_ACCOUNTS, SYNC_FREQUENCY_OPTIONS, type SyncFrequency } from '@/types';

interface Conn {
  id: string; provider: string; email: string;
  nickname: string | null; color: string; last_sync_at: string | null;
}

const PROVIDERS = {
  gmail:   { name: 'Gmail',      icon: '📧', url: '/api/auth/gmail/connect' },
  outlook: { name: 'Outlook',    icon: '📮', url: '/api/auth/outlook/connect' },
  yahoo:   { name: 'Yahoo Mail', icon: '📨', url: '/api/auth/yahoo/connect' },
  icloud:  { name: 'iCloud',     icon: '☁️', url: '/api/auth/icloud/connect' },
};

export default function SettingsPage() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncResults, setSyncResults] = useState<Record<string, { synced?: number; enriched?: number; error?: string }>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNick, setEditNick] = useState('');
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>(null);
  const [savingFreq, setSavingFreq] = useState(false);

  const sp = useSearchParams();
  const ok = sp.get('success');
  const err = sp.get('error');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [connsRes, profileRes] = await Promise.all([
      fetch('/api/connections'),
      fetch('/api/profile'),
    ]);
    const connsData = await connsRes.json();
    const profileData = await profileRes.json();
    setConns(connsData.connections || []);
    setSyncFrequency((profileData.profile?.sync_frequency_minutes ?? null) as SyncFrequency);
    setLoading(false);
  }

  async function saveFrequency(value: SyncFrequency) {
    setSavingFreq(true);
    setSyncFrequency(value);
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync_frequency_minutes: value }),
    });
    setSavingFreq(false);
  }

  async function syncConn(id: string) {
    setSyncing(id);
    const res = await fetch('/api/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxResults: 100, connectionId: id }) });
    const d = await res.json();
    setSyncResults((p) => ({ ...p, [id]: d }));
    setSyncing(null);
    load();
  }

  async function disconnect(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? Your emails will remain in the database.`)) return;
    await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function saveNick(id: string) {
    if (editNick.trim()) {
      await fetch('/api/connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, nickname: editNick.trim() }) });
    }
    setEditingId(null);
    load();
  }

  async function setColor(id: string, color: string) {
    await fetch('/api/connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, color }) });
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'DM Serif Display, serif' }}>Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect up to {MAX_EMAIL_ACCOUNTS} email accounts. Replies always send from the receiving account.</p>
        </div>

        {ok === 'gmail_connected' && (
          <div className="mb-5 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> Gmail connected! Click Sync to import your emails.
          </div>
        )}
        {err && (
          <div className="mb-5 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0" /> Error: {decodeURIComponent(err)}
          </div>
        )}

        {/* Accounts section */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">Email Accounts</h2>
            <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">{conns.length}/{MAX_EMAIL_ACCOUNTS} connected</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {conns.map((c) => {
                const pInfo = PROVIDERS[c.provider as keyof typeof PROVIDERS] || { name: c.provider, icon: '📧' };
                const sr = syncResults[c.id];
                const isSyncing = syncing === c.id;
                const isEditing = editingId === c.id;
                return (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 border" style={{ background: c.color + '22', borderColor: c.color + '44' }}>
                        {pInfo.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2 mb-0.5">
                            <input type="text" value={editNick} onChange={(e) => setEditNick(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveNick(c.id); if (e.key === 'Escape') setEditingId(null); }}
                              placeholder="Nickname e.g. Work Gmail" autoFocus
                              className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-ring/50" />
                            <button onClick={() => saveNick(c.id)} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-sm font-semibold text-foreground">{c.nickname || pInfo.name}</p>
                            <button onClick={() => { setEditingId(c.id); setEditNick(c.nickname || ''); }} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        </div>
                        {c.last_sync_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">Synced {formatDistanceToNow(new Date(c.last_sync_at), { addSuffix: true })}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => syncConn(c.id)} disabled={isSyncing}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-all disabled:opacity-50">
                          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> {isSyncing ? 'Syncing...' : 'Sync'}
                        </button>
                        <button onClick={() => disconnect(c.id, c.email)} title="Disconnect"
                          className="p-1.5 text-muted-foreground hover:text-red-500 border border-border hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {sr && (
                      <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${sr.error ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}>
                        {sr.error ? `Error: ${sr.error}` : `✓ Synced ${sr.synced} · AI-enriched ${sr.enriched}`}
                      </div>
                    )}
                    {/* Color picker */}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs text-muted-foreground">Colour:</span>
                      {ACCOUNT_COLORS.map((col) => (
                        <button key={col} onClick={() => setColor(c.id, col)}
                          className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${c.color === col ? 'ring-2 ring-offset-1 ring-foreground/30' : ''}`}
                          style={{ background: col }} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Add more */}
              {conns.length < MAX_EMAIL_ACCOUNTS && (
                <div className="bg-card border border-dashed border-border rounded-2xl p-4">
                  <p className="text-sm font-medium text-foreground mb-3">Add another account <span className="text-xs text-muted-foreground font-normal">({MAX_EMAIL_ACCOUNTS - conns.length} slot{MAX_EMAIL_ACCOUNTS - conns.length !== 1 ? 's' : ''} left)</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PROVIDERS).map(([key, p]) => (
                      <a key={key} href={p.url}
                        className="flex items-center gap-2.5 px-3 py-2.5 border border-border rounded-xl hover:border-primary/30 hover:bg-primary/5 transition-all group">
                        <span>{p.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          {conns.filter((c) => c.provider === key).length > 0 && (
                            <p className="text-xs text-muted-foreground">{conns.filter((c) => c.provider === key).length} already connected</p>
                          )}
                        </div>
                        <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {conns.length >= MAX_EMAIL_ACCOUNTS && (
                <div className="text-center py-3 text-sm text-muted-foreground bg-muted/30 rounded-xl border border-border">
                  Maximum {MAX_EMAIL_ACCOUNTS} accounts reached. Disconnect one to add another.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Auto-sync */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-foreground mb-3">Auto-Sync</h2>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Sync frequency</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How often MailMind pulls new emails from your connected accounts in the background.
                </p>
              </div>
              {savingFreq && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SYNC_FREQUENCY_OPTIONS.map((o) => {
                const selected = syncFrequency === o.value;
                return (
                  <button
                    key={String(o.value)}
                    onClick={() => saveFrequency(o.value)}
                    disabled={savingFreq}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      selected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/30 hover:bg-primary/5'
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{o.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{o.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* AI settings */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-foreground mb-3">AI Configuration</h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            {[
              { label: 'Auto-enrich emails', desc: 'Classify and summarise emails on sync' },
              { label: 'Smart reply routing', desc: 'Replies sent from the receiving account automatically' },
              { label: 'Voice input', desc: 'Record voice and convert to professional email' },
              { label: 'Tone detection', desc: 'Detect tone automatically from your prompt keywords' },
              { label: 'Suggested replies', desc: 'Generate reply drafts for emails that need responses' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                <div className="w-10 h-6 bg-primary rounded-full flex items-center justify-end cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full mx-1 shadow-sm" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl text-xs">
          <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-blue-700 dark:text-blue-400 leading-relaxed">
            <strong>Your data is secure.</strong> OAuth tokens are encrypted. Email content is sent to OpenAI only during analysis. Row-level security ensures only you can access your data.
          </p>
        </div>
      </div>
    </div>
  );
}
