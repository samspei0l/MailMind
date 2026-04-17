'use client';

import type { Email } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Reply, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const PRIORITY_DOT: Record<string, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-green-500',
};

const CATEGORY_COLORS: Record<string, string> = {
  Sales: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Client: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Internal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Finance: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  Other: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function EmailCardMini({ email }: { email: Email }) {
  return (
    <div className="w-full bg-card border border-border rounded-xl p-3.5 text-left hover:border-primary/30 hover:bg-primary/5 transition-all">
      <div className="flex items-start gap-2.5">
        {/* Priority dot */}
        {email.priority && (
          <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[email.priority] || 'bg-slate-400'}`} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-sm font-medium text-foreground truncate">
              {email.sender_name || email.sender}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
            </span>
          </div>

          <p className="text-sm text-foreground/80 truncate mb-1">{email.subject}</p>

          {email.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{email.summary}</p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {email.category && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.Other}`}>
                {email.category}
              </span>
            )}
            {email.type && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                {email.type}
              </span>
            )}
            {email.requires_reply && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex items-center gap-1">
                <Reply className="w-2.5 h-2.5" /> Reply needed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
