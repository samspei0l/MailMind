'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Email, ActionPayload } from '@/types';
import { Send, Loader2, Sparkles, Bot, User, AlertCircle, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import EmailCardMini from './EmailCardMini';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emails?: Email[];
  summary?: string;
  replies_sent?: number;
  error?: string;
  loading?: boolean;
  action?: ActionPayload;
}

const SUGGESTED_PROMPTS = [
  { label: '📬 Show high priority emails', query: 'Show all high priority emails' },
  { label: '💰 Sales emails', query: 'Show all sales category emails' },
  { label: '📋 Needs reply', query: 'Show emails that need a reply' },
  { label: '📅 Yesterday summary', query: 'Summarise my emails from yesterday' },
  { label: '🔔 Quotation emails', query: 'Show all quotation emails' },
  { label: '📊 This week summary', query: 'Give me a summary of this week\'s emails' },
];

interface Props {
  initialQuery?: string;
  initialSessionId?: string;
}

export default function ChatInterface({ initialQuery, initialSessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuery || '');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (initialQuery) sendMessage(initialQuery);
  }, []); // eslint-disable-line

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
    };
    const loadingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, sessionId }),
      });
      const data = await res.json();

      if (data.sessionId) setSessionId(data.sessionId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                loading: false,
                content: data.message || 'Done.',
                emails: data.result?.emails || [],
                summary: data.result?.summary,
                replies_sent: data.result?.replies_sent,
                error: data.result?.error,
                action: data.action,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, loading: false, content: 'Sorry, something went wrong. Please try again.', error: (err as Error).message }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground">AI Email Assistant</h1>
            <p className="text-xs text-muted-foreground">Ask anything about your inbox</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: 'DM Serif Display, serif' }}>
              What can I help you with?
            </h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8">
              Ask me to find, summarise, or reply to your emails using natural language.
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.query}
                  onClick={() => sendMessage(p.query)}
                  className="text-left text-sm px-4 py-3 bg-card border border-border hover:border-primary/30 hover:bg-primary/5 rounded-xl transition-all text-foreground/80 hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted border border-border text-muted-foreground'
            }`}>
              {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`flex flex-col gap-3 max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              {message.loading ? (
                <div className="chat-bubble-assistant flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full" />
                    <div className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full" />
                    <div className="typing-dot w-2 h-2 bg-muted-foreground/60 rounded-full" />
                  </div>
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              ) : (
                <>
                  <div className={message.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Summary result */}
                  {message.summary && (
                    <div className="w-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Summary</span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{message.summary}</p>
                    </div>
                  )}

                  {/* Replies sent */}
                  {message.replies_sent !== undefined && message.replies_sent > 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                      <Mail className="w-4 h-4" />
                      {message.replies_sent} reply{message.replies_sent !== 1 ? 's' : ''} sent
                    </div>
                  )}

                  {/* Error */}
                  {message.error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {message.error}
                    </div>
                  )}

                  {/* Email results */}
                  {message.emails && message.emails.length > 0 && (
                    <div className="w-full space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {message.emails.length} email{message.emails.length !== 1 ? 's' : ''} found
                      </p>
                      {message.emails.slice(0, 8).map((email) => (
                        <EmailCardMini key={email.id} email={email} />
                      ))}
                      {message.emails.length > 8 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{message.emails.length - 8} more — <a href="/dashboard/inbox" className="text-primary hover:underline">view all in inbox</a>
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="flex gap-3 items-end max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your emails... e.g. 'Show important emails from this week'"
              rows={1}
              disabled={loading}
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none transition-all placeholder-muted-foreground"
              style={{ minHeight: '48px', maxHeight: '140px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 140) + 'px';
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="w-10 h-10 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
