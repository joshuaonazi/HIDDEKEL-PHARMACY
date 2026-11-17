import { Banknote, Pill, ShoppingCart, TrendingUp, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'

const CARDS = [
  { label: "Today's Sales", icon: ShoppingCart, tone: 'bg-brand-100 text-brand-600' },
  { label: "Today's Profit", icon: TrendingUp, tone: 'bg-brand-100 text-brand-600' },
  { label: 'Items Sold', icon: Pill, tone: 'bg-brand-100 text-brand-600' },
  { label: 'Low Stock', icon: TriangleAlert, tone: 'bg-red-100 text-red-500' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const firstName = user.fullName.split(/\s+/)[0]

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Dashboard</h1>
      <p className="mt-1 text-slate-600">Welcome back, {firstName}! Here's what's happening today.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(({ label, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full ${tone}`}>
              <Icon size={26} />
            </span>
            <div>
              <div className="text-sm font-medium text-ink/80">{label}</div>
              <div className="text-2xl font-extrabold text-ink">&mdash;</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
          <Banknote size={22} />
        </span>
        <div>
          <h2 className="font-bold text-ink">You are signed in</h2>
          <p className="mt-1 text-sm text-ink/80">
            {user.fullName} ({user.role}) at {user.pharmacyName}. The real figures will appear here once products and
            sales are in place, which are the next screens we build.
          </p>
        </div>
      </div>
    </div>
  )
}
