'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import type { Email, ActionPayload } from '@/types';
import {
  Send, Loader2, Sparkles, AlertCircle, Mail, Mic, Square,
  Flame, ReplyAll, CalendarClock, ShieldAlert, FileText, DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import EmailCardMini from './EmailCardMini';

// Minimal Web Speech API typings (the DOM lib still doesn't ship them).
// We only model what we actually use.
interface SpeechRecognitionAlt { transcript: string }
interface SpeechRecognitionRes { 0: SpeechRecognitionAlt; isFinal: boolean; length: number }
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionRes>;
}
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  }
}

/** MailMind logo in a white rounded square — the AI avatar across chat. */
function AssistantAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-[9px] bg-white flex-shrink-0 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
    >
      <Image src="/mailmind-logo.png" alt="AI" width={size - 8} height={size - 8} className="object-contain w-full h-full" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
      style={{ background: 'linear-gradient(135deg, hsl(var(--brand-teal)), hsl(var(--brand-lime)))' }}
    >
      You
    </div>
  );
}

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
  createdAt?: number;
}

interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action_type: string | null;
  action_data: ActionPayload | null;
  result_data: {
    emails?: Email[];
    summary?: string;
    replies_sent?: number;
    error?: string;
  } | null;
  created_at: string;
}

type SuggestionGroup = {
  title: string;
  items: {
    icon: typeof Flame;
    title: string;
    sub: string;
    query: string;
    accent: 'red' | 'amber' | 'teal' | 'lime' | 'purple' | 'blue';
  }[];
};

const SUGGESTIONS: SuggestionGroup[] = [
  {
    title: 'Triage',
    items: [
      { icon: Flame,        title: 'Urgent emails',       sub: 'Everything flagged high priority',      query: 'Show all high priority emails',                                   accent: 'red'    },
      { icon: ReplyAll,     title: 'Needs a reply',       sub: 'Waiting on your response',               query: 'Show emails that need a reply',                                   accent: 'amber'  },
      { icon: ShieldAlert,  title: 'Complaints',          sub: 'Customer issues to handle',              query: 'Show all complaint emails',                                       accent: 'red'    },
    ],
  },
  {
    title: 'Summarize',
    items: [
      { icon: CalendarClock, title: "Today's summary",    sub: 'What came in since this morning',        query: "Summarise today's emails",                                        accent: 'teal'   },
      { icon: FileText,      title: "Week in review",     sub: 'A digest of this week',                   query: "Give me a summary of this week's emails",                         accent: 'lime'   },
    ],
  },
  {
    title: 'Find',
    items: [
      { icon: DollarSign,    title: 'Quotations & invoices', sub: 'Financial threads waiting on reply',    query: 'Show quotation and invoice emails that are waiting for a reply',  accent: 'purple' },
      { icon: Mail,          title: 'Sales pipeline',     sub: 'Prospect & opportunity emails',           query: 'Show all sales category emails',                                  accent: 'blue'   },
    ],
  },
];

const ACCENT_TONE: Record<'red' | 'amber' | 'teal' | 'lime' | 'purple' | 'blue', { bg: string; fg: string }> = {
  red:    { bg: '#FEE2E2', fg: '#DC2626' },
  amber:  { bg: '#FEF3C7', fg: '#D97706' },
  teal:   { bg: 'rgba(0,78,110,0.1)',   fg: 'hsl(var(--brand-teal))'  },
  lime:   { bg: 'rgba(141,198,63,0.15)', fg: 'hsl(var(--brand-limeD))' },
  purple: { bg: '#F3E8FF', fg: '#7C3AED' },
  blue:   { bg: '#DBEAFE', fg: '#1D4ED8' },
};

const QUICK_CHIPS = ['Show urgent', 'Needs reply', "Today's summary", 'Complaints'];

interface Props {
  initialQuery?: string;
  initialSessionId?: string;
}

