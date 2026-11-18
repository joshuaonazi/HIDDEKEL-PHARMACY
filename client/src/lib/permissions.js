// What each role can do. The server enforces the same rules; this list explains them on the Users screen.
export const ROLE_INFO = {
  admin: {
    label: 'Admin',
    description: 'Admins can do everything, including managing staff accounts, settings and the audit log.',
  },
  manager: {
    label: 'Manager',
    description: 'Managers look after products, stock and categories, see cost prices and reports, and can sell.',
  },
  cashier: {
    label: 'Cashier',
    description: 'Cashiers sell, apply discounts, print receipts and look up products. They never see cost prices or profit.',
  },
  pharmacist: {
    label: 'Pharmacist',
    description: 'Pharmacists create and manage prescriptions and look up product stock and selling prices.',
  },
}

const ALL = ['admin', 'manager', 'cashier', 'pharmacist']
const STAFF = ['admin', 'manager']

export const PERMISSIONS = [
  { label: 'Make sales and print receipts', roles: ALL },
  { label: 'Apply discounts', roles: ALL },
  { label: 'Look up products and stock', roles: ALL },
  { label: 'Create, edit, cancel and repeat prescriptions', roles: ['admin', 'manager', 'pharmacist'] },
  { label: 'Dispense waiting prescriptions', roles: ['admin', 'manager', 'cashier'] },
  { label: 'Add, edit and delete products', roles: STAFF },
  { label: 'Import products and stock from Excel', roles: STAFF },
  { label: 'Manage categories', roles: STAFF },
  { label: 'See cost prices', roles: STAFF },
  { label: 'View sales and profit reports', roles: STAFF, soon: true },
  { label: 'Void or refund sales', roles: STAFF, soon: true },
  { label: 'Manage staff accounts', roles: ['admin'] },
  { label: 'Change pharmacy settings', roles: ['admin'] },
  { label: 'View the audit log', roles: ['admin'], soon: true },
]
