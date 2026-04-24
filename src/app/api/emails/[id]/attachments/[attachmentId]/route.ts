import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getEmailById, getConnectionById } from '@/lib/supabase/db';
import { getValidAccessToken } from '@/lib/email/token';
import { fetchGmailAttachment } from '@/lib/email/gmail';
import type { EmailAttachment } from '@/types';

// GET /api/emails/:id/attachments/:attachmentId
//
// Streams the attachment bytes fetched on demand from Gmail. We never store
// the bytes themselves in Supabase (they'd balloon row size); on sync we
// stash only the metadata (filename, mime, size, attachmentId), and this
// route resolves that handle to actual bytes when the user clicks download.
//
// The client is expected to hit this URL directly via <a href>, which lets
// the browser handle the download UI and file naming.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = await getEmailById(params.id, user.id);
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });
  if (!email.connection_id) return NextResponse.json({ error: 'Email has no connection' }, { status: 400 });

  // Look up the attachment metadata we stored on sync so we can validate
  // the attachmentId belongs to this email (prevents users from probing
  // arbitrary Gmail attachment IDs) and return the correct filename/mime.
  const attachments = (email.attachments || []) as EmailAttachment[];
  const meta = attachments.find((a) => a.attachmentId === params.attachmentId);
  if (!meta) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

  const connection = await getConnectionById(email.connection_id, user.id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const accessToken = await getValidAccessToken(connection);
  const refreshToken = connection.refresh_token;

  let bytes: Buffer;
  try {
    bytes = await fetchGmailAttachment(accessToken, refreshToken ?? '', email.message_id, params.attachmentId);
  } catch (err) {
    console.error('[attachment] fetch failed', { emailId: params.id, err });
    return NextResponse.json({ error: 'Failed to fetch attachment from Gmail' }, { status: 502 });
  }

  // Sanitize filename for the Content-Disposition header — strip CR/LF
  // and quote characters that would break the header, leaving everything
  // else (unicode included, via RFC 5987 filename*).
  const safeName = meta.filename.replace(/["\r\n\\]/g, '_');
  const disposition = `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': meta.mimeType || 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': disposition,
      // Gmail bytes don't change once sent — safe to cache in the user's
      // browser for a day so repeated downloads of the same file don't
      // round-trip through our server.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
