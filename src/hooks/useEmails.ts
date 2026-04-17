'use client';

import { useState, useCallback } from 'react';
import type { Email, EmailFilters } from '@/types';

interface UseEmailsReturn {
  emails: Email[];
  loading: boolean;
  error: string | null;
  fetchEmails: (filters?: EmailFilters) => Promise<void>;
  syncEmails: (maxResults?: number) => Promise<{ synced: number; enriched: number } | null>;
  syncing: boolean;
}

export function useEmails(initialEmails: Email[] = []): UseEmailsReturn {
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async (filters: EmailFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, String(v));
      });
      const res = await fetch(`/api/emails?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncEmails = useCallback(async (maxResults = 50) => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Refresh list after sync
      await fetchEmails();
      return data;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [fetchEmails]);

  return { emails, loading, error, fetchEmails, syncEmails, syncing };
}
