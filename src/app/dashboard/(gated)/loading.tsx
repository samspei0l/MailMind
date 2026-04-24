/**
 * Generic fallback skeleton for any gated route that doesn't provide its
 * own loading.tsx. Next.js renders this immediately on route change while
 * the target page.tsx streams in, so tab switches feel instant even when
 * the server component is doing a Supabase round-trip.
 */
export default function GatedLoading() {
  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="px-6 py-4 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="h-5 w-40 rounded shimmer" />
        <div className="h-3 w-60 mt-2 rounded shimmer" />
      </div>
      <div className="flex-1 px-6 py-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl shimmer" />
        ))}
      </div>
    </div>
  );
}
