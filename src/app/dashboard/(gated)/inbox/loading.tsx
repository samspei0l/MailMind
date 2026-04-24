/**
 * Inbox skeleton — mirrors the 3-pane InboxClient layout so switching to
 * Inbox from another tab doesn't flash a different shape before the real
 * page streams in.
 */
export default function InboxLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[360px] flex-shrink-0 bg-card border-r border-border flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="h-5 w-16 rounded shimmer" />
            <div className="h-5 w-24 rounded-full shimmer" />
          </div>
          <div className="h-9 w-full rounded-[9px] shimmer" />
        </div>
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-border flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-full shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 rounded shimmer" />
                  <div className="h-3 w-10 rounded shimmer" />
                </div>
                <div className="h-3 w-48 rounded shimmer" />
                <div className="h-3 w-full max-w-[220px] rounded shimmer" />
                <div className="flex gap-1.5 pt-1">
                  <div className="h-4 w-12 rounded-full shimmer" />
                  <div className="h-4 w-16 rounded-full shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-12 h-12 rounded-2xl shimmer" />
          <div className="h-3 w-40 rounded shimmer" />
        </div>
      </div>
    </div>
  );
}
