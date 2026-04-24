import { createSupabaseAdminClient } from './server';
import type {
  Email, EmailFilters, EmailConnection, ChatMessage, ChatSession, ComposedEmail, Profile, BlockedSender,
} from '@/types';
import { MAX_EMAIL_ACCOUNTS } from '@/types';

const supabase = createSupabaseAdminClient();

// ============================================================
// EMAIL CONNECTIONS — multi-account (up to MAX_EMAIL_ACCOUNTS per user)
// ============================================================

export async function getAllEmailConnections(userId: string): Promise<EmailConnection[]> {
  const { data, error } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`getAllEmailConnections: ${error.message}`);
  return data || [];
}

export async function getEmailConnection(userId: string, provider?: string): Promise<EmailConnection | null> {
  let q = supabase.from('email_connections').select('*').eq('user_id', userId).eq('is_active', true);
  if (provider) q = q.eq('provider', provider);
  const { data } = await q.order('sort_order').limit(1).single();
  return data || null;
}

export async function getConnectionById(id: string, userId: string): Promise<EmailConnection | null> {
  const { data } = await supabase.from('email_connections').select('*').eq('id', id).eq('user_id', userId).single();
  return data || null;
}

export async function upsertEmailConnection(connection: Record<string, unknown>): Promise<EmailConnection> {
  // Count active connections for this user (excluding same email address = reconnect)
  const { count } = await supabase
    .from('email_connections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', connection.user_id as string)
    .eq('is_active', true);
  const { data: existing } = await supabase
    .from('email_connections')
    .select('id')
    .eq('user_id', connection.user_id as string)
    .eq('email', connection.email as string)
    .single();
  if (!existing && (count || 0) >= MAX_EMAIL_ACCOUNTS) {
    throw new Error(`Maximum of ${MAX_EMAIL_ACCOUNTS} email accounts allowed per user. Please disconnect one first.`);
  }
  const { data, error } = await supabase
    .from('email_connections')
    .upsert(connection, { onConflict: 'user_id,email' })
    .select()
    .single();
  if (error) throw new Error(`upsertEmailConnection: ${error.message}`);
  return data;
}

export async function updateConnectionNickname(id: string, userId: string, nickname: string) {
  await supabase.from('email_connections').update({ nickname }).eq('id', id).eq('user_id', userId);
}

export async function removeEmailConnection(id: string, userId: string) {
  await supabase.from('email_connections').update({ is_active: false }).eq('id', id).eq('user_id', userId);
}

export async function updateLastSync(connectionId: string) {
  await supabase.from('email_connections').update({ last_sync_at: new Date().toISOString() }).eq('id', connectionId);
}

export async function updateConnectionSignature(id: string, userId: string, signature: string | null) {
  const { error } = await supabase
    .from('email_connections')
    .update({ signature, signature_extracted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`updateConnectionSignature: ${error.message}`);
}

// ============================================================
// PROFILE + AUTO-SYNC
// ============================================================

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data || null;
}

export async function updateSyncFrequency(userId: string, minutes: number | null) {
  const { error } = await supabase.from('profiles').update({ sync_frequency_minutes: minutes }).eq('id', userId);
  if (error) throw new Error(`updateSyncFrequency: ${error.message}`);
}

// ============================================================
// AI PROVIDER CONFIG (per-user key lives in profiles)
// ============================================================

export async function getAIConfigForUser(userId: string): Promise<{
  ai_provider: string | null;
  ai_model: string | null;
  ai_base_url: string | null;
  has_key: boolean;
} | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_provider, ai_model, ai_base_url, ai_api_key_encrypted')
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  if (!data) return { ai_provider: null, ai_model: null, ai_base_url: null, has_key: false };
  return {
    ai_provider: data.ai_provider,
    ai_model: data.ai_model,
    ai_base_url: data.ai_base_url,
    has_key: !!data.ai_api_key_encrypted,
  };
}

