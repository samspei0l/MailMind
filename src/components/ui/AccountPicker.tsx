'use client';

import type { EmailConnection } from '@/types';
import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface Props {
  connections: Pick<EmailConnection, 'id' | 'email' | 'nickname' | 'color' | 'provider'>[];
  selectedId: string;
  onChange: (id: string) => void;
  label?: string;
  compact?: boolean;
}

const PROVIDER_ICONS: Record<string, string> = {
  gmail:   'G',
  outlook: '⊞',
  yahoo:   'Y!',
  icloud:  '',
  other:   '@',
};

export default function AccountPicker({ connections, selectedId, onChange, label = 'From', compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = connections.find((c) => c.id === selectedId) || connections[0];

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!connections.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>No email accounts connected</span>
        <a href="/dashboard/settings" className="text-primary hover:underline text-xs">+ Connect one</a>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      {!compact && label && (
        <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 border border-border rounded-lg bg-background hover:bg-muted/50 transition-all text-left w-full ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}
      >
        {/* Color dot */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
          style={{ background: selected?.color || '#3b82f6' }}
        >
          {PROVIDER_ICONS[selected?.provider || 'other']}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-foreground truncate ${compact ? 'text-xs' : 'text-sm'}`}>
            {selected?.nickname || selected?.email || 'Select account'}
          </div>
          {!compact && selected?.nickname && (
            <div className="text-xs text-muted-foreground truncate">{selected.email}</div>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-lg py-1 overflow-hidden min-w-[220px]">
          {connections.map((conn) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => { onChange(conn.id); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors ${conn.id === selectedId ? 'bg-primary/5' : ''}`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: conn.color || '#3b82f6' }}
              >
                {PROVIDER_ICONS[conn.provider || 'other']}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-foreground truncate">
                  {conn.nickname || conn.email}
                </div>
                {conn.nickname && (
                  <div className="text-xs text-muted-foreground truncate">{conn.email}</div>
                )}
              </div>
              {conn.id === selectedId && (
                <div className="w-4 h-4 rounded-full border-2 border-primary flex-shrink-0" />
              )}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1 px-2 pb-1">
            <a
              href="/dashboard/settings"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              + Connect another account
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
