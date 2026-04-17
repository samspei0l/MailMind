'use client';

import type { EmailTone } from '@/types';
import { TONE_LABELS } from '@/types';

interface Props {
  value: EmailTone;
  onChange: (tone: EmailTone) => void;
  compact?: boolean;
}

export default function TonePicker({ value, onChange, compact = false }: Props) {
  const tones = Object.entries(TONE_LABELS) as [EmailTone, typeof TONE_LABELS[EmailTone]][];

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {tones.map(([tone, meta]) => (
          <button
            key={tone}
            type="button"
            onClick={() => onChange(tone)}
            title={meta.description}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
              value === tone
                ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                : 'border-border text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span className="text-sm leading-none">{meta.emoji}</span>
            {meta.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">Tone</label>
      <div className="grid grid-cols-4 gap-1.5">
        {tones.map(([tone, meta]) => (
          <button
            key={tone}
            type="button"
            onClick={() => onChange(tone)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${
              value === tone
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            <span className="text-base leading-none">{meta.emoji}</span>
            <span className="text-xs font-medium leading-tight">{meta.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