// Upserts to survive the case where the `handle_new_user` trigger didn't run
// (older users, trigger disabled, etc.) — otherwise a plain UPDATE would
// silently affect 0 rows and the gated layout would bounce the user back to
// /dashboard/setup forever.
export async function updateUserAIConfig(userId: string, params: {
  email: string;
  provider: string;
  model: string;
  baseURL: string | null;
  encryptedKey: string;
}) {
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      email: params.email,
      ai_provider: params.provider,
      ai_model: params.model,
      ai_base_url: params.baseURL,
      ai_api_key_encrypted: params.encryptedKey,
      ai_configured_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw new Error(`updateUserAIConfig: ${error.message}`);
}

// Returns (user_id, freq, connection) for every active connection belonging to a
// user who opted into auto-sync AND whose connection is overdue for its next run.
export async function getDueAutoSyncJobs(): Promise<Array<{ userId: string; frequency: number; connection: EmailConnection }>> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, sync_frequency_minutes')
    .not('sync_frequency_minutes', 'is', null);
  if (error) throw new Error(`getDueAutoSyncJobs: ${error.message}`);
  if (!profiles || profiles.length === 0) return [];

  const now = Date.now();
  const jobs: Array<{ userId: string; frequency: number; connection: EmailConnection }> = [];

  for (const p of profiles) {
    const freq = p.sync_frequency_minutes as number;
    const { data: conns } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', p.id)
      .eq('is_active', true);
    for (const c of conns || []) {
      const lastMs = c.last_sync_at ? new Date(c.last_sync_at).getTime() : 0;
      if (now - lastMs >= freq * 60_000) {
        jobs.push({ userId: p.id, frequency: freq, connection: c as EmailConnection });
      }
    }
  }
  return jobs;
}

// ============================================================
// EMAIL CRUD
// ============================================================

export async function upsertEmails(emails: Partial<Email>[]) {
  const { data, error } = await supabase.from('emails').upsert(emails, { onConflict: 'user_id,message_id' }).select();
  if (error) throw new Error(`upsertEmails: ${error.message}`);
  return data;
}

// Return the subset of messageIds that already exist for this user.
// Used by sync to distinguish genuinely new emails from re-fetched ones, so
// the UI can say "already up to date" when nothing new arrived.
export async function getExistingMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('emails')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', messageIds);
  if (error) throw new Error(`getExistingMessageIds: ${error.message}`);
  return new Set((data || []).map((r: { message_id: string }) => r.message_id));
}

export async function getEmailsByFilters(userId: string, filters: EmailFilters): Promise<Email[]> {
  let q = supabase.from('emails').select('*').eq('user_id', userId).order('received_at', { ascending: false });
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.connection_id) q = q.eq('connection_id', filters.connection_id);
  if (filters.direction) q = q.eq('direction', filters.direction);
  if (filters.requires_reply !== undefined) q = q.eq('requires_reply', filters.requires_reply);
  if (filters.sender) q = q.ilike('sender', `%${filters.sender}%`);
  if (filters.date_from) q = q.gte('received_at', filters.date_from);
  if (filters.date_to) q = q.lte('received_at', filters.date_to);
  if (filters.search) q = q.or(`subject.ilike.%${filters.search}%,body.ilike.%${filters.search}%,sender.ilike.%${filters.search}%`);

  // Mailbox view — default is inbox (hide trashed/spam/archived so they
  // don't clutter the main list). Dedicated buckets scope to one flag.
  // 'all' skips every status filter for debug/admin surfaces.
  const view = filters.view || 'inbox';
  if (view === 'inbox') {
    q = q.eq('is_trashed', false).eq('is_spam', false).eq('is_archived', false);
  } else if (view === 'trash') {
    q = q.eq('is_trashed', true);
  } else if (view === 'spam') {
    q = q.eq('is_spam', true);
  } else if (view === 'archive') {
    q = q.eq('is_archived', true).eq('is_trashed', false).eq('is_spam', false);
  }

  q = q.limit(filters.limit || 50);
  const { data, error } = await q;
  if (error) throw new Error(`getEmailsByFilters: ${error.message}`);
  return data || [];
}

