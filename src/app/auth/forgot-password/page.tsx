'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const supabase = createSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full text-center">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'rgba(141,198,63,0.2)',
              border: '1px solid rgba(141,198,63,0.4)',
            }}
          >
            <CheckCircle className="w-7 h-7" style={{ color: 'hsl(var(--brand-lime))' }} />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
          <p className="text-white/60 text-sm">
            If an account exists for <span className="text-white font-medium">{email}</span>, we&apos;ve sent a password reset link.
          </p>
          <p className="text-white/40 text-xs mt-3">The link expires in 1 hour.</p>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold transition-colors"
            style={{ color: 'hsl(var(--brand-lime))' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{
            background: 'rgba(255,255,255,0.96)',
            boxShadow: '0 8px 28px rgba(0,78,110,0.35), inset 0 1px 0 rgba(255,255,255,0.8)',
            padding: 10,
          }}
        >
          <Image src="/mailmind-logo.png" alt="MailMind" width={40} height={40} className="object-contain" priority />
        </div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display, serif' }}>MailMind</h1>
        <p className="text-[11px] font-medium text-white/40 mt-0.5 tracking-wide">by Verizon Group</p>
        <p className="text-white/60 mt-2 text-sm">Reset your password</p>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-2">Forgot your password?</h2>
        <p className="text-white/60 text-sm mb-6">
          Enter your email and we&apos;ll send you a link to set a new one.
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DC63F]/60 focus:border-[#8DC63F]/60 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-semibold rounded-lg py-2.5 text-sm transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'hsl(var(--brand-lime))',
              boxShadow: '0 4px 14px rgba(141,198,63,0.35)',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'hsl(var(--brand-limeD))'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'hsl(var(--brand-lime))'; }}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending link...</> : 'Send reset link'}
          </button>
        </form>

        <p className="text-center text-white/50 text-sm mt-6">
          Remembered it?{' '}
          <Link
            href="/auth/login"
            className="font-semibold transition-colors"
            style={{ color: 'hsl(var(--brand-lime))' }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
