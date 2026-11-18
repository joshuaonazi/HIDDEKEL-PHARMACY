import { HttpError } from '../utils/httpError.js';

// Usage: router.get('/reports', requireAuth, requireRole('manager'), handler)
// Admin always passes. Roles: 'admin' | 'manager' | 'cashier' | 'pharmacist'
export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  if (req.user.role === 'admin' || allowed.includes(req.user.role)) return next();
  next(new HttpError(403, 'You do not have permission to do this'));
};
