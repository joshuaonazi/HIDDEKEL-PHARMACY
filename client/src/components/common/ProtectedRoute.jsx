import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { canAccess } from '../../lib/nav.js'
import ChangePasswordPage from '../../features/account/ChangePasswordPage.jsx'
import Loader from './Loader.jsx'

// roles: extra roles allowed besides the admin (see lib/nav.js). Omit = any signed-in user.
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // A new or reset account must pick its own password before anything else
  if (user.mustChangePassword) return <ChangePasswordPage forced />
  if (!canAccess(user, roles)) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-ink">No access</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your account does not have permission to open this page. Ask your admin if you need it.
        </p>
      </div>
    )
  }
  return children
}
