import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { executeEmailAction } from '@/lib/email/actions';
import type { EmailActionRequest, EmailActionType, EmailFilters } from '@/types';

// POST /api/emails/actions — mailbox mutations (trash/spam/archive/unsubscribe/block etc.)
// Body: EmailActionRequest (+ optional filters for chat-style batch actions).
// Returns EmailActionResult.
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Partial<EmailActionRequest> & { filters?: EmailFilters };

  if (!body.action) {
    return NextResponse.json({ ok: false, affected: 0, error: 'action is required' }, { status: 400 });
  }

  const allowed: EmailActionType[] = [
    'mark_read', 'mark_unread', 'star', 'unstar',
    'archive', 'unarchive', 'trash', 'untrash',
    'spam', 'not_spam', 'delete_forever',
    'block_sender', 'unblock_sender', 'unsubscribe',
  ];
  if (!allowed.includes(body.action as EmailActionType)) {
    return NextResponse.json({ ok: false, affected: 0, error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  const result = await executeEmailAction(user.id, {
    action: body.action as EmailActionType,
    email_ids: body.email_ids,
    sender_email: body.sender_email,
    connection_id: body.connection_id,
    filters: body.filters,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
