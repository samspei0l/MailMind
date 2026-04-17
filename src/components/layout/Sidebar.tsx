'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { EmailConnection, EmailTone } from '@/types';
import {
  Inbox, MessageSquare, Settings, LogOut, Sparkles,
  RefreshCw, ChevronRight, PenLine, Plus,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Lazy-load the compose modal to avoid SSR issues with MediaRecorder
const ComposeModal = dynamic(() => import('@/components/compose/ComposeModal'), { ssr: false });

const NAV_ITEMS = [
  { href: '/dashboard/inbox', icon: Inbox, label: 'Inbox' },
  { href: '/dashboard/chat',  icon: MessageSquare, label: 'Chat' },
  { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

const PROVIDER_ICONS: Record<string, string> = { gmail: 'G', outlook: '⊞', yahoo: 'Y!', icloud: '', other: '@' };

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseClient();
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [connections, setConnections] = useState<Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider'>[]>([]);

  useEffect(() => {
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d) => setConnections(d.connections || []));
  }, []);

  async function handleSync() {
    setSyncing(true);
    await fetch('/api/emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxResults: 50 }) });
    setSyncing(false);
    router.refresh();
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

        {/* Sync button */}
        <div className="px-4 pb-3">
          <button
            onClick={handleSync}
            disabled={syncing || connections.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-xl py-2 px-3 text-xs font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync All Inboxes'}
          </button>
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
            'Show urgent emails',
            'Summarise yesterday',
            'Show quotation emails',
          ].map((p) => (
            <Link key={p} href={`/dashboard/chat?q=${encodeURIComponent(p)}`}
              className="block text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded px-2 py-1.5 transition-all truncate">
              → {p}
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
