'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Mail, Lock, User, Loader2, Clock } from 'lucide-react';
import { SYNC_FREQUENCY_OPTIONS, type SyncFrequency } from '@/types';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [syncFrequency, setSyncFrequency] = useState<SyncFrequency>(1440);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseClient();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          // Stored as string in user_metadata; the DB trigger casts to integer.
          // Empty string → NULL (manual sync).
          sync_frequency_minutes: syncFrequency === null ? '' : String(syncFrequency),
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
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
            <Mail className="w-7 h-7" style={{ color: 'hsl(var(--brand-lime))' }} />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
          <p className="text-white/60 text-sm">We sent a confirmation link to <span className="text-white font-medium">{email}</span></p>
          <Link
            href="/auth/login"
            className="inline-block mt-6 text-sm font-semibold transition-colors"
            style={{ color: 'hsl(var(--brand-lime))' }}
          >
            Back to sign in
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
        <p className="text-white/60 mt-2 text-sm">Get started for free</p>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-6">Create your account</h2>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
        )}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="John Smith"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DC63F]/60 focus:border-[#8DC63F]/60 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DC63F]/60 focus:border-[#8DC63F]/60 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min. 6 characters"
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DC63F]/60 focus:border-[#8DC63F]/60 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">How often should we sync your email?</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <select
                value={syncFrequency === null ? 'null' : String(syncFrequency)}
                onChange={(e) => setSyncFrequency(e.target.value === 'null' ? null : Number(e.target.value) as SyncFrequency)}
                className="w-full appearance-none bg-white/5 border border-white/10 text-white rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DC63F]/60 focus:border-[#8DC63F]/60 transition-all"
              >
                {SYNC_FREQUENCY_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={o.value === null ? 'null' : String(o.value)} className="bg-slate-900">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-white/40 mt-1.5">
              {SYNC_FREQUENCY_OPTIONS.find((o) => o.value === syncFrequency)?.description}
            </p>
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
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : 'Create account'}
          </button>
        </form>
        <p className="text-center text-white/50 text-sm mt-6">
          Already have an account?{' '}
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
