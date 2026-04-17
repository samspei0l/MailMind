'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Email, EmailFilters, EmailConnection } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Search, Filter, X, Mail, RefreshCw, Reply } from 'lucide-react';
import EmailDetailPanel from './EmailDetailPanel';
import dynamic from 'next/dynamic';

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
  const [connections, setConnections] = useState<Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider'>[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);

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
      <div className={`flex flex-col ${selectedEmail ? 'w-[400px] flex-shrink-0' : 'flex-1'} border-r border-border`}>
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
              <p className="text-xs text-muted-foreground">{emails.length} messages</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setComposeOpen(true)} disabled={connections.length === 0}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-40">
                + Compose
              </button>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters({ ...filters, search: search || undefined })}
              placeholder="Search emails..."
              className="w-full bg-muted/50 border border-border rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all" />
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
          {!loading && emails.map((email) => {
            // Show account color dot if multiple accounts
            const conn = connections.find((c) => c.id === email.connection_id);
            return (
              <button key={email.id} onClick={() => setSelectedEmail(email.id === selectedEmail?.id ? null : email)}
                className={`w-full text-left px-4 py-3.5 border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedEmail?.id === email.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''} ${!email.is_read ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}`}>
                <div className="flex items-start gap-2.5">
                  {/* Account color + unread dot */}
                  <div className="flex flex-col items-center gap-1 mt-1.5 flex-shrink-0">
                    {conn && connections.length > 1 && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: conn.color }} title={conn.nickname || conn.email} />
                    )}
                    {!email.is_read
                      ? <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      : <div className="w-1.5 h-1.5 rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${!email.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                        {email.sender_name || email.sender}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className={`text-sm truncate mb-1 ${!email.is_read ? 'text-foreground' : 'text-foreground/70'}`}>{email.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{email.snippet || email.summary}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {email.priority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_LABELS[email.priority]?.cls}`}>
                          {PRIORITY_LABELS[email.priority]?.label}
                        </span>
                      )}
                      {email.category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.Other}`}>
                          {email.category}
                        </span>
                      )}
                      {email.requires_reply && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-medium flex items-center gap-1">
                          <Reply className="w-2.5 h-2.5" /> Reply needed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedEmail && (
        <EmailDetailPanel
          email={selectedEmail}
          connections={connections}
          onClose={() => setSelectedEmail(null)}
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
