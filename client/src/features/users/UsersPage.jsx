import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Briefcase,
  CheckSquare,
  Crown,
  Info,
  KeyRound,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Store,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  Stethoscope,
} from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { errorMessage } from '../../api/client.js'
import { usersApi } from '../../api/users.api.js'
import { useAuth } from '../../hooks/useAuth.js'
import { formatDateTime } from '../../lib/format.js'
import { PERMISSIONS, ROLE_INFO } from '../../lib/permissions.js'
import TempPasswordDialog from './TempPasswordDialog.jsx'
import UserFormModal from './UserFormModal.jsx'

const ROLE_STYLE = {
  admin: { icon: Crown, className: 'bg-brand-100 text-brand-800' },
  manager: { icon: Briefcase, className: 'bg-violet-100 text-violet-700' },
  cashier: { icon: Store, className: 'bg-orange-100 text-orange-700' },
  pharmacist: { icon: Stethoscope, className: 'bg-sky-100 text-sky-700' },
}
const AVATARS = ['bg-teal-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600']
const avatarFor = (name) => AVATARS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATARS.length]
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const selectClass =
  'rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

function RoleBadge({ role }) {
  const { icon: Icon, className } = ROLE_STYLE[role]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${className}`}>
      <Icon size={15} /> {ROLE_INFO[role].label}
    </span>
  )
}

function RowMenu({ user, isSelf, onEdit, onReset, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const item = 'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-white'
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" aria-label={`Actions for ${user.fullName}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-ink hover:bg-slate-100">
        <MoreVertical size={20} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onEdit() }}>
            <Pencil size={16} /> Edit
          </button>
          <button type="button" role="menuitem" disabled={isSelf} title={isSelf ? 'Use Change password for your own account' : undefined} className={item} onClick={() => { setOpen(false); onReset() }}>
            <KeyRound size={16} /> Reset password
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={isSelf}
            title={isSelf ? 'You cannot deactivate yourself' : undefined}
            className={`${item} ${user.isActive && !isSelf ? 'text-red-600' : ''}`}
            onClick={() => { setOpen(false); onToggle() }}
          >
            {user.isActive ? <UserX size={16} /> : <UserCheck size={16} />} {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [panelRole, setPanelRole] = useState('manager')
  const [form, setForm] = useState(null) // { user } (user null = new)
  const [confirm, setConfirm] = useState(null) // { kind: 'deactivate'|'reactivate'|'reset', user }
  const [working, setWorking] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [tempInfo, setTempInfo] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true
    usersApi
      .list()
      .then((list) => {
        if (!active) return
        setUsers(list)
        setError('')
      })
      .catch((err) => active && setError(errorMessage(err, 'Could not load the users.')))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reloadKey])

  const shown = useMemo(() => {
    const text = search.trim().toLowerCase()
    return users.filter(
      (u) =>
        (!text || u.fullName.toLowerCase().includes(text) || u.email.toLowerCase().includes(text)) &&
        (!roleFilter || u.role === roleFilter) &&
        (!statusFilter || (statusFilter === 'active') === u.isActive),
    )
  }, [users, search, roleFilter, statusFilter])

  async function runConfirm() {
    setWorking(true)
    setConfirmError('')
    const { kind, user } = confirm
    try {
      if (kind === 'reset') {
        const res = await usersApi.resetPassword(user.id)
        setTempInfo({ kind: 'reset', name: user.fullName, email: user.email, password: res.temporaryPassword })
      } else {
        await usersApi.update(user.id, { fullName: user.fullName, email: user.email, role: user.role, isActive: kind === 'reactivate' })
      }
      setConfirm(null)
      reload()
    } catch (err) {
      setConfirmError(errorMessage(err, 'That did not work.'))
    } finally {
      setWorking(false)
    }
  }

  const confirmText = {
    deactivate: (u) => ({ title: 'Deactivate account?', label: 'Deactivate', tone: 'danger', message: `${u.fullName} will be signed out right away and cannot sign in until you reactivate the account. Their past sales stay on record.` }),
    reactivate: (u) => ({ title: 'Reactivate account?', label: 'Reactivate', tone: 'brand', message: `${u.fullName} will be able to sign in again with their current password.` }),
    reset: (u) => ({ title: 'Reset password?', label: 'Reset password', tone: 'danger', message: `${u.fullName} will be signed out everywhere and given a new temporary password that you will see once.` }),
  }
  const ct = confirm ? confirmText[confirm.kind](confirm.user) : null

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="mt-1 text-brand-600">
          <Users size={34} />
        </span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">User Management</h1>
          <p className="mt-1 text-slate-600">Manage staff accounts and permissions</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-[12rem] flex-1 items-center gap-3 rounded-xl border border-slate-300 px-4 py-2.5 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
              <Search size={20} className="text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." aria-label="Search users" className="w-full bg-transparent outline-none placeholder:text-slate-400" />
            </div>
            <select aria-label="Filter by role" className={selectClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {Object.entries(ROLE_INFO).map(([v, i]) => (
                <option key={v} value={v}>
                  {i.label}
                </option>
              ))}
            </select>
            <select aria-label="Filter by status" className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="button" onClick={() => setForm({ user: null })} className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-bold text-white shadow-sm hover:bg-brand-600">
              <Plus size={20} /> Add User
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <TriangleAlert size={18} /> {error}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="bg-slate-50 text-sm font-semibold text-slate-700">
                  <th className="rounded-l-xl px-4 py-3">Name</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last Login</th>
                  <th className="rounded-r-xl px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center">
                      <Loader2 className="mx-auto animate-spin text-brand-500" size={30} />
                    </td>
                  </tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center text-slate-500">
                      No users match your filters
                    </td>
                  </tr>
                ) : (
                  shown.map((u) => {
                    const isSelf = u.id === me.id
                    return (
                      <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50/60'}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${u.isActive ? avatarFor(u.fullName) : 'bg-slate-400'}`}>
                              {initials(u.fullName)}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-ink">
                                {u.fullName}
                                {isSelf && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-xs font-medium text-slate-600">You</span>}
                              </div>
                              <div className="truncate text-sm text-slate-500">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            <span className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {u.mustChangePassword && <div className="mt-1 text-xs text-amber-700">Has not set a password yet</div>}
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">{formatDateTime(u.lastLoginAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <RowMenu
                            user={u}
                            isSelf={isSelf}
                            onEdit={() => setForm({ user: u })}
                            onReset={() => { setConfirmError(''); setConfirm({ kind: 'reset', user: u }) }}
                            onToggle={() => { setConfirmError(''); setConfirm({ kind: u.isActive ? 'deactivate' : 'reactivate', user: u }) }}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            Showing {shown.length} of {users.length} {users.length === 1 ? 'user' : 'users'}
          </div>
        </section>

        {/* What each role may do */}
        <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 bg-brand-500 px-5 py-4 text-xl font-bold text-white">
            <ShieldCheck size={26} /> Role Permissions
          </div>
          <div className="space-y-4 p-5">
            <label className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">Selected Role:</span>
              <select aria-label="Role to show" className={`${selectClass} flex-1`} value={panelRole} onChange={(e) => setPanelRole(e.target.value)}>
                {Object.entries(ROLE_INFO).map(([v, i]) => (
                  <option key={v} value={v}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
              <Info size={18} className="mt-0.5 shrink-0" /> {ROLE_INFO[panelRole].description}
            </div>
            <ul className="space-y-2.5" data-testid="permission-list">
              {PERMISSIONS.map((p) => {
                const allowed = p.roles.includes(panelRole)
                return (
                  <li key={p.label} className={`flex items-start gap-3 ${allowed ? 'text-ink' : 'text-slate-400'}`}>
                    {allowed ? <CheckSquare size={20} className="mt-0.5 shrink-0 text-brand-600" /> : <Square size={20} className="mt-0.5 shrink-0" />}
                    <span>
                      {p.label}
                      {p.soon && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">Coming soon</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">Permissions follow the role and are enforced by the server. A role change applies the next time the person does anything.</p>
          </div>
        </aside>
      </div>

      {form && (
        <UserFormModal
          user={form.user}
          isSelf={form.user?.id === me.id}
          onClose={() => setForm(null)}
          onSaved={(temp) => {
            setForm(null)
            if (temp) setTempInfo(temp)
            reload()
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog title={ct.title} message={ct.message} confirmLabel={ct.label} tone={ct.tone} busy={working} error={confirmError} onConfirm={runConfirm} onCancel={() => setConfirm(null)} />
      )}
      {tempInfo && <TempPasswordDialog info={tempInfo} onClose={() => setTempInfo(null)} />}
    </div>
  )
}
