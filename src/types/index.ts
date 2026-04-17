// ============================================================
// CORE TYPES
// ============================================================

export type EmailPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type EmailCategory = 'Sales' | 'Client' | 'Internal' | 'Finance' | 'Marketing' | 'Other';
export type EmailType = 'New Request' | 'Reply Received' | 'Quotation' | 'Complaint' | 'Update' | 'Other';
export type EmailProvider = 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'other';
export type ChatRole = 'user' | 'assistant';
export type ActionType = 'filter' | 'reply' | 'summary' | 'search' | 'compose';
export type EmailTone = 'professional' | 'friendly' | 'formal' | 'assertive' | 'concise' | 'apologetic' | 'persuasive';
export type ComposedEmailStatus = 'draft' | 'sent' | 'failed';

// Max accounts allowed per user
export const MAX_EMAIL_ACCOUNTS = 10;

// Sync frequency — minutes between auto-syncs. null = manual only.
export type SyncFrequency = 5 | 15 | 30 | 60 | null;

export const SYNC_FREQUENCY_OPTIONS: Array<{ value: SyncFrequency; label: string; description: string }> = [
  { value: 5,    label: 'Every 5 minutes',  description: 'Near real-time — best for busy inboxes' },
  { value: 15,   label: 'Every 15 minutes', description: 'Frequent — good default' },
  { value: 30,   label: 'Every 30 minutes', description: 'Balanced' },
  { value: 60,   label: 'Every hour',       description: 'Light — saves API quota' },
  { value: null, label: 'Manual only',      description: 'Never auto-sync' },
];

// ============================================================
// DATABASE TYPES (mirrors Supabase tables)
// ============================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  sync_frequency_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface EmailConnection {
  id: string;
  user_id: string;
  provider: EmailProvider;
  email: string;
  nickname: string | null;        // User-set display name e.g. "Work Gmail"
  color: string;                  // Hex color for visual distinction in UI
  sort_order: number;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  user_id: string;
  connection_id: string | null;
  message_id: string;
  thread_id: string | null;
  sender: string;
  sender_name: string | null;
  recipient: string | null;
  subject: string;
  body: string | null;
  body_html: string | null;
  snippet: string | null;
  is_read: boolean;
  is_starred: boolean;
  labels: string[] | null;
  received_at: string;
  // AI enrichment
  summary: string | null;
  priority: EmailPriority | null;
  category: EmailCategory | null;
  type: EmailType | null;
  requires_reply: boolean;
  intent: string | null;
  suggested_reply: string | null;
  ai_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  action_type: ActionType | null;
  action_data: ActionPayload | null;
  result_data: ActionResult | null;
  created_at: string;
}

export interface EmailReply {
  id: string;
  user_id: string;
  email_id: string;
  thread_id: string | null;
  subject: string | null;
  body: string;
  sent_at: string;
  status: 'sent' | 'failed' | 'draft';
  error_message: string | null;
}

// ============================================================
// COMPOSED EMAIL — new emails written from scratch
// ============================================================
export interface ComposedEmail {
  id: string;
  user_id: string;
  connection_id: string | null;
  from_email: string;
  to_email: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body: string;
  prompt: string | null;
  tone: EmailTone;
  ai_generated: boolean;
  sent_message_id: string | null;
  status: ComposedEmailStatus;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VOICE TRANSCRIPTION
// ============================================================
export interface VoiceTranscription {
  id: string;
  user_id: string;
  audio_duration_seconds: number | null;
  transcript: string;
  composed_email_id: string | null;
  created_at: string;
}

// ============================================================
// COMPOSE REQUEST (from UI -> API)
// ============================================================
export interface ComposeRequest {
  prompt: string;               // Natural language or voice transcript
  tone?: EmailTone;
  from_connection_id: string;   // Which account to send from
  to?: string;                  // Can be omitted if in prompt
  cc?: string;
  subject?: string;             // AI-generated if omitted
  reply_to_email_id?: string;   // Set when replying to existing email
  send_immediately?: boolean;
}

export interface ComposeResult {
  subject: string;
  body: string;
  to: string;
  cc?: string;
  tone: EmailTone;
  from_email: string;
  composed_email_id?: string;
  sent?: boolean;
}

// ============================================================
// AI ACTION TYPES
// ============================================================

export interface EmailFilters {
  priority?: EmailPriority;
  category?: EmailCategory;
  type?: EmailType;
  requires_reply?: boolean;
  sender?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  connection_id?: string;       // Filter by specific account
  limit?: number;
}

export interface FilterAction {
  action: 'filter';
  filters: EmailFilters;
  summary_request?: boolean;
}

export interface ReplyAction {
  action: 'reply';
  filters: EmailFilters;
  message: string;
  tone?: EmailTone;
}

export interface SummaryAction {
  action: 'summary';
  date_range?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'custom';
  date_from?: string;
  date_to?: string;
}

export interface SearchAction {
  action: 'search';
  query: string;
}

export interface ComposeAction {
  action: 'compose';
  prompt: string;
  tone?: EmailTone;
  to?: string;
  from_connection_id?: string;
}

export type ActionPayload = FilterAction | ReplyAction | SummaryAction | SearchAction | ComposeAction;

export interface ActionResult {
  emails?: Email[];
  summary?: string;
  replies_sent?: number;
  compose_result?: ComposeResult;
  error?: string;
  message?: string;
}

// ============================================================
// AI ENRICHMENT RESPONSE
// ============================================================

export interface AIEmailEnrichment {
  summary: string;
  priority: EmailPriority;
  category: EmailCategory;
  type: EmailType;
  requires_reply: boolean;
  intent: string;
  suggested_reply: string;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ============================================================
// GMAIL TYPES
// ============================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body: { data?: string; size: number };
      parts?: Array<{ mimeType: string; body: { data?: string; size: number } }>;
    }>;
  };
  internalDate: string;
}

export interface ParsedEmail {
  messageId: string;
  threadId: string;
  sender: string;
  senderName: string;
  recipient: string;
  subject: string;
  body: string;
  bodyHtml: string;
  snippet: string;
  receivedAt: Date;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
}

// ============================================================
// ACCOUNT COLORS — preset palette for multi-account display
// ============================================================
export const ACCOUNT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

export const TONE_LABELS: Record<EmailTone, { label: string; description: string; emoji: string }> = {
  professional: { label: 'Professional', description: 'Polished and business-appropriate', emoji: '💼' },
  friendly:     { label: 'Friendly',     description: 'Warm, approachable tone',           emoji: '😊' },
  formal:       { label: 'Formal',       description: 'Highly formal, for executives',      emoji: '🎩' },
  assertive:    { label: 'Assertive',    description: 'Direct and confident',               emoji: '💪' },
  concise:      { label: 'Concise',      description: 'Short and to the point',             emoji: '⚡' },
  apologetic:   { label: 'Apologetic',   description: 'Empathetic and sorry',               emoji: '🙏' },
  persuasive:   { label: 'Persuasive',   description: 'Convincing and compelling',          emoji: '🎯' },
};
