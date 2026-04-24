export default function HistoryLoading() {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="h-6 w-32 rounded shimmer mb-2" />
          <div className="h-3 w-80 rounded shimmer" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded shimmer" />
                <div className="h-3 w-1/2 rounded shimmer" />
              </div>
              <div className="h-3 w-16 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
