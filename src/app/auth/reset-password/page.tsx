'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Lock, Loader2, Sparkles, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // Whether Supabase has verified the recovery link and we can accept a new password
  const [ready, setReady] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const router = useRouter();
  const supabase = createSupabaseClient();

  // Reset-link flow:
  //   1. Supabase email link lands here with either a URL hash
  //      (#access_token=...&type=recovery) or a PKCE code (?code=...).
  //   2. The Supabase client auto-parses it and fires PASSWORD_RECOVERY
  //      (or SIGNED_IN for PKCE), which creates a short-lived session
  //      that's only valid for updateUser({ password }).
  //   3. If no token is in the URL, or the token is invalid/expired,
  //      no session is ever created — show the expired UI.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const hasRecoveryHash = hash.includes('type=recovery') && hash.includes('access_token');
    const hasPkceCode = new URLSearchParams(search).has('code');
    const hasAuthError = hash.includes('error=') || search.includes('error=');

    // Page was opened directly, or Supabase bounced the link (often because
    // the redirect URL isn't allowlisted in the project's auth settings).
    if (!hasRecoveryHash && !hasPkceCode) {
      setVerifying(false);
      return;
    }
    if (hasAuthError) {
      setVerifying(false);
      return;
    }

    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      setReady(ok);
      setVerifying(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        finish(true);
      }
    });

    // Poll getSession — auth-helpers parses the URL asynchronously on first
    // load, and the event can fire before this effect subscribes. 6 * 500ms
    // gives enough headroom without the user staring at a spinner.
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        clearInterval(interval);
        finish(true);
      } else if (attempts >= 6) {
        clearInterval(interval);
        finish(false);
      }
    }, 500);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      // Sign out the recovery session so the user re-authenticates cleanly
      await supabase.auth.signOut();
      setTimeout(() => router.push('/auth/login'), 2500);
    }
  }

  if (success) {
    return (
      <div className="w-full text-center">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <div className="w-14 h-14 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Password updated</h2>
          <p className="text-slate-400 text-sm">Redirecting you to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500/20 border border-blue-500/30 rounded-2xl mb-4">
          <Sparkles className="w-7 h-7 text-blue-400" />
        </div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display, serif' }}>MailMind</h1>
        <p className="text-slate-400 mt-1 text-sm">Set a new password</p>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        {verifying ? (
          <div className="flex items-center justify-center py-6 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Verifying reset link...
          </div>
        ) : !ready ? (
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Link invalid or expired</h2>
            <p className="text-slate-400 text-sm mb-6">
              Reset links expire after 1 hour and can only be used once. Request a fresh one.
            </p>
            <Link
              href="/auth/forgot-password"
              className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm transition-all"
            >
              Request new link
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-white mb-6">Choose a new password</h2>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Min. 6 characters"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm new password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-all flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</> : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
