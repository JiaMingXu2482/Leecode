// Shown instantly while a page's server data loads, so clicking navigation
// gives immediate feedback instead of a dead pause.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-fg-subtle">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-transparent" />
        <span className="text-sm">加载中…</span>
      </div>
    </div>
  );
}
