'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { EmailConnection, EmailTone, ComposeResult, Email } from '@/types';
import { TONE_LABELS } from '@/types';
import AccountPicker from '@/components/ui/AccountPicker';
import TonePicker from '@/components/ui/TonePicker';
import VoiceRecorder from '@/components/ui/VoiceRecorder';
import {
  X, Send, Sparkles, Loader2, Edit3, CheckCircle,
  RefreshCw, ChevronDown, ChevronUp, Mic, PenLine,
} from 'lucide-react';

type ComposeMode = 'prompt' | 'preview' | 'edit';

interface Props {
  connections: Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider'>[];
  defaultConnectionId?: string;
  replyTo?: Email;               // If set, this is a reply
  onClose: () => void;
  onSent?: (result: ComposeResult) => void;
}

export default function ComposeModal({
  connections, defaultConnectionId, replyTo, onClose, onSent,
}: Props) {
  const [mode, setMode] = useState<ComposeMode>('prompt');
  const [fromId, setFromId] = useState(defaultConnectionId || connections[0]?.id || '');
  const [tone, setTone] = useState<EmailTone>('professional');
  const [prompt, setPrompt] = useState('');
  const [to, setTo] = useState(replyTo?.sender || '');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Preview/edit state
  const [generated, setGenerated] = useState<ComposeResult | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTo, setEditTo] = useState('');

  // Loading states
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fromConnection = connections.find((c) => c.id === fromId);

  useEffect(() => {
    promptRef.current?.focus();
    if (replyTo) {
      setPrompt(`Reply professionally`);
    }
  }, [replyTo]);

  // ── Generate draft ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('Please describe what you want to write.'); return; }
    if (!fromId) { setError('Please select an account to send from.'); return; }

    setGenerating(true);
    setError('');

    const body = {
      prompt,
      tone,
      from_connection_id: fromId,
      to: to || undefined,
      subject: subject || undefined,
      reply_to_email_id: replyTo?.id,
      send_immediately: false,
    };

    const started = performance.now();
    console.log('[Generate] POST /api/compose', { tone, fromId, replyToEmailId: replyTo?.id, promptLength: prompt.length });
    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const ms = Math.round(performance.now() - started);
      console.log(`[Generate] ${res.status} ${res.ok ? 'OK' : 'FAIL'} in ${ms}ms`, data);
      setGenerating(false);

      if (data.error) {
        setError(data.error);
        return;
      }

      const result: ComposeResult = data.compose_result;
      setGenerated(result);
      setEditSubject(result.subject);
      setEditBody(result.body);
      setEditTo(result.to);
      setMode('preview');
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      console.error(`[Generate] network error after ${ms}ms`, err);
      setGenerating(false);
      setError((err as Error).message);
    }
  }, [prompt, tone, fromId, to, subject, replyTo]);

  // ── Send ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    setSending(true);
    setError('');

    const finalSubject = mode === 'edit' ? editSubject : (generated?.subject || '');
    const finalBody = mode === 'edit' ? editBody : (generated?.body || '');
    const finalTo = mode === 'edit' ? editTo : (generated?.to || '');

    const body = {
      prompt,
      tone,
      from_connection_id: fromId,
      to: finalTo,
      subject: finalSubject,
      reply_to_email_id: replyTo?.id,
      send_immediately: true,
    };

    // If user edited the body, override AI generation with edited content
    if (mode === 'edit' && generated?.composed_email_id) {
      // Patch the composed email with edits then mark as sent
      body.prompt = `[Edited draft] Subject: ${finalSubject}\n\n${finalBody}`;
    }

    const res = await fetch('/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSending(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    setSent(true);
    onSent?.(data.compose_result);
    setTimeout(onClose, 1800);
  }, [mode, editSubject, editBody, editTo, generated, prompt, tone, fromId, replyTo, onSent, onClose]);

  // ── Voice transcript handler ────────────────────────────────
  function handleVoiceTranscript(transcript: string) {
    setPrompt(transcript);
    // Auto-generate immediately after voice input
    setTimeout(() => handleGenerate(), 100);
  }

  // ── Keyboard shortcut ───────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'prompt') handleGenerate();
      else handleSend();
    }
    if (e.key === 'Escape') onClose();
  }

  const toneInfo = TONE_LABELS[tone];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-2xl bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-fade-in">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center">
              <PenLine className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {replyTo ? 'AI Reply' : 'Compose Email'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {mode === 'prompt' ? 'Describe what you want to write' :
                 mode === 'preview' ? 'Review AI draft before sending' : 'Edit before sending'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Sent state ─────────────────────────────────────── */}
        {sent && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-semibold text-foreground">Email sent!</p>
            <p className="text-sm text-muted-foreground">
              Sent from <span className="font-medium text-foreground">{fromConnection?.email}</span>
            </p>
          </div>
        )}

        {!sent && (
          <div className="flex-1 overflow-y-auto">

            {/* ── PROMPT MODE ────────────────────────────────── */}
            {mode === 'prompt' && (
              <div className="p-5 space-y-5">

                {/* From account */}
                <AccountPicker
                  connections={connections}
                  selectedId={fromId}
                  onChange={setFromId}
                  label="Send from"
                />

                {/* Reply context banner */}
                {replyTo && (
                  <div className="flex items-start gap-2.5 p-3 bg-muted/40 border border-border rounded-xl text-sm">
                    <div className="w-1 self-stretch bg-primary/40 rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">Replying to</p>
                      <p className="font-medium text-foreground truncate">{replyTo.sender}</p>
                      <p className="text-muted-foreground truncate">{replyTo.subject}</p>
                    </div>
                  </div>
                )}

                {/* Tone picker */}
                <TonePicker value={tone} onChange={setTone} compact />

                {/* Prompt input */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    What do you want to say?
                  </label>
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      replyTo
                        ? `e.g. "Tell them the quotation will be ready by Friday and apologise for the delay"`
                        : `e.g. "Email john@client.com asking for a meeting next week to discuss the Q4 proposal"`
                    }
                    rows={4}
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none transition-all placeholder-muted-foreground"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <VoiceRecorder
                      fromConnectionId={fromId}
                      onTranscript={handleVoiceTranscript}
                      disabled={!fromId}
                    />
                    <p className="text-xs text-muted-foreground">⌘ Enter to generate</p>
                  </div>
                </div>

                {/* Advanced options (To, Subject override) */}
                {!replyTo && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Advanced options
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">To (override)</label>
                          <input
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="recipient@example.com (or let AI extract from prompt)"
                            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Subject (override)</label>
                          <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Leave blank to let AI generate"
                            className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* ── PREVIEW MODE ───────────────────────────────── */}
            {mode === 'preview' && generated && (
              <div className="p-5 space-y-4">
                {/* AI badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                    <Sparkles className="w-3 h-3" />
                    Generated · {toneInfo.emoji} {toneInfo.label} tone
                  </div>
                  <button
                    onClick={() => setMode('edit')}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                </div>

                {/* Email preview card */}
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-3 border-b border-border space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-10 text-xs">From</span>
                      <span className="font-medium text-foreground">{fromConnection?.email}</span>
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: fromConnection?.color || '#3b82f6' }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-10 text-xs">To</span>
                      <span className="text-foreground">{generated.to}</span>
                    </div>
                    {generated.cc && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-10 text-xs">Cc</span>
                        <span className="text-foreground">{generated.cc}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-10 text-xs">Subj</span>
                      <span className="font-medium text-foreground">{generated.subject}</span>
                    </div>
                  </div>
                  <div className="px-4 py-4 bg-background">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {generated.body}
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            )}

            {/* ── EDIT MODE ──────────────────────────────────── */}
            {mode === 'edit' && generated && (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setMode('preview')}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back to preview
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} /> Regenerate
                  </button>
                </div>

                <div className="border border-border rounded-xl overflow-hidden space-y-0">
                  {/* From */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20">
                    <span className="text-xs text-muted-foreground w-12">From</span>
                    <AccountPicker
                      connections={connections}
                      selectedId={fromId}
                      onChange={setFromId}
                      compact
                    />
                  </div>
                  {/* To */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
                    <span className="text-xs text-muted-foreground w-12">To</span>
                    <input
                      type="email"
                      value={editTo}
                      onChange={(e) => setEditTo(e.target.value)}
                      className="flex-1 text-sm bg-transparent focus:outline-none text-foreground"
                    />
                  </div>
                  {/* Subject */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
                    <span className="text-xs text-muted-foreground w-12">Subject</span>
                    <input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="flex-1 text-sm font-medium bg-transparent focus:outline-none text-foreground"
                    />
                  </div>
                  {/* Body */}
                  <div className="px-4 py-3">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={10}
                      className="w-full text-sm bg-transparent focus:outline-none resize-none text-foreground leading-relaxed"
                    />
                  </div>
                </div>

                {/* Tone switcher in edit mode */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Switch tone and regenerate</p>
                  <TonePicker value={tone} onChange={setTone} compact />
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────── */}
        {!sent && (
          <div className="px-5 py-4 border-t border-border bg-muted/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {mode !== 'prompt' && (
                <button
                  onClick={() => { setMode('prompt'); setGenerated(null); setError(''); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted/50 transition-all"
              >
                Cancel
              </button>

              {mode === 'prompt' && (
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim() || !fromId}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-sm font-medium rounded-lg transition-all"
                >
                  {generating
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Generate Draft</>}
                </button>
              )}

              {(mode === 'preview' || mode === 'edit') && (
                <>
                  {mode === 'preview' && (
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-sm font-medium rounded-lg transition-all"
                  >
                    {sending
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                      : <><Send className="w-3.5 h-3.5" /> Send from {fromConnection?.nickname || fromConnection?.email?.split('@')[0]}</>}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
