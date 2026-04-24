'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { EmailConnection } from '@/types';
import { MAX_EMAIL_ACCOUNTS } from '@/types';
import {
  Inbox, MessageSquare, Settings, LogOut,
  RefreshCw, PenLine, Plus, History,
  Flame, Reply, CalendarClock, CalendarDays, ShieldAlert, ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ComposeModal = dynamic(() => import('@/components/compose/ComposeModal'), { ssr: false });

const NAV_ITEMS = [
  { href: '/dashboard/inbox',    icon: Inbox,          label: 'Inbox'    },
  { href: '/dashboard/chat',     icon: MessageSquare,  label: 'AI Chat'  },
  { href: '/dashboard/history',  icon: History,        label: 'History'  },
  { href: '/dashboard/settings', icon: Settings,       label: 'Settings' },
];

const QUICK_ACTIONS: { label: string; query: string; icon: LucideIcon; tint: string }[] = [
  { label: 'Urgent emails',       query: 'Show all high priority emails',                                    icon: Flame,         tint: '#EF4444' },
  { label: 'Follow-ups needed',   query: 'Show quotation and invoice emails that are waiting for a reply',   icon: ClipboardList, tint: '#F59E0B' },
  { label: 'Needs a reply',       query: 'Show emails that need a reply',                                     icon: Reply,         tint: '#8DC63F' },
  { label: "Today's summary",     query: "Summarise today's emails",                                          icon: CalendarClock, tint: '#A3D45A' },
  { label: "This week's summary", query: "Give me a summary of this week's emails",                           icon: CalendarDays,  tint: '#5DA9CC' },
  { label: 'Complaints',          query: 'Show all complaint emails',                                         icon: ShieldAlert,   tint: '#F87171' },
];

const PROVIDER_INITIAL: Record<string, string> = { gmail: 'G', outlook: '⊞', yahoo: 'Y', icloud: '', other: '@' };
const PROVIDER_LABEL:   Record<string, string> = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', icloud: 'iCloud', other: 'Email' };

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

    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
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
      <aside className="sidebar w-60 flex-shrink-0 flex flex-col h-full">
        {/* Logo + brand */}
        <div className="px-3.5 pt-4 pb-3.5 flex items-center gap-2.5 border-b border-white/10">
          <div
            className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            <Image src="/mailmind-logo.png" alt="MailMind" width={27} height={27} className="object-contain" priority />
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold leading-tight whitespace-nowrap" style={{ fontSize: 16.5, letterSpacing: '-0.3px' }}>
              MailMind
            </div>
            <div className="text-white/40 font-medium whitespace-nowrap" style={{ fontSize: 9.5, letterSpacing: '0.02em', marginTop: 1.5 }}>
              by Verizon Group
            </div>
          </div>
        </div>

        {/* Compose — lime */}
        <div className="px-2.5 pt-3.5 pb-2.5">
          <button
            onClick={() => setComposeOpen(true)}
            disabled={connections.length === 0}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'hsl(var(--brand-lime))',
              boxShadow: '0 2px 8px rgba(141,198,63,0.35)',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'hsl(var(--brand-limeD))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'hsl(var(--brand-lime))'; }}
          >
            <PenLine className="w-4 h-4" />
            Compose
          </button>
        </div>

        {/* Sync */}
        <div className="px-2.5 pb-3">
          <button
            onClick={handleSync}
            disabled={syncing || connections.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
          >
            <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`} />
            <span className="truncate">{syncing ? 'Syncing…' : 'Sync all inboxes'}</span>
          </button>
          {syncing && (
            <div className="mt-2 h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%`, background: 'hsl(var(--brand-lime))' }}
              />
            </div>
          )}
          {!syncing && syncResult && (
            <p className="mt-2 text-[10px] text-white/50 text-center truncate" title={syncResult}>
              {syncResult}
            </p>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 overflow-y-auto">
          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">Navigation</p>
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                onMouseDown={() => router.prefetch(href)}
                className="group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] mb-0.5 text-[13.5px] overflow-hidden"
                style={{
                  transition: 'background 0.18s ease, color 0.16s ease, box-shadow 0.18s ease',
                  background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                  fontWeight: active ? 600 : 400,
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.15)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  }
                }}
              >
                {active && (
                  <span
                    className="mm-nav-pop absolute left-0"
                    style={{
                      top: '18%',
                      bottom: '18%',
                      width: 3.5,
                      borderRadius: '0 4px 4px 0',
                      background: 'hsl(var(--brand-lime))',
                    }}
                  />
                )}
                <Icon className="w-[17px] h-[17px] flex-shrink-0" />
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Quick actions — chat shortcuts */}
        <div className="px-2.5 pt-2.5 pb-2 border-t border-white/10">
          <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">Quick Actions</p>
          <div className="space-y-[1px]">
            {QUICK_ACTIONS.map(({ label, query, icon: Icon, tint }) => (
              <Link
                key={label}
                href={`/dashboard/chat?q=${encodeURIComponent(query)}`}
                className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                  style={{ background: `${tint}22`, color: tint }}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
                </span>
                <span className="text-[12px] text-white/60 group-hover:text-white truncate flex-1 transition-colors">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Connected accounts */}
        <div className="px-2.5 pt-2.5 pb-2 border-t border-white/10">
          <div className="flex items-center justify-between px-1.5 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/30">Connected</p>
            {connections.length > 0 && (
              <span className="text-[10px] font-semibold text-white/50 bg-white/10 px-1.5 py-[1px] rounded-full">
                {connections.length}/{MAX_EMAIL_ACCOUNTS}
              </span>
            )}
          </div>
          {connections.length === 0 ? (
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 text-[12px] text-white/50 hover:text-white/90 px-2 py-2 rounded-lg hover:bg-white/5 transition-all"
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center bg-white/10">
                <Plus className="w-3.5 h-3.5" />
              </span>
              Connect an account
            </Link>
          ) : (
            <div className="space-y-0.5">
              {connections.map((c) => {
                const providerInitial = PROVIDER_INITIAL[c.provider] || '@';
                const providerLabel = PROVIDER_LABEL[c.provider] || 'Email';
                const accentColor = c.color || 'hsl(var(--brand-lime))';
                return (
                  <div
                    key={c.id}
                    className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    title={`${providerLabel} · ${c.email}`}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ background: accentColor, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.2)' }}
                      >
                        {providerInitial}
                      </div>
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                        style={{
                          background: 'hsl(var(--brand-lime))',
                          borderColor: 'hsl(var(--brand-teal))',
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white/85 truncate leading-tight">
                        {c.nickname || c.email.split('@')[0]}
                      </p>
                      <p className="text-[10.5px] text-white/45 truncate leading-tight">
                        {c.email}
                      </p>
                    </div>
                  </div>
                );
              })}
              {connections.length < MAX_EMAIL_ACCOUNTS && (
                <Link
                  href="/dashboard/settings"
                  className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors mt-0.5"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-dashed flex-shrink-0"
                    style={{ borderColor: 'rgba(255,255,255,0.2)' }}
                  >
                    <Plus className="w-3.5 h-3.5 text-white/50 group-hover:text-white/80 transition-colors" />
                  </span>
                  <span className="text-[11.5px] text-white/50 group-hover:text-white/80 transition-colors">Add account</span>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* User footer */}
        <div className="px-3 py-2.5 border-t border-white/10 flex items-center gap-2.5">
          <div
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
            style={{ background: 'hsl(var(--brand-lime))' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-white truncate">
              {user.user_metadata?.full_name || 'User'}
            </p>
            <p className="text-[11px] text-white/40 truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-white/70 transition-colors p-1 rounded"
            title="Log out"
          >
            <LogOut className="w-[15px] h-[15px]" />
          </button>
        </div>
      </aside>

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
