import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Sidebar from '@/components/layout/Sidebar';

// Outer dashboard layout — wraps BOTH the AI-key setup flow and the gated
// app. The AI-key guard lives in the nested (gated)/layout.tsx, which only
// applies to the routes under that route group. Setup stays reachable so a
// user without a key can complete onboarding.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/auth/login');
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar user={session.user} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
