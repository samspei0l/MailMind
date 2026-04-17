import { NextRequest, NextResponse } from 'next/server';
import { getDueAutoSyncJobs } from '@/lib/supabase/db';
import { syncEmailsForConnection } from '@/lib/email/actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron hits this endpoint on a schedule (see vercel.json).
// It authenticates with the CRON_SECRET env var — Vercel sets
// `Authorization: Bearer <CRON_SECRET>` automatically on cron invocations.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const jobs = await getDueAutoSyncJobs();

  const results = await Promise.allSettled(
    jobs.map((job) => syncEmailsForConnection(job.userId, job.connection, 50))
  );

  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'fulfilled') {
        acc.synced += r.value.synced;
        acc.enriched += r.value.enriched;
        if (r.value.error) acc.errors++;
      } else {
        acc.errors++;
      }
      return acc;
    },
    { synced: 0, enriched: 0, errors: 0 },
  );

  return NextResponse.json({
    jobs: jobs.length,
    ...summary,
    duration_ms: Date.now() - started,
  });
}
