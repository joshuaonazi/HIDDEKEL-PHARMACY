import {
  BarChart3,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Warehouse,
} from 'lucide-react'

// roles: who may open the screen besides the admin. Leave it out for "everyone signed in".
// Use an empty list for admin-only screens.
// The server enforces permissions too; this only controls what the menu shows.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sales', label: 'Point of Sale', icon: ShoppingCart },
  { to: '/sales-history', label: 'Sales History', icon: Receipt },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/categories', label: 'Categories', icon: LayoutGrid, roles: ['manager'] },
  { to: '/stock', label: 'Stock', icon: Warehouse, roles: ['manager'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['manager'] },
  { to: '/users', label: 'Users', icon: Users, roles: [] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: [] },
]

export const canAccess = (user, roles) =>
  !roles || user?.role === 'admin' || roles.includes(user?.role)