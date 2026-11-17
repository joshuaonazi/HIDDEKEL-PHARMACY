import { useState } from 'react'
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, Loader2, LogOut, TriangleAlert } from 'lucide-react'
import Logo from '../../components/common/Logo.jsx'
import { errorMessage } from '../../api/client.js'
import { useAuth } from '../../hooks/useAuth.js'

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} className={inputClass} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-ink"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </div>
  )
}

// forced = the person must pick a new password before using the app (new account or an admin reset)
export default function ChangePasswordPage({ forced = false }) {
  const { user, changePassword, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const nameBit = user.fullName.trim().split(/\s+/)[0].toLowerCase()
  const emailBit = user.email.split('@')[0].toLowerCase()
  const rules = [
    { ok: next.length >= 10, text: 'At least 10 characters' },
    { ok: /[A-Za-z]/.test(next) && /[0-9]/.test(next), text: 'Letters and numbers' },
    {
      ok: next.length > 0 && !(nameBit.length >= 4 && next.toLowerCase().includes(nameBit)) && !(emailBit.length >= 4 && next.toLowerCase().includes(emailBit)),
      text: 'Does not contain your name or email',
    },
    { ok: next.length > 0 && next === confirm, text: 'Both new passwords match' },
  ]
  const ready = current && rules.every((r) => r.ok) && !busy

  async function submit(event) {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await changePassword(current, next)
      setSaved(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password.'))
    } finally {
      setBusy(false)
    }
  }

  const card = (
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-ink/10">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <KeyRound size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{forced ? 'Choose your own password' : 'Change password'}</h1>
          <p className="text-sm text-slate-600">{forced ? `Welcome, ${user.fullName.split(/\s+/)[0]}. Replace the temporary password to continue.` : 'Pick a password only you know.'}</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <PasswordField id="current" label={forced ? 'Temporary password' : 'Current password'} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <PasswordField id="new" label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <PasswordField id="confirm" label="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>

      <ul className="mt-4 space-y-1 text-sm">
        {rules.map((r) => (
          <li key={r.text} className={`flex items-center gap-2 ${r.ok ? 'text-brand-700' : 'text-slate-500'}`}>
            {r.ok ? <CheckCircle2 size={16} /> : <Circle size={16} />} {r.text}
          </li>
        ))}
      </ul>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {saved && (
        <div role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
          <CheckCircle2 size={18} /> Password changed. Other devices have been signed out.
        </div>
      )}

      <button
        type="submit"
        disabled={!ready}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-lg font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 size={20} className="animate-spin" />}
        Save new password
      </button>
      {forced && (
        <button type="button" onClick={logout} className="mx-auto mt-4 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-ink">
          <LogOut size={16} /> Sign out
        </button>
      )}
    </form>
  )

  if (!forced) return <div className="flex justify-center py-6">{card}</div>
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#f6fafb] px-4 py-10">
      <Logo name={user.pharmacyName} />
      {card}
    </div>
  )
}
