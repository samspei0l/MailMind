'use client';

import type { Email } from '@/types';
import { AlertTriangle, MessageSquare, TrendingUp, Clock } from 'lucide-react';

interface Props {
  emails: Email[];
}

export default function InboxStats({ emails }: Props) {
  const high = emails.filter((e) => e.priority === 'HIGH').length;
  const needsReply = emails.filter((e) => e.requires_reply).length;
  const unread = emails.filter((e) => !e.is_read).length;
  const today = emails.filter((e) => {
    const d = new Date(e.received_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const stats = [
    { icon: AlertTriangle, label: 'High Priority', value: high, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
    { icon: MessageSquare, label: 'Needs Reply', value: needsReply, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
    { icon: Clock, label: 'Today', value: today, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
    { icon: TrendingUp, label: 'Unread', value: unread, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 px-6 py-3 border-b border-border bg-muted/20">
      {stats.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 flex-shrink-0" />
          <div>
            <p className="text-lg font-bold leading-none">{value}</p>
            <p className="text-xs opacity-70 mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
