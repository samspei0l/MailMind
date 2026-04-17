import { createOAuthClient } from '@/lib/email/gmail';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { EmailConnection } from '@/types';

/**
 * Refreshes a Gmail access token if it's expired or about to expire.
 * Returns the valid access token (refreshed or original).
 */
export async function getValidAccessToken(connection: EmailConnection): Promise<string> {
  if (!connection.refresh_token) {
    return connection.access_token;
  }

  // Check if token expires within 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 min in ms
  const isExpired = connection.token_expiry
    ? new Date(connection.token_expiry).getTime() - Date.now() < expiryBuffer
    : false;

  if (!isExpired) {
    return connection.access_token;
  }

  // Refresh the token
  try {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
      refresh_token: connection.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token!;
    const newExpiry = credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : null;

    // Update in DB
    const supabase = createSupabaseAdminClient();
    await supabase
      .from('email_connections')
      .update({
        access_token: newAccessToken,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);

    return newAccessToken;
  } catch (err) {
    console.error('Token refresh failed:', err);
    // Return original token — let the Gmail API call fail naturally
    return connection.access_token;
  }
}

/**
 * Marks a connection as inactive (e.g. when refresh fails with invalid_grant)
 */
export async function invalidateConnection(connectionId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from('email_connections')
    .update({ is_active: false })
    .eq('id', connectionId);
}
