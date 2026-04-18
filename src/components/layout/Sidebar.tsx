'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { EmailConnection, EmailTone } from '@/types';
import {
  Inbox, MessageSquare, Settings, LogOut, Sparkles,
  RefreshCw, ChevronRight, PenLine, Plus, History,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load the compose modal to avoid SSR issues with MediaRecorder
const ComposeModal = dynamic(() => import('@/components/compose/ComposeModal'), { ssr: false });

const NAV_ITEMS = [
  { href: '/dashboard/inbox',   icon: Inbox, label: 'Inbox' },
  { href: '/dashboard/chat',    icon: MessageSquare, label: 'Chat' },
  { href: '/dashboard/history', icon: History, label: 'History' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

const PROVIDER_ICONS: Record<string, string> = { gmail: 'G', outlook: '⊞', yahoo: 'Y!', icloud: '', other: '@' };

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [connections, setConnections] = useState<Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider'>[]>([]);

  useEffect(() => {
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d) => setConnections(d.connections || []));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setProgress(5);

    // Advance the bar asymptotically toward 90% while we wait on the server —
    // gives the user a real sense of motion without claiming we know progress
    // we don't have. The bar snaps to 100% as soon as the response lands.
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      // Logistic-ish curve: quick at first, tapering toward 90%
      const pct = Math.min(90, 90 * (1 - Math.exp(-elapsed / 8000)));
      setProgress(pct);
    }, 150);

    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults: 50 }),
      });
      const data = await res.json();
      clearInterval(tick);
      setProgress(100);

      if (data.error) {
        setSyncResult(`Sync failed: ${data.error}`);
      } else if (data.newEmails === 0) {
        setSyncResult("You're already up to date");
      } else {
        const parts: string[] = [];
        if (typeof data.newEmails === 'number') parts.push(`${data.newEmails} new email${data.newEmails !== 1 ? 's' : ''}`);
        if (typeof data.accounts === 'number') parts.push(`${data.accounts} account${data.accounts !== 1 ? 's' : ''}`);
        setSyncResult(parts.length ? `Synced ${parts.join(' from ')}` : 'Sync complete');
      }
    } catch (err) {
      clearInterval(tick);
      setProgress(100);
      setSyncResult(`Sync failed: ${(err as Error).message}`);
    } finally {
      // Let the 100% state linger briefly so the user registers completion,
      // then clear the bar. The result line stays a bit longer.
      setTimeout(() => { setSyncing(false); setProgress(0); }, 400);
      setTimeout(() => setSyncResult(null), 4000);

      if (pathname.startsWith('/dashboard/inbox')) {
        window.dispatchEvent(new CustomEvent('mailmind:sync-complete'));
      } else {
        router.refresh();
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  const initials = (user.user_metadata?.full_name || user.email || 'U')
    .split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();

  return (
    <>
      <aside className="sidebar w-64 flex-shrink-0 flex flex-col h-full">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <span className="text-white font-semibold" style={{ fontFamily: 'DM Serif Display, serif' }}>MailMind</span>
          </div>
        </div>

        {/* Compose button */}
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => setComposeOpen(true)}
            disabled={connections.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-2.5 px-3 text-sm font-medium transition-all shadow-sm"
          >
            <PenLine className="w-3.5 h-3.5" />
            Compose
          </button>
        </div>

        {/* Sync button + progress */}
        <div className="px-4 pb-3">
          <button
            onClick={handleSync}
            disabled={syncing || connections.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-xl py-2 px-3 text-xs font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync All Inboxes'}
          </button>
          {syncing && (
            <div className="mt-2 h-1 w-full bg-blue-500/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {!syncing && syncResult && (
            <p className="mt-2 text-[10px] text-slate-400 text-center truncate" title={syncResult}>
              {syncResult}
            </p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wider px-3 py-2">Navigation</p>
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${active ? 'bg-blue-600/20 text-white border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 text-blue-400/60" />}
              </Link>
            );
          })}
        </nav>

        {/* Connected accounts */}
        <div className="px-4 pb-2">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wider py-2">Accounts</p>
          {connections.length === 0 ? (
            <Link href="/dashboard/settings"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-all">
              <Plus className="w-3 h-3" /> Connect an account
            </Link>
          ) : (
            <div className="space-y-1">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                    style={{ background: c.color || '#3b82f6' }}>
                    {PROVIDER_ICONS[c.provider] || '@'}
                  </div>
                  <span className="text-xs text-slate-400 truncate flex-1">{c.nickname || c.email}</span>
                </div>
              ))}
              {connections.length < 5 && (
                <Link href="/dashboard/settings"
                  className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 px-2 py-1 rounded-lg hover:bg-white/5 transition-all">
                  <Plus className="w-3 h-3" /> Add account
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Quick prompts */}
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wider py-2">Quick Actions</p>
          {[
            { label: 'Show urgent emails',         query: 'Show all high priority emails' },
            { label: 'Follow-ups needed',          query: 'Show quotation and invoice emails that are waiting for a reply' },
            { label: 'Emails needing reply',       query: 'Show emails that need a reply' },
            { label: "Today's summary",            query: "Summarise today's emails" },
            { label: "This week's summary",        query: "Give me a summary of this week's emails" },
            { label: 'Show complaints',            query: 'Show all complaint emails' },
          ].map((p) => (
            <Link key={p.label} href={`/dashboard/chat?q=${encodeURIComponent(p.query)}`}
              className="block text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded px-2 py-1.5 transition-all truncate">
              → {p.label}
            </Link>
          ))}
        </div>

        {/* User */}
        <div className="border-t border-[hsl(var(--sidebar-border))] p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600/30 border border-blue-500/30 rounded-full flex items-center justify-center text-xs font-semibold text-blue-300 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.user_metadata?.full_name || 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Compose modal */}
      {composeOpen && connections.length > 0 && (
        <ComposeModal
          connections={connections}
          defaultConnectionId={connections[0]?.id}
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}