export async function getEmailById(id: string, userId: string): Promise<Email | null> {
  const { data } = await supabase.from('emails').select('*').eq('id', id).eq('user_id', userId).single();
  return data || null;
}

// History view — pulls recent emails (both directions) and groups by thread on
// the server. Returning threads keeps the payload small and the UI simple.
export async function getThreads(userId: string, limit = 200): Promise<Array<{
  threadId: string;
  subject: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessage: Email;
  participants: string[];
  hasSent: boolean;
  hasReceived: boolean;
}>> {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .not('thread_id', 'is', null)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getThreads: ${error.message}`);

  const byThread = new Map<string, Email[]>();
  for (const e of (data || []) as Email[]) {
    const tid = e.thread_id as string;
    if (!byThread.has(tid)) byThread.set(tid, []);
    byThread.get(tid)!.push(e);
  }

  const threads = Array.from(byThread.entries()).map(([threadId, msgs]) => {
    const sorted = msgs.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    const last = sorted[0];
    const participants = Array.from(new Set(sorted.flatMap((m) => [m.sender, m.recipient].filter(Boolean) as string[])));
    return {
      threadId,
      subject: last.subject,
      messageCount: sorted.length,
      lastMessageAt: last.received_at,
      lastMessage: last,
      participants,
      hasSent: sorted.some((m) => m.direction === 'sent'),
      hasReceived: sorted.some((m) => m.direction === 'received'),
    };
  });

  threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return threads;
}

export async function getThreadMessages(userId: string, threadId: string): Promise<Email[]> {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .order('received_at', { ascending: true });
  if (error) throw new Error(`getThreadMessages: ${error.message}`);
  return (data || []) as Email[];
}

export async function updateEmailAI(emailId: string, enrichment: Partial<Email>) {
  const { error } = await supabase.from('emails').update({ ...enrichment, ai_processed_at: new Date().toISOString() }).eq('id', emailId);
  if (error) throw new Error(`updateEmailAI: ${error.message}`);
}

// ============================================================
// MAILBOX MUTATION HELPERS
// ============================================================
//
// These mirror the Gmail label changes on the DB side. The action layer
// first flips the Gmail labels (source of truth), then calls these so the
// cached inbox list stays in sync and default queries filter trashed /
// spam / archived rows. Scoped by user_id for safety even though the caller
// already validated the session.

export async function updateEmailFlags(
  userId: string,
  ids: string[],
  flags: Partial<Pick<Email, 'is_read' | 'is_starred' | 'is_trashed' | 'is_spam' | 'is_archived'>>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from('emails')
    .update(flags)
    .eq('user_id', userId)
    .in('id', ids)
    .select('id');
  if (error) throw new Error(`updateEmailFlags: ${error.message}`);
  return data?.length ?? 0;
}

// Hard delete — used only for delete_forever after Gmail's permanent-delete
// call has succeeded. The chat layer prompts for confirmation before this.
export async function deleteEmailsByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from('emails')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)
    .select('id');
  if (error) throw new Error(`deleteEmailsByIds: ${error.message}`);
  return data?.length ?? 0;
}

export async function getEmailsByIds(userId: string, ids: string[]): Promise<Email[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .in('id', ids);
  if (error) throw new Error(`getEmailsByIds: ${error.message}`);
  return (data || []) as Email[];
}

// Case-insensitive exact sender match — callers may pass either the bare
// email (alerts@foo.com) or a display form; the Gmail filter needs the bare
// form, so block_sender callers should normalise before calling.
export async function getEmailsBySender(
  userId: string,
  senderEmail: string,
  connectionId?: string,
): Promise<Email[]> {
  let q = supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .ilike('sender', senderEmail);
  if (connectionId) q = q.eq('connection_id', connectionId);
  const { data, error } = await q;
  if (error) throw new Error(`getEmailsBySender: ${error.message}`);
  return (data || []) as Email[];
}

// ============================================================
// BLOCKED SENDERS
// ============================================================

export async function listBlockedSenders(userId: string): Promise<BlockedSender[]> {
  const { data, error } = await supabase
    .from('blocked_senders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listBlockedSenders: ${error.message}`);
  return (data || []) as BlockedSender[];
}

