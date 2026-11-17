import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Marks a route as usable while a password change is still pending (/auth/me, /auth/change-password)
export const allowPasswordChange = (req, res, next) => {
  req.allowPasswordChange = true;
  next();
};

// Verifies the login token and loads the user fresh from the database,
// so deactivating a user or changing their role takes effect immediately.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Not authenticated');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired. Please sign in again.');
  }

  const { rows } = await query(
    `SELECT u.id, u.pharmacy_id, u.full_name, u.email, u.role, u.is_active, u.must_change_password, u.token_version,
            p.name AS pharmacy_name
       FROM users u JOIN pharmacies p ON p.id = u.pharmacy_id
      WHERE u.id = $1`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw new HttpError(401, 'Account not available');
  // A password change, reset or deactivation signs the person out everywhere
  if ((payload.v ?? 0) !== user.token_version) throw new HttpError(401, 'Session expired. Please sign in again.');

  if (user.must_change_password && !req.allowPasswordChange) {
    throw new HttpError(403, 'Please choose a new password before continuing', 'PASSWORD_CHANGE_REQUIRED');
  }

  req.user = {
    id: user.id,
    pharmacyId: user.pharmacy_id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    pharmacyName: user.pharmacy_name,
    mustChangePassword: user.must_change_password,
  };
  next();
});
