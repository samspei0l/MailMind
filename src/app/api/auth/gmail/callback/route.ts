import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { exchangeCodeForTokens, getGmailUserEmail, createOAuthClient } from '@/lib/email/gmail';
import { upsertEmailConnection } from '@/lib/supabase/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=no_code`
    );
  }

  try {
    // Get current user
    const supabase = createServerComponentClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/login?error=not_authenticated`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Get user's Gmail address
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({ access_token: tokens.access_token });
    const { google } = await import('googleapis');
    const userInfo = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
    const gmailEmail = userInfo.data.email || '';

    // Store connection
    await upsertEmailConnection({
      user_id: user.id,
      provider: 'gmail',
      email: gmailEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
      is_active: true,
    });

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=gmail_connected`
    );
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?error=${encodeURIComponent((err as Error).message)}`
    );
  }
}
