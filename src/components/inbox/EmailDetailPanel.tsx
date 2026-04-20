'use client';

import { useState, useEffect, useRef } from 'react';
import type { Email, EmailConnection, EmailTone } from '@/types';
import { TONE_LABELS } from '@/types';
import { format } from 'date-fns';
import { X, Reply, Copy, Sparkles, Loader2, CheckCircle, PenLine, RefreshCw, Link2, PenTool } from 'lucide-react';
import AccountPicker from '@/components/ui/AccountPicker';
import TonePicker from '@/components/ui/TonePicker';
import VoiceRecorder from '@/components/ui/VoiceRecorder';

interface Props {
  email: Email;
  connections: Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider' | 'signature'>[];
  onClose: () => void;
  autoOpenReply?: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
  LOW:    'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400',
};

export default function EmailDetailPanel({ email, connections, onClose, autoOpenReply = false }: Props) {
  const [replying, setReplying] = useState(autoOpenReply);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<EmailTone>('professional');
  const [fromId, setFromId] = useState('');
  const [generatedBody, setGeneratedBody] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [copied, setCopied] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [detectingSig, setDetectingSig] = useState(false);
  const [sigFlash, setSigFlash] = useState('');
  // Local cache so the toggle/"Detect signature" button reflect the latest
  // state without waiting for a page reload — mirrors the signature that
  // came back from /api/connections/signature.
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-select the connection that received this email
  useEffect(() => {
    if (email.connection_id) {
      const match = connections.find((c) => c.id === email.connection_id);
      if (match) { setFromId(match.id); return; }
    }
    if (connections[0]) setFromId(connections[0].id);
  }, [email.connection_id, connections]);

  // When the parent opens the panel in AI-reply mode, or switches to a
  // different email with the flag still on, drop into the reply composer.
  useEffect(() => {
    if (autoOpenReply) {
      setReplying(true);
      setReplySent(false);
      setShowPreview(false);
      setPrompt('');
    }
  }, [autoOpenReply, email.id]);

  async function handleGenerate(overridePrompt?: string) {
    const p = overridePrompt || prompt;
    if (!p.trim() || !fromId) return;
    setGenerating(true);
    setReplyError('');
    setShowPreview(false);
    const started = performance.now();
    console.log('[Generate] POST /api/compose', { tone, fromId, replyToEmailId: email.id, promptLength: p.length });
    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, tone, from_connection_id: fromId, reply_to_email_id: email.id, send_immediately: false }),
      });
      const data = await res.json();
      const ms = Math.round(performance.now() - started);
      console.log(`[Generate] ${res.status} ${res.ok ? 'OK' : 'FAIL'} in ${ms}ms`, data);
      setGenerating(false);
      if (data.error) { setReplyError(data.error); return; }
      setGeneratedBody(data.compose_result?.body || '');
      setGeneratedSubject(data.compose_result?.subject || `Re: ${email.subject}`);
      setShowPreview(true);
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      console.error(`[Generate] network error after ${ms}ms`, err);
      setGenerating(false);
      setReplyError((err as Error).message);
    }
  }

  // Prompt the user for URL + display text, then insert [text](url) at the
  // caret position of whichever textarea is currently active (draft or prompt).
  // The send path turns [text](url) into a real <a> tag in the HTML MIME part.
  function insertLink() {
    const url = window.prompt('Link URL (e.g. https://example.com)');
    if (!url || !url.trim()) return;
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const text = window.prompt('Text to display', normalized) || normalized;

    const target = showPreview ? draftRef.current : promptRef.current;
    const markdown = `[${text}](${normalized})`;
    if (!target) {
      // No focused textarea — append to whichever body the user is editing.
      if (showPreview) setGeneratedBody((b) => (b ? `${b} ${markdown}` : markdown));
      else setPrompt((b) => (b ? `${b} ${markdown}` : markdown));
      return;
    }
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    const next = `${before}${markdown}${after}`;
    if (showPreview) setGeneratedBody(next);
    else setPrompt(next);
    // Restore caret just after the inserted link.
    requestAnimationFrame(() => {
      target.focus();
      const pos = before.length + markdown.length;
      target.setSelectionRange(pos, pos);
    });
  }

  const currentSignature = fromId
    ? (signatures[fromId] ?? connections.find((c) => c.id === fromId)?.signature ?? null)
    : null;

  async function detectSignature() {
    if (!fromId) return;
    setDetectingSig(true);
    setSigFlash('');
    try {
      const res = await fetch('/api/connections/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: fromId }),
      });
      const data = await res.json();
      if (data.error) { setSigFlash(data.error); return; }
      setSignatures((prev) => ({ ...prev, [fromId]: data.signature || null }));
      setSigFlash(data.message || (data.signature ? 'Signature saved.' : 'No signature found.'));
      setTimeout(() => setSigFlash(''), 4000);
    } catch (err) {
      setSigFlash((err as Error).message);
    } finally {
      setDetectingSig(false);
    }
  }

  async function handleSend() {
    // Two paths:
    //   - showPreview=true  → user reviewed an AI draft, send that verbatim
    //   - showPreview=false → user typed the reply themselves, send as-is
    const bodyToSend = showPreview ? generatedBody : prompt;
    const subjectToSend = showPreview ? generatedSubject : undefined;

    if (!bodyToSend.trim()) {
      setReplyError('Write a reply or generate a draft before sending.');
      return;
    }

    setSending(true);
    setReplyError('');
    const res = await fetch('/api/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Always send verbatim — the AI has either already produced this or the
        // user wrote it themselves. Either way we don't want another rewrite.
        body_override: bodyToSend,
        subject: subjectToSend,
        prompt: '',
        tone, from_connection_id: fromId, reply_to_email_id: email.id, send_immediately: true,
        include_signature: includeSignature,
      }),
    });
    const data = await res.json();
    setSending(false);
    if (data.error) { setReplyError(data.error); return; }
    setReplySent(true);
    setReplying(false);
    setShowPreview(false);
    setPrompt('');
    setGeneratedBody('');
    setGeneratedSubject('');
  }

  const fromConn = connections.find((c) => c.id === fromId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background animate-fade-in">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-background/80 backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-sm truncate">{email.subject}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            From <span className="text-foreground">{email.sender_name || email.sender}</span>
            {' · '}{format(new Date(email.received_at), 'MMM d, h:mm a')}
          </p>
        </div>
        <button onClick={onClose} className="ml-3 p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* AI summary */}
        {(email.summary || email.priority) && (
          <div className="mx-4 mt-4 p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/30 rounded-xl">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">AI Analysis</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {email.priority && <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${PRIORITY_COLORS[email.priority]}`}>{email.priority} Priority</span>}
              {email.category && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{email.category}</span>}
              {email.type && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30">{email.type}</span>}
              {email.requires_reply && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30">Reply Required</span>}
            </div>
            {email.summary && <p className="text-xs text-foreground/80 leading-relaxed">{email.summary}</p>}
            {email.intent && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Intent:</span> {email.intent}</p>}
          </div>
        )}

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{email.body || email.snippet || '(No content)'}</p>
        </div>

        {/* Suggested reply */}
        {email.suggested_reply && !replying && (
          <div className="mx-4 mb-4 p-3.5 bg-muted/40 border border-border rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Reply</p>
              <button onClick={() => { navigator.clipboard.writeText(email.suggested_reply!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap">{email.suggested_reply}</p>
          </div>
        )}

        {/* Reply sent */}
        {replySent && (
          <div className="mx-4 mb-4 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Reply sent from <strong className="ml-1">{fromConn?.email}</strong>
          </div>
        )}

        {/* Reply composer */}
        {!replySent && (
          <div className="px-4 pb-5">
            {!replying ? (
              <button onClick={() => setReplying(true)} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                <Reply className="w-4 h-4" /> Reply with AI
              </button>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                {/* From account */}
                <div className="px-3.5 py-2.5 bg-muted/20 border-b border-border">
                  <AccountPicker connections={connections} selectedId={fromId} onChange={setFromId} label="Reply from" compact />
                  {fromConn && email.connection_id === fromConn.id && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Auto-matched to receiving account
                    </p>
                  )}
                </div>
                {/* Tone */}
                <div className="px-3.5 py-2.5 border-b border-border">
                  <TonePicker value={tone} onChange={setTone} compact />
                </div>
                {/* Preview */}
                {showPreview && (
                  <div className="px-3.5 py-3 border-b border-border bg-blue-50/30 dark:bg-blue-950/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                        <Sparkles className="w-3 h-3" /> AI Draft · {TONE_LABELS[tone].emoji} {TONE_LABELS[tone].label}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={insertLink} title="Insert link"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <Link2 className="w-3 h-3" /> Link
                        </button>
                        <button onClick={() => setShowPreview(false)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                          <PenLine className="w-3 h-3" /> Edit prompt
                        </button>
                      </div>
                    </div>
                    <textarea ref={draftRef} value={generatedBody} onChange={(e) => setGeneratedBody(e.target.value)} rows={6}
                      className="w-full text-xs bg-transparent focus:outline-none resize-none text-foreground leading-relaxed" />
                  </div>
                )}
                {/* Prompt */}
                {!showPreview && (
                  <div className="px-3.5 py-3 border-b border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Write your reply — or describe it for AI</p>
                      <div className="flex items-center gap-2">
                        <button onClick={insertLink} title="Insert link"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <Link2 className="w-3 h-3" /> Link
                        </button>
                        <VoiceRecorder fromConnectionId={fromId} onTranscript={(t) => { setPrompt(t); handleGenerate(t); }} disabled={!fromId} />
                      </div>
                    </div>
                    <textarea ref={promptRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                      placeholder={`Write the actual reply, or describe it like "Tell them the quote will be ready Friday"`}
                      rows={4} className="w-full text-sm bg-transparent focus:outline-none resize-none text-foreground placeholder-muted-foreground leading-relaxed" />
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                      <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /><strong className="text-foreground/80">Generate</strong> turns your text into an AI draft you can edit. <strong className="text-foreground/80">Send Reply</strong> sends what you typed, as-is. Paste a URL or click <strong className="text-foreground/80">Link</strong> for hyperlinks.
                    </p>
                  </div>
                )}
                {/* Signature row */}
                <div className="px-3.5 py-2.5 border-b border-border bg-muted/10">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input type="checkbox" checked={includeSignature && !!currentSignature}
                        onChange={(e) => setIncludeSignature(e.target.checked)}
                        disabled={!currentSignature}
                        className="accent-primary" />
                      <PenTool className="w-3 h-3 text-muted-foreground" />
                      {currentSignature ? 'Include my signature' : 'No signature saved for this account'}
                    </label>
                    <button onClick={detectSignature} disabled={detectingSig || !fromId}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50">
                      {detectingSig ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {currentSignature ? 'Re-detect' : 'Detect signature'}
                    </button>
                  </div>
                  {currentSignature && includeSignature && (
                    <pre className="mt-2 text-[11px] text-muted-foreground whitespace-pre-wrap font-sans leading-snug border-l-2 border-border pl-2">
                      {currentSignature}
                    </pre>
                  )}
                  {sigFlash && <p className="mt-1.5 text-[11px] text-muted-foreground">{sigFlash}</p>}
                </div>
                {replyError && <p className="px-3.5 py-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border-b border-border">{replyError}</p>}
                {/* Actions */}
                <div className="px-3.5 py-2.5 bg-muted/20 flex items-center justify-between gap-2">
                  <button onClick={() => { setReplying(false); setShowPreview(false); setPrompt(''); setGeneratedBody(''); setGeneratedSubject(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  <div className="flex gap-2">
                    {!showPreview && (
                      <button onClick={() => handleGenerate()} disabled={generating || !prompt.trim() || !fromId}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-all disabled:opacity-40">
                        {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                      </button>
                    )}
                    {showPreview && (
                      <button onClick={() => handleGenerate()} disabled={generating}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-all disabled:opacity-40">
                        <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} /> Regenerate
                      </button>
                    )}
                    {/* Send sends either the reviewed AI draft (when preview is open)
                        or the raw text the user typed (when no preview) — verbatim either way. */}
                    <button
                      onClick={handleSend}
                      disabled={sending || (showPreview ? !generatedBody.trim() : !prompt.trim()) || !fromId}
                      title={showPreview ? 'Send the reviewed draft' : 'Send your typed reply as-is'}
                      className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium rounded-lg px-3.5 py-1.5 transition-all"
                    >
                      {sending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Reply className="w-3.5 h-3.5" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
