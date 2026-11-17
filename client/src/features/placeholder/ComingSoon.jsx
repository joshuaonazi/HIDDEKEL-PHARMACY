import { Hammer } from 'lucide-react'

export default function ComingSoon({ title }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Hammer size={26} />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink">This screen is being built</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-600">It will appear here as we work through the build order.</p>
      </div>
    </div>
  )
}