export default function ChatInterface({ initialQuery, initialSessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuery || '');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [historyLoading, setHistoryLoading] = useState(Boolean(initialSessionId));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoSentRef = useRef<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Browser Web Speech API — zero latency, no upload, no API key. We tried
  // routing through NVIDIA Whisper but their hosted endpoint isn't reliable
  // for this use case, and the in-browser recogniser is a better UX anyway.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputAtStartRef = useRef<string>('');

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load prior messages when opening an existing session (e.g. via
  // /dashboard/chat?sessionId=…). Without this, resuming a chat shows an
  // empty thread even though the history exists in Supabase.
  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(initialSessionId)}`);
        const data = await res.json();
        if (cancelled || !Array.isArray(data.messages)) return;
        const restored: Message[] = (data.messages as StoredChatMessage[]).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          action: m.action_data ?? undefined,
          emails: m.result_data?.emails,
          summary: m.result_data?.summary,
          replies_sent: m.result_data?.replies_sent,
          error: m.result_data?.error,
          createdAt: new Date(m.created_at).getTime(),
        }));
        setMessages(restored);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialSessionId]);

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      createdAt: Date.now(),
    };
    const loadingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      loading: true,
      createdAt: Date.now(),
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

  useEffect(() => {
    if (!initialQuery) return;
    // Wait until any past-session restore finishes so the auto-sent
    // question lands after the history, not before or concurrently.
    if (historyLoading) return;
    if (lastAutoSentRef.current === initialQuery) return;
    lastAutoSentRef.current = initialQuery;
    sendMessage(initialQuery);
  }, [initialQuery, sendMessage, historyLoading]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function startRecording() {
    setVoiceError(null);
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError('Voice input needs a Chromium-based browser (Chrome, Edge, Brave, Arc).');
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true;
      inputAtStartRef.current = input;

      recognition.onresult = (ev: SpeechRecognitionEventLike) => {
        let finalText = '';
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        const base = inputAtStartRef.current;
        const merged = `${base}${base && (finalText || interim) ? ' ' : ''}${finalText}${interim}`.trim();
        setInput(merged);
        if (finalText) {
          // Promote finalised text into the baseline so the next chunk appends
          // rather than replacing the still-stable portion.
          inputAtStartRef.current = `${base}${base && finalText ? ' ' : ''}${finalText}`;
        }
        requestAnimationFrame(() => {
          const t = inputRef.current;
          if (!t) return;
          t.style.height = 'auto';
          t.style.height = Math.min(t.scrollHeight, 140) + 'px';
        });
      };
      recognition.onerror = (ev: SpeechRecognitionErrorEventLike) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setVoiceError('Microphone permission denied. Allow access and try again.');
        } else if (ev.error === 'no-speech') {
          setVoiceError("Didn't catch anything — try again.");
        } else if (ev.error !== 'aborted') {
          setVoiceError(`Voice input error: ${ev.error}`);
        }
        setRecording(false);
      };
      recognition.onend = () => {
        setRecording(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      setVoiceError((err as Error).message);
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  // Abort the recogniser if the component unmounts mid-recording.
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background:
          'radial-gradient(1200px 600px at 50% -100px, rgba(0,78,110,0.06), transparent 60%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--background)) 100%)',
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <AssistantAvatar />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-bold text-foreground">AI Chat</h1>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[1px] rounded-full"
                style={{ background: 'rgba(141,198,63,0.15)', color: 'hsl(var(--brand-limeD))' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'hsl(var(--brand-lime))' }} />
                Online
              </span>
            </div>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">Ask anything about your emails — filter, summarise, draft replies.</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {historyLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-[13px]">Loading conversation…</span>
          </div>
        )}

        {isEmpty && (
          <div className="max-w-2xl mx-auto pt-6 pb-2">
            <div className="flex flex-col items-center text-center mb-8">
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center mb-5"
                style={{
                  background: 'rgba(255,255,255,0.96)',
                  boxShadow: '0 8px 28px rgba(0,78,110,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
                  padding: 14,
                }}
              >
                <Image src="/mailmind-logo.png" alt="MailMind" width={44} height={44} className="object-contain" priority />
              </div>
              <h2 className="text-[26px] font-bold text-foreground tracking-tight mb-1.5">
                What can I help you with?
              </h2>
              <p className="text-muted-foreground text-[13.5px] max-w-md">
                Ask in natural language. I can filter, summarise, search, and draft replies across all your connected inboxes.
              </p>
            </div>

            <div className="space-y-5">
              {SUGGESTIONS.map((group) => (
                <div key={group.title}>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-2 px-1">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const tone = ACCENT_TONE[item.accent];
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.query}
                          onClick={() => sendMessage(item.query)}
                          className="group flex items-start gap-3 text-left p-3.5 bg-card border border-border rounded-xl transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-[1px]"
                        >
                          <div
                            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            <Icon className="w-[18px] h-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold text-foreground leading-tight">{item.title}</p>
                            <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{item.sub}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`group flex gap-2.5 ${message.role === 'user' ? 'flex-row-reverse' : ''} mm-fade-up`}>
            {message.role === 'user' ? <UserAvatar /> : <AssistantAvatar />}

            <div className={`flex flex-col gap-2.5 max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              {message.loading ? (
                <div
                  className="mm-fade-up bg-card border border-border rounded-2xl rounded-bl-sm shadow-sm"
                  style={{ padding: '13px 16px 11px', minWidth: 170 }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[12px] font-semibold" style={{ color: 'hsl(var(--brand-limeD))' }}>Thinking</span>
                    <span className="flex gap-[3px]">
                      <span className="mm-think-dot w-[5px] h-[5px] rounded-full" style={{ background: 'hsl(var(--brand-limeD))' }} />
                      <span className="mm-think-dot w-[5px] h-[5px] rounded-full" style={{ background: 'hsl(var(--brand-limeD))' }} />
                      <span className="mm-think-dot w-[5px] h-[5px] rounded-full" style={{ background: 'hsl(var(--brand-limeD))' }} />
                    </span>
                  </div>
                  <div className="h-[3px] rounded-[3px] overflow-hidden" style={{ background: '#e8f5e9' }}>
                    <div
                      className="mm-think-scan h-full rounded-[3px]"
                      style={{ background: 'linear-gradient(90deg, hsl(var(--brand-teal)), hsl(var(--brand-lime)))' }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={
                      message.role === 'user'
                        ? 'rounded-[16px] rounded-br-[4px] text-white text-[13.5px] leading-[1.65] px-4 py-3'
                        : 'rounded-[16px] rounded-bl-[4px] bg-card border border-border text-foreground text-[13.5px] leading-[1.65] px-4 py-3 shadow-sm'
                    }
                    style={
                      message.role === 'user'
                        ? {
                            background: 'linear-gradient(135deg, hsl(var(--brand-teal)) 0%, hsl(var(--brand-tealL)) 100%)',
                            boxShadow: '0 4px 16px rgba(0,78,110,0.18)',
                          }
                        : undefined
                    }
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* Hover-revealed timestamp */}
                  {message.createdAt && (
                    <span className="text-[10.5px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity px-1 -mt-1">
                      {format(new Date(message.createdAt), 'HH:mm')}
                    </span>
                  )}

                  {/* Summary result — brand teal→lime gradient */}
                  {message.summary && (
                    <div className="ai-card w-full rounded-xl p-4 mm-fade-up">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-bold text-primary uppercase tracking-[0.06em]">Summary</span>
                      </div>
                      <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{message.summary}</p>
                    </div>
                  )}

                  {/* Replies sent */}
                  {message.replies_sent !== undefined && message.replies_sent > 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3.5 py-2.5">
                      <Mail className="w-4 h-4" />
                      {message.replies_sent} reply{message.replies_sent !== 1 ? 's' : ''} sent
                    </div>
                  )}

                  {/* Error */}
                  {message.error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3.5 py-2.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {message.error}
                    </div>
                  )}

                  {/* All-caught-up state */}
                  {!message.error && !message.summary && message.action &&
                   (message.action.action === 'filter' || message.action.action === 'search') &&
                   (!message.emails || message.emails.length === 0) && (
                    <div className="w-full flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 border border-border rounded-xl px-3.5 py-2.5">
                      <Sparkles className="w-4 h-4 flex-shrink-0 text-primary/70" />
                      You&apos;re all caught up — no emails match this right now.
                    </div>
                  )}

                  {/* Email results */}
                  {message.emails && message.emails.length > 0 && (
                    <div className="w-full space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.05em]">
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

      {/* Quick chips — shown when there are messages, for fast follow-ups */}
      {!isEmpty && (
        <div className="px-6 pb-2 flex gap-1.5 flex-wrap">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => sendMessage(c)}
              disabled={loading}
              className="text-[11.5px] px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="px-6 pt-2 pb-5 bg-card/50 backdrop-blur-md border-t border-border">
        <div
          className="max-w-4xl mx-auto flex items-end gap-2 bg-card border rounded-2xl px-3 py-2 transition-all"
          style={{
            borderColor: focused ? 'hsl(var(--brand-teal))' : 'hsl(var(--border))',
            boxShadow: focused
              ? '0 0 0 3px rgba(0,78,110,0.12), 0 6px 20px rgba(0,0,0,0.05)'
              : '0 2px 10px rgba(0,0,0,0.04)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg bg-white flex-shrink-0 self-center flex items-center justify-center overflow-hidden"
            style={{ padding: 4, boxShadow: '0 2px 8px rgba(0,78,110,0.18)' }}
            title="MailMind"
          >
            <Image src="/mailmind-logo.png" alt="MailMind" width={22} height={22} className="object-contain w-full h-full" priority />
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={recording ? 'Listening… click the mic to stop' : "Ask about your emails… e.g. 'Draft a reply to Sarah about the Q2 proposal'"}
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent outline-none text-[13.5px] text-foreground resize-none py-2 placeholder:text-muted-foreground/70"
            style={{ minHeight: '36px', maxHeight: '140px' }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 140) + 'px';
            }}
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            aria-label={recording ? 'Stop recording' : 'Record voice prompt'}
            title={recording ? 'Stop recording' : 'Record voice prompt'}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 self-end transition-all disabled:opacity-40 disabled:cursor-not-allowed relative"
            style={{
              background: recording ? '#DC2626' : 'rgba(141,198,63,0.15)',
              color: recording ? '#fff' : 'hsl(var(--brand-limeD))',
              border: recording ? 'none' : '1px solid rgba(141,198,63,0.4)',
              boxShadow: recording ? '0 4px 14px rgba(220,38,38,0.35)' : 'none',
            }}
          >
            {recording
              ? <Square className="w-3.5 h-3.5" fill="currentColor" />
              : <Mic className="w-4 h-4" />}
            {recording && (
              <span
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ animation: 'mm-pulse-ring 1.4s ease-out infinite', boxShadow: '0 0 0 0 rgba(220,38,38,0.5)' }}
              />
            )}
          </button>
          <button
            onClick={() => sendMessage()}
            disabled={loading || recording || !input.trim()}
            aria-label="Send message"
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 self-end transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: input.trim() && !loading && !recording ? 'hsl(var(--brand-teal))' : 'hsl(var(--muted))',
              color: input.trim() && !loading && !recording ? '#fff' : 'hsl(var(--muted-foreground))',
              boxShadow: input.trim() && !loading && !recording ? '0 4px 14px rgba(0,78,110,0.28)' : 'none',
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {voiceError && (
          <p className="text-[11px] text-red-500 text-center mt-1.5">{voiceError}</p>
        )}
        <p className="text-[11px] text-muted-foreground/80 text-center mt-2">
          <kbd className="px-1.5 py-[1px] rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground">Enter</kbd> to send
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-[1px] rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground">Shift</kbd>
          {' + '}
          <kbd className="px-1.5 py-[1px] rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground">Enter</kbd> for new line
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-[1px] rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground inline-flex items-center gap-1"><Mic className="w-2.5 h-2.5" />Mic</kbd> to dictate
        </p>
      </div>
    </div>
  );
}