export async function insertBlockedSender(row: {
  user_id: string;
  connection_id: string | null;
  sender_email: string;
  gmail_filter_id: string | null;
}): Promise<BlockedSender> {
  const { data, error } = await supabase
    .from('blocked_senders')
    .upsert(row, { onConflict: 'user_id,connection_id,sender_email' })
    .select()
    .single();
  if (error) throw new Error(`insertBlockedSender: ${error.message}`);
  return data as BlockedSender;
}

// Returns the deleted rows so the caller can revoke each Gmail filter.
export async function deleteBlockedSendersByEmail(
  userId: string,
  senderEmail: string,
  connectionId?: string,
): Promise<BlockedSender[]> {
  let q = supabase
    .from('blocked_senders')
    .delete()
    .eq('user_id', userId)
    .ilike('sender_email', senderEmail);
  if (connectionId) q = q.eq('connection_id', connectionId);
  const { data, error } = await q.select();
  if (error) throw new Error(`deleteBlockedSendersByEmail: ${error.message}`);
  return (data || []) as BlockedSender[];
}

// ============================================================
// COMPOSED EMAILS
// ============================================================

export async function saveComposedEmail(data: Record<string, unknown>): Promise<ComposedEmail> {
  const { data: result, error } = await supabase
    .from('composed_emails')
    .insert({ ...data, status: data.status || 'draft', ai_generated: true })
    .select().single();
  if (error) throw new Error(`saveComposedEmail: ${error.message}`);
  return result;
}

export async function updateComposedEmailStatus(id: string, status: 'sent' | 'failed', opts?: { sent_message_id?: string; error_message?: string }) {
  await supabase.from('composed_emails').update({
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
    sent_message_id: opts?.sent_message_id || null,
    error_message: opts?.error_message || null,
  }).eq('id', id);
}

export async function getComposedEmails(userId: string, limit = 20): Promise<ComposedEmail[]> {
  const { data, error } = await supabase.from('composed_emails').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`getComposedEmails: ${error.message}`);
  return data || [];
}

// ============================================================
// VOICE TRANSCRIPTIONS
// ============================================================

export async function saveVoiceTranscription(data: Record<string, unknown>) {
  const { error } = await supabase.from('voice_transcriptions').insert(data);
  if (error) console.error('saveVoiceTranscription:', error.message);
}

// ============================================================
// REPLY TRACKING
// ============================================================

export async function logEmailReply(reply: Record<string, unknown>) {
  const { error } = await supabase.from('email_replies').insert(reply);
  if (error) console.error('logEmailReply:', error.message);
}

// ============================================================
// CHAT
// ============================================================

export async function createChatSession(userId: string, title = 'New Chat'): Promise<ChatSession> {
  const { data, error } = await supabase.from('chat_sessions').insert({ user_id: userId, title }).select().single();
  if (error) throw new Error(`createChatSession: ${error.message}`);
  return data;
}

export async function getChatSessions(userId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase.from('chat_sessions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20);
  if (error) throw new Error(`getChatSessions: ${error.message}`);
  return data || [];
}

export async function getChatMessages(sessionId: string, userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw new Error(`getChatMessages: ${error.message}`);
  return data || [];
}

export async function insertChatMessage(message: Partial<ChatMessage>): Promise<ChatMessage> {
  const { data, error } = await supabase.from('chat_messages').insert(message).select().single();
  if (error) throw new Error(`insertChatMessage: ${error.message}`);
  return data;
}
