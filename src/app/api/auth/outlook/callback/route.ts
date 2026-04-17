import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { exchangeOutlookCodeForTokens, getOutlookUserEmail } from '@/lib/email/outlook';
import { upsertEmailConnection } from '@/lib/supabase/db';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=no_code`
    );
  }

  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${APP_URL}/auth/login?error=not_authenticated`);
    }

    const tokens = await exchangeOutlookCodeForTokens(code);

    if (!tokens.access_token) {
      throw new Error('No access token received from Microsoft');
    }

    const outlookEmail = await getOutlookUserEmail(tokens.access_token);

    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : undefined;

    await upsertEmailConnection({
      user_id: user.id,
      provider: 'outlook',
      email: outlookEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokenExpiry,
      is_active: true,
    });

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?success=outlook_connected`
    );
  } catch (err) {
    console.error('Outlook OAuth callback error:', err);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?error=${encodeURIComponent((err as Error).message)}`
    );
  }
}
