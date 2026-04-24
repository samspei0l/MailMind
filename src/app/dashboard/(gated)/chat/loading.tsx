export default function ChatLoading() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[9px] shimmer" />
          <div className="space-y-1.5">
            <div className="h-4 w-28 rounded shimmer" />
            <div className="h-3 w-48 rounded shimmer" />
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl w-full px-6 space-y-4">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="w-[72px] h-[72px] rounded-2xl shimmer" />
            <div className="h-6 w-64 rounded shimmer" />
            <div className="h-4 w-80 rounded shimmer" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl shimmer" />
            ))}
          </div>
        </div>
      </div>
      <div className="px-6 pb-5 pt-2 border-t border-border">
        <div className="max-w-4xl mx-auto h-12 rounded-2xl shimmer" />
      </div>
    </div>
  );
}
