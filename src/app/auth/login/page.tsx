'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Mail, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createSupabaseClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard/chat');
      router.refresh();
    }
  }

  return (
    <div className="w-full">
      {/* Brand */}
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
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'DM Serif Display, serif' }}>
          MailMind
        </h1>
        <p className="text-[11px] font-medium text-white/40 mt-0.5 tracking-wide">by Verizon Group</p>
        <p className="text-white/60 mt-2 text-sm">Your AI-powered email intelligence</p>
      </div>

      {/* Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-6">Sign in to your account</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-white/80">Password</label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium transition-colors"
                style={{ color: 'hsl(var(--brand-lime))' }}
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
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
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-white/50 text-sm mt-6">
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/register"
            className="font-semibold transition-colors"
            style={{ color: 'hsl(var(--brand-lime))' }}
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
