'use client';

import { useState, useCallback, useRef } from 'react';
import type { ActionPayload } from '@/types';

export interface ChatMessageState {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  emails?: unknown[];
  summary?: string;
  replies_sent?: number;
  error?: string;
  action?: ActionPayload;
  timestamp: Date;
}

interface UseChatReturn {
  messages: ChatMessageState[];
  sessionId: string | undefined;
  sending: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChat(initialSessionId?: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageState[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [sending, setSending] = useState(false);
  const loadingMsgIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: ChatMessageState = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const loadingId = crypto.randomUUID();
    loadingMsgIdRef.current = loadingId;

    const loadingMsg: ChatMessageState = {
      id: loadingId,
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
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
          m.id === loadingId
            ? {
                ...m,
                loading: false,
                content: `Sorry, something went wrong: ${(err as Error).message}`,
                error: (err as Error).message,
              }
            : m
        )
      );
    } finally {
      setSending(false);
      loadingMsgIdRef.current = null;
    }
  }, [sending, sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
  }, []);

  return { messages, sessionId, sending, sendMessage, clearMessages };
}
