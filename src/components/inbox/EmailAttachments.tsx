'use client';

import type { EmailAttachment } from '@/types';
import {
  FileText, Image as ImageIcon, FileArchive, FileSpreadsheet,
  FileAudio, FileVideo, FileCode, File as FileIcon, Download, Paperclip,
} from 'lucide-react';
import { useState } from 'react';

interface Props {
  emailId: string;
  attachments: EmailAttachment[];
}

/**
 * Maps a MIME type to an icon + colour pair. The palette matches the
 * inbox chip accents so the attachment strip feels of-a-piece with the
 * rest of the email panel.
 */
function iconFor(mime: string): { Icon: typeof FileIcon; bg: string; fg: string } {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/'))          return { Icon: ImageIcon,       bg: '#F3E8FF', fg: '#7C3AED' };
  if (m.startsWith('audio/'))          return { Icon: FileAudio,       bg: '#FCE7F3', fg: '#BE185D' };
  if (m.startsWith('video/'))          return { Icon: FileVideo,       bg: '#DBEAFE', fg: '#1D4ED8' };
  if (m.includes('pdf'))               return { Icon: FileText,        bg: '#FEE2E2', fg: '#DC2626' };
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar'))
                                       return { Icon: FileArchive,     bg: '#FEF3C7', fg: '#B45309' };
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv'))
                                       return { Icon: FileSpreadsheet, bg: '#DCFCE7', fg: '#15803D' };
  if (m.includes('word') || m.includes('document')) return { Icon: FileText, bg: 'rgba(0,78,110,0.1)', fg: 'hsl(var(--brand-teal))' };
  if (m.includes('json') || m.includes('xml') || m.includes('html') || m.includes('javascript'))
                                       return { Icon: FileCode,        bg: '#E0E7FF', fg: '#4338CA' };
  return { Icon: FileIcon, bg: 'hsl(var(--muted))', fg: 'hsl(var(--muted-foreground))' };
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function EmailAttachments({ emailId, attachments }: Props) {
  // Filter out inline attachments (logos embedded in signatures etc.) —
  // they've already been rendered in the body, showing them as a "file"
  // on top would be noise.
  const visible = attachments.filter((a) => !a.inline);
  if (visible.length === 0) return null;

  return (
    <div className="mx-6 mb-6 mt-2">
      <div className="flex items-center gap-2 mb-2.5">
        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {visible.length} attachment{visible.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((a) => (
          <AttachmentCard key={a.attachmentId} emailId={emailId} attachment={a} />
        ))}
      </div>
    </div>
  );
}

function AttachmentCard({ emailId, attachment }: { emailId: string; attachment: EmailAttachment }) {
  const { Icon, bg, fg } = iconFor(attachment.mimeType);
  const [loading, setLoading] = useState(false);
  const href = `/api/emails/${emailId}/attachments/${encodeURIComponent(attachment.attachmentId)}`;

  // We go through a fetch → Blob → ObjectURL click to surface loading state
  // (the server may take a beat to round-trip to Gmail). For a plain anchor
  // the user would just see an unresponsive button until download starts.
  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error('[attachment] download failed', err);
      alert('Failed to download attachment. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <a
      href={href}
      onClick={handleDownload}
      className="group flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-md transition-all"
      title={`Download ${attachment.filename}`}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
        style={{ background: bg, color: fg }}
      >
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
          {attachment.filename}
        </p>
        <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
          {attachment.mimeType.split(';')[0] || 'File'}
          {attachment.size ? ` · ${formatSize(attachment.size)}` : ''}
        </p>
      </div>
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-muted-foreground group-hover:text-primary group-hover:bg-primary/5 transition-colors"
        aria-hidden
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </div>
    </a>
  );
}
