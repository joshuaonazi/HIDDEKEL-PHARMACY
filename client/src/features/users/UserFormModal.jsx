import { useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import Modal from '../../components/ui/Modal.jsx'
import { errorMessage } from '../../api/client.js'
import { usersApi } from '../../api/users.api.js'
import { ROLE_INFO } from '../../lib/permissions.js'

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-500'

export default function UserFormModal({ user, isSelf, onClose, onSaved }) {
  const editing = Boolean(user)
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [role, setRole] = useState(user?.role || 'cashier')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (fullName.trim().length < 2) return setError('Enter the full name.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await usersApi.update(user.id, { fullName: fullName.trim(), email: email.trim(), role, isActive: user.isActive })
        onSaved(null)
      } else {
        const res = await usersApi.create({ fullName: fullName.trim(), email: email.trim(), role })
        onSaved({ kind: 'created', name: res.user.fullName, email: res.user.email, password: res.temporaryPassword })
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not save the account.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit user' : 'Add user'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold hover:bg-slate-50 disabled:opacity-60">
            Cancel
          </button>
          <button
            type="submit"
            form="user-form"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            {editing ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Full name</span>
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Email address</span>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          <span className="mt-1 block text-xs text-slate-500">This is their sign-in name. Any address works, even one only used for this system.</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Role</span>
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            {Object.entries(ROLE_INFO).map(([value, info]) => (
              <option key={value} value={value}>
                {info.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{isSelf ? 'You cannot change your own role.' : ROLE_INFO[role].description}</span>
        </label>
        {!editing && (
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
            A temporary password will be generated and shown to you once. The new user must replace it the first time they sign in.
          </p>
        )}
      </form>
    </Modal>
  )
}
