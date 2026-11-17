import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Package,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react'
import Logo from '../../components/common/Logo.jsx'
import { errorMessage } from '../../api/client.js'
import { useAuth } from '../../hooks/useAuth.js'
import { DEFAULT_PHARMACY_NAME } from '../../lib/brand.js'

const FEATURES = [
  { icon: ShoppingCart, label: 'Easy Sales Management' },
  { icon: Package, label: 'Real-time Stock Control' },
  { icon: BarChart3, label: 'Business Insights' },
]

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const destination = location.state?.from || '/'
  if (user) return <Navigate to={destination} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      await login(email.trim(), password, remember)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in. Please try again.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6fafb]">
      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-100/70" />
      <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-brand-500 sm:-right-24 sm:-top-24 sm:h-64 sm:w-64 lg:-right-32 lg:-top-32 lg:h-96 lg:w-96" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 h-96 w-[70%] rounded-[50%] bg-brand-100/80" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-2">
        <section>
          <Logo name={DEFAULT_PHARMACY_NAME} size="lg" />
          <h1 className="mt-10 text-5xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Sell smarter.
            <br />
            <span className="text-brand-500">Stock safer.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-ink/80">
            A modern pharmacy management solution for your business.
          </p>
          <ul className="mt-8 grid max-w-md grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                  <Icon size={26} />
                </span>
                <span className="text-sm font-medium leading-tight text-ink/80">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full max-w-lg justify-self-center lg:justify-self-end">
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-3xl bg-white p-8 shadow-xl shadow-ink/10 sm:p-10"
          >
            <h2 className="text-4xl font-extrabold tracking-tight text-ink">Welcome Back!</h2>
            <p className="mt-2 text-ink/70">Sign in to your {DEFAULT_PHARMACY_NAME} account</p>

            {error && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div
                role="status"
                className="mt-6 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800"
              >
                <Info size={18} className="mt-0.5 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
                  <Mail size={22} className="text-ink" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-transparent text-base text-ink outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
                  <Lock size={22} className="text-ink" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-transparent text-base text-ink outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="text-ink/70 hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-ink">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-5 w-5 rounded accent-brand-500"
                />
                Remember Me
              </label>
              <button
                type="button"
                onClick={() => {
                  setError('')
                  setNotice('Passwords are reset by your admin. Please contact them.')
                }}
                className="font-semibold text-brand-600 hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-4 text-lg font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 size={22} className="animate-spin" /> : <LogIn size={22} />}
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="my-6 flex items-center gap-4 text-sm text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <p className="text-center text-sm text-ink/80">
              Need an account? <span className="font-semibold text-brand-600">Contact Admin</span>
            </p>
          </form>
        </section>
      </div>
    </div>
  )
}
