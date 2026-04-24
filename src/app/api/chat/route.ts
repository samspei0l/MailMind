import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { parseUserIntent, generateChatResponse } from '@/lib/ai/openai';
import { getEmails, sendReply, getSummary, executeEmailAction } from '@/lib/email/actions';
import { insertChatMessage, createChatSession } from '@/lib/supabase/db';
import type { FilterAction, ReplyAction, SummaryAction, SearchAction, EmailActionPayload, ActionResult } from '@/types';

export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { message, sessionId } = body;

  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

  // Get or create session
  let activeSessionId = sessionId;
  if (!activeSessionId) {
    const session = await createChatSession(user.id, message.substring(0, 50));
    activeSessionId = session.id;
  }

  // Save user message
  await insertChatMessage({
    session_id: activeSessionId,
    user_id: user.id,
    role: 'user',
    content: message,
  });

  try {
    // Parse user intent
    const actionPayload = await parseUserIntent(user.id, message);
    let result: ActionResult = {};

    // Execute action
    switch (actionPayload.action) {
      case 'filter': {
        const filterAction = actionPayload as FilterAction;
        result = await getEmails(user.id, filterAction.filters);
        break;
      }
      case 'reply': {
        const replyAction = actionPayload as ReplyAction;
        result = await sendReply(user.id, replyAction);
        break;
      }
      case 'summary': {
        const summaryAction = actionPayload as SummaryAction;
        result = await getSummary(user.id, summaryAction);
        break;
      }
      case 'search': {
        const searchAction = actionPayload as SearchAction;
        result = await getEmails(user.id, { search: searchAction.query });
        break;
      }
      case 'email_action': {
        const ea = actionPayload as EmailActionPayload;
        const r = await executeEmailAction(user.id, {
          action: ea.email_action,
          email_ids: ea.email_ids,
          sender_email: ea.sender_email,
          connection_id: ea.connection_id,
          filters: ea.filters,
        });
        result = {
          action_result: { ...r, action: ea.email_action },
          message: r.message,
          error: r.error,
        };
        break;
      }
      default:
        result = { error: 'Unknown action type' };
    }

    // Generate conversational response
    const assistantMessage = await generateChatResponse(user.id, message, result, actionPayload);

    // Save assistant message
    const savedMessage = await insertChatMessage({
      session_id: activeSessionId,
      user_id: user.id,
      role: 'assistant',
      content: assistantMessage,
      action_type: actionPayload.action,
      action_data: actionPayload,
      result_data: {
        emails: result.emails?.slice(0, 10), // Limit stored data
        summary: result.summary,
        replies_sent: result.replies_sent,
        action_result: result.action_result,
        error: result.error,
      },
    });

    return NextResponse.json({
      sessionId: activeSessionId,
      message: assistantMessage,
      messageId: savedMessage.id,
      action: actionPayload,
      result: {
        emails: result.emails || [],
        summary: result.summary,
        replies_sent: result.replies_sent,
        action_result: result.action_result,
        error: result.error,
      },
    });
  } catch (error) {
    const errorMsg = `Sorry, I encountered an error: ${(error as Error).message}`;

    await insertChatMessage({
      session_id: activeSessionId,
      user_id: user.id,
      role: 'assistant',
      content: errorMsg,
    });

    return NextResponse.json({
      sessionId: activeSessionId,
      message: errorMsg,
      result: { error: (error as Error).message },
    }, { status: 500 });
  }
}

// GET /api/chat - get chat history for a session
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    // Return all sessions
    const { getChatSessions } = await import('@/lib/supabase/db');
    const sessions = await getChatSessions(user.id);
    return NextResponse.json({ sessions });
  }

  const { getChatMessages } = await import('@/lib/supabase/db');
  const messages = await getChatMessages(sessionId, user.id);
  return NextResponse.json({ messages });
}
