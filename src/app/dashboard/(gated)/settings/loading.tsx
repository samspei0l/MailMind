export default function SettingsLoading() {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8 space-y-2">
          <div className="h-7 w-32 rounded shimmer" />
          <div className="h-3 w-96 max-w-full rounded shimmer" />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-40 rounded shimmer" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 rounded shimmer" />
                <div className="h-3 w-52 rounded shimmer" />
              </div>
              <div className="h-8 w-20 rounded-lg shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
