import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { passwordProblem } from '../utils/passwordPolicy.js';
import { audit } from '../utils/audit.js';
import { HttpError } from '../utils/httpError.js';

// Hash of a random value, computed once, so a wrong email takes as long as a wrong password
const dummyHashPromise = hashPassword('not-a-real-password-' + Math.random());

const signToken = (user) => jwt.sign({ sub: user.id, v: user.token_version }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export async function login(req, res) {
  const { email, password } = req.body;

  const { rows } = await query(
    `SELECT u.id, u.pharmacy_id, u.full_name, u.email, u.role, u.is_active, u.password_hash,
            u.must_change_password, u.token_version, p.name AS pharmacy_name
       FROM users u JOIN pharmacies p ON p.id = u.pharmacy_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
  const user = rows[0];

  const ok = await verifyPassword(password, user ? user.password_hash : await dummyHashPromise);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password');
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated. Contact your admin.');

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      pharmacyId: user.pharmacy_id,
      pharmacyName: user.pharmacy_name,
      mustChangePassword: user.must_change_password,
    },
  });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: z.string().min(1, 'Enter a new password').max(200),
});

// Signed-in users change their own password. Everyone else's sessions for this account end.
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Your current password is not correct');
  }
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a password different from the current one');
  const problem = passwordProblem(newPassword, { email: req.user.email, name: req.user.fullName });
  if (problem) throw new HttpError(400, problem);

  const updated = await query(
    `UPDATE users SET password_hash = $1, must_change_password = false, token_version = token_version + 1
      WHERE id = $2 RETURNING id, token_version`,
    [await hashPassword(newPassword), req.user.id]
  );
  await audit({ query }, req, 'user.change_password', 'user', req.user.id);

  res.json({
    token: signToken(updated.rows[0]),
    user: { ...req.user, mustChangePassword: false },
  });
}
