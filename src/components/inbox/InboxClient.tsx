'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Email, EmailFilters, EmailConnection } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Search, Filter, X, Mail, RefreshCw, Reply, Sparkles, Star, Paperclip } from 'lucide-react';
import EmailDetailPanel from './EmailDetailPanel';
import dynamic from 'next/dynamic';

// Stable colour pick for sender-initial avatars — matches the design prototype.
const AVATAR_COLORS = ['#004E6E', '#8DC63F', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];
function avatarInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const ComposeModal = dynamic(() => import('@/components/compose/ComposeModal'), { ssr: false });

const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  HIGH:   { label: 'High',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  MEDIUM: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  LOW:    { label: 'Low',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const CATEGORY_COLORS: Record<string, string> = {
  Sales:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Client:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Internal:  'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  Finance:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  Other:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

interface Props {
  initialEmails: Email[];
  initialFilters: EmailFilters;
}

export default function InboxClient({ initialEmails, initialFilters }: Props) {
  const [emails, setEmails] = useState(initialEmails);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [filters, setFilters] = useState<EmailFilters>(initialFilters);
  const [search, setSearch] = useState(initialFilters.search || '');
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [connections, setConnections] = useState<Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider' | 'signature'>[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  // When set to an email id, EmailDetailPanel opens directly into AI-reply mode
  const [replyForId, setReplyForId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());

  function openEmail(email: Email, reply = false) {
    setSelectedEmail((prev) => (prev?.id === email.id && !reply ? null : email));
    setReplyForId(reply ? email.id : null);
  }

  // Load connections for reply routing
  useEffect(() => {
    fetch('/api/connections').then((r) => r.json()).then((d) => setConnections(d.connections || []));
  }, []);

  const applyFilters = useCallback(async (newFilters: EmailFilters) => {
    setLoading(true);
    setFilters(newFilters);
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => { if (v !== undefined && v !== null) params.set(k, String(v)); });
    const res = await fetch(`/api/emails?${params}&limit=100`);
    const data = await res.json();
    setEmails(data.emails || []);
    setLoading(false);
  }, []);

  // Refetch emails when the sidebar's "Sync All Inboxes" finishes — avoids a
  // full router.refresh() which would invalidate every RSC segment on the page.
  useEffect(() => {
    const handler = () => { applyFilters(filters); };
    window.addEventListener('mailmind:sync-complete', handler);
    return () => window.removeEventListener('mailmind:sync-complete', handler);
  }, [applyFilters, filters]);

  function clearFilter(key: keyof EmailFilters) {
    const nf = { ...filters };
    delete nf[key];
    applyFilters(nf);
  }

  const activeCount = Object.keys(filters).filter((k) => k !== 'limit' && (filters as Record<string, unknown>)[k] !== undefined).length;

  // Account filter pill labels
  const connMap = Object.fromEntries(connections.map((c) => [c.id, c]));

  return (
    <div className="flex h-full overflow-hidden">
      {/* Email list */}
      <div className={`flex flex-col ${selectedEmail ? 'w-[360px] flex-shrink-0' : 'flex-1'} bg-card border-r border-border`}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[19px] font-bold text-foreground tracking-tight">Inbox</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-[3px] rounded-full">
                {emails.length} messages
              </span>
              <button onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${showFilters || activeCount > 0 ? 'bg-primary/10 border-primary/20 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                <Filter className="w-3 h-3" />
                Filters
                {activeCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium">{activeCount}</span>
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-[11px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters({ ...filters, search: search || undefined })}
              placeholder="Search messages…"
              className="w-full bg-muted border border-border rounded-[9px] pl-[33px] pr-4 py-2 text-[13px] text-foreground outline-none focus:border-primary transition-colors" />
            {search && (
              <button onClick={() => { setSearch(''); applyFilters({ ...filters, search: undefined }); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="mt-2.5 p-3 bg-muted/30 border border-border rounded-xl grid grid-cols-2 gap-2">
              {[
                { key: 'priority', opts: ['HIGH', 'MEDIUM', 'LOW'] },
                { key: 'category', opts: ['Sales', 'Client', 'Internal', 'Finance', 'Marketing'] },
                { key: 'type', opts: ['New Request', 'Quotation', 'Complaint', 'Update', 'Reply Received'] },
              ].map(({ key, opts }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-muted-foreground block mb-1 capitalize">{key}</label>
                  <select value={(filters as Record<string, string>)[key] || ''} onChange={(e) => applyFilters({ ...filters, [key]: e.target.value || undefined })}
                    className="w-full bg-background border border-border rounded text-xs py-1.5 px-2 text-foreground focus:outline-none">
                    <option value="">All</option>
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              {/* Account filter */}
              {connections.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Account</label>
                  <select value={filters.connection_id || ''} onChange={(e) => applyFilters({ ...filters, connection_id: e.target.value || undefined })}
                    className="w-full bg-background border border-border rounded text-xs py-1.5 px-2 text-foreground focus:outline-none">
                    <option value="">All accounts</option>
                    {connections.map((c) => <option key={c.id} value={c.id}>{c.nickname || c.email}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={filters.requires_reply === true}
                    onChange={(e) => applyFilters({ ...filters, requires_reply: e.target.checked ? true : undefined })}
                    className="rounded border-border" />
                  <span className="text-muted-foreground">Needs reply</span>
                </label>
              </div>
            </div>
          )}

          {/* Active chips */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(filters).filter(([k, v]) => k !== 'limit' && v !== undefined).map(([key, value]) => {
                const label = key === 'connection_id' && connMap[value as string]
                  ? (connMap[value as string]?.nickname || connMap[value as string]?.email)
                  : String(value);
                return (
                  <span key={key} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded-full px-2.5 py-1 font-medium">
                    {label}
                    <button onClick={() => clearFilter(key as keyof EmailFilters)}><X className="w-3 h-3" /></button>
                  </span>
                );
              })}
              <button onClick={() => applyFilters({ limit: 100 })} className="text-xs text-muted-foreground hover:text-foreground underline">Clear all</button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && emails.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">No emails found</p>
              <p className="text-sm text-muted-foreground mt-1">Try syncing or adjusting your filters</p>
            </div>
          )}
          {!loading && emails.map((email, i) => {
            const active = selectedEmail?.id === email.id;
            const displayName = email.sender_name || email.sender;
            const isStarred = starred.has(email.id);
            return (
              <div key={email.id}
                role="button" tabIndex={0}
                onClick={() => openEmail(email)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEmail(email); } }}
                className="cursor-pointer border-b border-border"
                style={{
                  padding: '13px 14px 11px',
                  background: active
                    ? 'rgba(0,78,110,0.06)'
                    : !email.is_read ? 'rgba(141,198,63,0.04)' : 'hsl(var(--card))',
                  borderLeft: active ? '3px solid hsl(var(--brand-teal))' : '3px solid transparent',
                  transition: 'background 0.1s',
                  animation: `fadeUp 0.15s ${Math.min(i, 12) * 0.03}s both`,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(0,78,110,0.03)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = !email.is_read ? 'rgba(141,198,63,0.04)' : 'hsl(var(--card))'; }}
              >
                <div className="flex items-start gap-2.5">
                  {/* Sender avatar — coloured initials circle */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0 mt-[1px]"
                    style={{ background: avatarColor(displayName) }}
                  >
                    {avatarInitials(displayName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="truncate text-foreground"
                        style={{ fontSize: 13.5, fontWeight: email.is_read ? 500 : 700, maxWidth: '70%' }}>
                        {displayName}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {email.attachments && email.attachments.filter((a) => !a.inline).length > 0 && (
                          <Paperclip className="w-3 h-3 text-muted-foreground" aria-label="Has attachments" />
                        )}
                        <span className="text-[11.5px] text-muted-foreground">
                          {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-[3px]">
                      {!email.is_read && (
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: 'hsl(var(--brand-teal))' }} />
                      )}
                      <p className="truncate text-foreground flex-1"
                        style={{ fontSize: 13, fontWeight: email.is_read ? 400 : 600 }}>
                        {email.subject}
                      </p>
                    </div>

                    <p className="text-[12px] text-muted-foreground truncate mb-[7px]">
                      {email.snippet || email.summary}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {email.priority && (
                        <span className={`text-[10.5px] font-semibold px-1.5 py-[2px] rounded-full ${PRIORITY_LABELS[email.priority]?.cls}`}>
                          {PRIORITY_LABELS[email.priority]?.label}
                        </span>
                      )}
                      {email.category && (
                        <span className={`text-[10.5px] font-medium px-1.5 py-[2px] rounded-full ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.Other}`}>
                          {email.category}
                        </span>
                      )}
                      {email.requires_reply && (
                        <span className="text-[10.5px] font-semibold px-1.5 py-[2px] rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex items-center gap-1 ml-auto">
                          <Reply className="w-2.5 h-2.5" /> Reply needed
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEmail(email, true); }}
                        className={`inline-flex items-center gap-1 text-[10.5px] px-2 py-[2px] rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 font-semibold transition-colors ${email.requires_reply ? '' : 'ml-auto'}`}
                        title="Draft a reply with AI"
                      >
                        <Sparkles className="w-2.5 h-2.5" /> Reply with AI
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setStarred((s) => {
                            const ns = new Set(s);
                            ns.has(email.id) ? ns.delete(email.id) : ns.add(email.id);
                            return ns;
                          });
                        }}
                        className="p-0.5"
                        title={isStarred ? 'Unstar' : 'Star'}
                      >
                        <Star
                          className="w-[13px] h-[13px]"
                          fill={isStarred ? '#F59E0B' : 'transparent'}
                          color={isStarred ? '#F59E0B' : 'hsl(var(--muted-foreground))'}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedEmail && (
        <EmailDetailPanel
          email={selectedEmail}
          connections={connections}
          autoOpenReply={replyForId === selectedEmail.id}
          onClose={() => { setSelectedEmail(null); setReplyForId(null); }}
        />
      )}

      {/* Compose modal */}
      {composeOpen && connections.length > 0 && (
        <ComposeModal
          connections={connections}
          defaultConnectionId={connections[0]?.id}
          onClose={() => setComposeOpen(false)}
          onSent={() => setComposeOpen(false)}
        />
      )}
    </div>
  );
}
