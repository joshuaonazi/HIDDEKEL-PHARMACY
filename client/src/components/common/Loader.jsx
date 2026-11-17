export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3 text-ink/70">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  )
}
