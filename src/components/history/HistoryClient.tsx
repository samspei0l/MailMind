'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Email } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';
import { Search, Mail, RefreshCw, Inbox, Send, ArrowLeft, MessageSquare } from 'lucide-react';

interface ThreadSummary {
  threadId: string;
  subject: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessage: Email;
  participants: string[];
  hasSent: boolean;
  hasReceived: boolean;
}

interface Props {
  initialThreads: ThreadSummary[];
}

export default function HistoryClient({ initialThreads }: Props) {
  const [threads] = useState(initialThreads);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Email[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (filter === 'sent' && !t.hasSent) return false;
      if (filter === 'received' && !t.hasReceived) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return (
        t.subject.toLowerCase().includes(needle) ||
        t.participants.some((p) => p.toLowerCase().includes(needle)) ||
        (t.lastMessage.snippet || '').toLowerCase().includes(needle)
      );
    });
  }, [threads, search, filter]);

  const openThread = useCallback(async (threadId: string) => {
    setSelectedId(threadId);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const selectedThread = threads.find((t) => t.threadId === selectedId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Thread list */}
      <div className={`flex flex-col ${selectedId ? 'w-[380px] flex-shrink-0 border-r border-border' : 'flex-1'}`}>
        <div className="px-5 py-3.5 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold text-foreground">History</h1>
              <p className="text-xs text-muted-foreground">{filtered.length} conversation{filtered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="relative mb-2.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-muted/50 border border-border rounded-lg pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            />
          </div>

          <div className="flex gap-1.5">
            {(['all', 'received', 'sent'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition-all capitalize ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground mt-1">Sync your inbox to build history</p>
            </div>
          )}
          {filtered.map((t) => (
            <button
              key={t.threadId}
              onClick={() => openThread(t.threadId)}
              className={`w-full text-left px-4 py-3.5 border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedId === t.threadId ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-sm font-medium text-foreground truncate flex-1">
                  {t.participants.slice(0, 2).join(', ')}{t.participants.length > 2 ? ` +${t.participants.length - 2}` : ''}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(t.lastMessageAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-foreground/80 truncate mb-1">{t.subject}</p>
              <p className="text-xs text-muted-foreground truncate mb-1.5">{t.lastMessage.snippet || ''}</p>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {t.messageCount} msg{t.messageCount !== 1 ? 's' : ''}
                </span>
                {t.hasSent && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                    <Send className="w-2.5 h-2.5" /> Sent
                  </span>
                )}
                {t.hasReceived && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                    <Inbox className="w-2.5 h-2.5" /> Received
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation view */}
      {selectedId && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-3">
            <button onClick={() => setSelectedId(null)} className="lg:hidden p-1 hover:bg-muted rounded">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">{selectedThread?.subject || 'Conversation'}</h2>
              <p className="text-xs text-muted-foreground truncate">{selectedThread?.participants.join(' · ')}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {loadingThread && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingThread && messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.direction === 'sent' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.direction === 'sent' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border text-muted-foreground'}`}>
                  {m.direction === 'sent' ? <Send className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                </div>
                <div className={`flex flex-col gap-1 max-w-[80%] ${m.direction === 'sent' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{m.direction === 'sent' ? 'You' : (m.sender_name || m.sender)}</span>
                    <span>·</span>
                    <span>{format(new Date(m.received_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className={`rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${m.direction === 'sent' ? 'bg-primary/10 border border-primary/20 text-foreground' : 'bg-muted/50 border border-border text-foreground'}`}>
                    {m.body || m.snippet || '(no content)'}
                  </div>
                </div>
              </div>
            ))}
            {!loadingThread && messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">No messages in this thread.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
