import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Public routes — no auth required
  const publicRoutes = ['/auth/login', '/auth/register', '/api/auth'];
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r));

  // Protect /dashboard and /api routes (except auth)
  const isProtectedApi = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth');
  const isProtectedPage = pathname.startsWith('/dashboard');

  if ((isProtectedPage || isProtectedApi) && !session) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from auth pages
  if (isPublic && session && !pathname.startsWith('/api/auth')) {
    return NextResponse.redirect(new URL('/dashboard/chat', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
