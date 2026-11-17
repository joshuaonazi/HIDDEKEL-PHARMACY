import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Bell, CalendarDays, KeyRound, LogOut, Menu, Search, X } from 'lucide-react'
import Logo from '../common/Logo.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { NAV_ITEMS, canAccess } from '../../lib/nav.js'

const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier' }

function initialsOf(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?'
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  // Computed once when the layout first appears
  const [today] = useState(() =>
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  )

  const items = NAV_ITEMS.filter((item) => canAccess(user, item.roles))

  const navigation = (
    <nav className="flex flex-1 flex-col gap-1 px-4 py-4">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition ${
              isActive ? 'bg-brand-500 text-white shadow-sm' : 'text-ink hover:bg-brand-50'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-surface">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-6 pb-2 pt-6">
          <Logo name={user.pharmacyName} />
        </div>
        {navigation}
        <div className="px-6 pb-5 text-xs text-slate-500">Hiddekel POS v1.0.0</div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between px-6 pb-2 pt-6">
              <Logo name={user.pharmacyName} />
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X size={22} />
              </button>
            </div>
            {navigation}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            className="rounded-lg p-2 text-ink hover:bg-brand-50 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>

          <div className="hidden max-w-xl flex-1 items-center gap-3 rounded-xl bg-slate-100 px-4 py-2.5 sm:flex">
            <Search size={18} className="text-slate-500" />
            <input
              disabled
              title="Search is coming soon"
              placeholder="Search products, invoices..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium md:flex">
              <CalendarDays size={18} className="text-brand-600" />
              {today}
            </div>
            <button type="button" aria-label="Notifications" className="rounded-lg p-2 text-ink hover:bg-brand-50">
              <Bell size={22} />
            </button>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3 sm:pl-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                {initialsOf(user.fullName)}
              </span>
              <div className="hidden leading-tight sm:block">
                <div className="text-sm font-semibold text-ink">{user.fullName}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[user.role] || user.role}</div>
              </div>
              <Link to="/account" aria-label="Change password" title="Change password" className="rounded-lg p-2 text-ink hover:bg-brand-50">
                <KeyRound size={20} />
              </Link>
              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-2 text-ink hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
