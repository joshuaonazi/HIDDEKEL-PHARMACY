import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/common/ProtectedRoute.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoginPage from './features/auth/LoginPage.jsx'
import DashboardPage from './features/dashboard/DashboardPage.jsx'
import CategoriesPage from './features/categories/CategoriesPage.jsx'
import ProductsPage from './features/products/ProductsPage.jsx'
import ChangePasswordPage from './features/account/ChangePasswordPage.jsx'
import SalesHistoryPage from './features/sales/SalesHistoryPage.jsx'
import SalesPage from './features/sales/SalesPage.jsx'
import UsersPage from './features/users/UsersPage.jsx'
import SettingsPage from './features/settings/SettingsPage.jsx'
import ComingSoon from './features/placeholder/ComingSoon.jsx'
import { NAV_ITEMS } from './lib/nav.js'

// Screens built so far; everything else shows the placeholder
const SCREENS = {
  '/products': <ProductsPage />,
  '/categories': <CategoriesPage />,
  '/sales': <SalesPage />,
  '/sales-history': <SalesHistoryPage />,
  '/settings': <SettingsPage />,
  '/users': <UsersPage />,
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="account" element={<ChangePasswordPage />} />
        {/* Every other screen is a placeholder until we build it. Access follows the roles in lib/nav.js */}
        {NAV_ITEMS.filter((item) => item.to !== '/').map((item) => (
          <Route
            key={item.to}
            path={item.to.slice(1)}
            element={
              <ProtectedRoute roles={item.roles}>
                {SCREENS[item.to] || <ComingSoon title={item.label} />}
              </ProtectedRoute>
            }
          />
        ))}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}