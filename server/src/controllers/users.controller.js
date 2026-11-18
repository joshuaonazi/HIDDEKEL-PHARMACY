import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { audit } from '../utils/audit.js';
import { hashPassword } from '../utils/password.js';
import { generateTempPassword } from '../utils/passwordPolicy.js';

const ROLES = ['admin', 'manager', 'cashier', 'pharmacist'];

const fullName = z.string().trim().min(2, 'Enter the full name').max(100);
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);

export const createUserSchema = z.object({ fullName, email, role: z.enum(ROLES, { message: 'Choose a role' }) });
export const updateUserSchema = z.object({
  fullName,
  email,
  role: z.enum(ROLES, { message: 'Choose a role' }),
  isActive: z.boolean(),
});

const userOut = (r) => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  role: r.role,
  isActive: r.is_active,
  mustChangePassword: r.must_change_password,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
});

const COLUMNS = 'id, full_name, email, role, is_active, must_change_password, last_login_at, created_at';

export async function listUsers(req, res) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM users WHERE pharmacy_id = $1
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'pharmacist' THEN 2 ELSE 3 END, lower(full_name)`,
    [req.user.pharmacyId]
  );
  res.json({ users: rows.map(userOut) });
}

async function assertEmailFree(db, address, exceptId = null) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM users WHERE lower(email) = lower($1) AND ($2::uuid IS NULL OR id <> $2)',
    [address, exceptId]
  );
  if (rowCount) throw new HttpError(409, 'Another account already uses that email address');
}

// The new person gets a one-time temporary password that they must replace at first login
export async function createUser(req, res) {
  const { fullName: name, email: address, role } = req.body;
  const temporaryPassword = generateTempPassword();
  const hash = await hashPassword(temporaryPassword);

  const user = await withTransaction(async (db) => {
    await assertEmailFree(db, address);
    const { rows } = await db.query(
      `INSERT INTO users (pharmacy_id, full_name, email, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,$5,true) RETURNING ${COLUMNS}`,
      [req.user.pharmacyId, name, address, hash, role]
    );
    await audit(db, req, 'user.create', 'user', rows[0].id, { email: address, role });
    return rows[0];
  });

  res.status(201).json({ user: userOut(user), temporaryPassword });
}

export async function updateUser(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const input = req.body;

  const updated = await withTransaction(async (db) => {
    const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE`, [id, pid]);
    const target = rows[0];
    if (!target) throw new HttpError(404, 'User not found');

    if (id === req.user.id) {
      if (input.role !== target.role) throw new HttpError(400, 'You cannot change your own role');
      if (!input.isActive) throw new HttpError(400, 'You cannot deactivate your own account');
    }
    if (target.role === 'admin' && target.is_active && (input.role !== 'admin' || !input.isActive)) {
      const others = await db.query(
        `SELECT COUNT(*) AS n FROM users WHERE pharmacy_id = $1 AND role = 'admin' AND is_active AND id <> $2`,
        [pid, id]
      );
      if (others.rows[0].n === 0) throw new HttpError(400, 'There must be at least one active admin');
    }
    if (input.email.toLowerCase() !== target.email.toLowerCase()) await assertEmailFree(db, input.email, id);

    const deactivating = target.is_active && !input.isActive;
    const result = await db.query(
      `UPDATE users SET full_name = $1, email = $2, role = $3, is_active = $4,
              token_version = token_version + $5
        WHERE id = $6 AND pharmacy_id = $7 RETURNING ${COLUMNS}`,
      [input.fullName, input.email, input.role, input.isActive, deactivating ? 1 : 0, id, pid]
    );

    const changes = {};
    if (target.full_name !== input.fullName) changes.name = [target.full_name, input.fullName];
    if (target.email !== input.email) changes.email = [target.email, input.email];
    if (target.role !== input.role) changes.role = [target.role, input.role];
    if (target.is_active !== input.isActive) changes.active = [target.is_active, input.isActive];
    if (Object.keys(changes).length) await audit(db, req, 'user.update', 'user', id, changes);
    return result.rows[0];
  });

  res.json({ user: userOut(updated) });
}

export async function resetPassword(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  if (id === req.user.id) throw new HttpError(400, 'Use "Change password" for your own account');

  const temporaryPassword = generateTempPassword();
  const hash = await hashPassword(temporaryPassword);

  const { rows } = await query(
    `UPDATE users SET password_hash = $1, must_change_password = true, token_version = token_version + 1
      WHERE id = $2 AND pharmacy_id = $3 RETURNING email`,
    [hash, id, pid]
  );
  if (!rows.length) throw new HttpError(404, 'User not found');
  await audit({ query }, req, 'user.reset_password', 'user', id, { email: rows[0].email });
  res.json({ temporaryPassword });
}
