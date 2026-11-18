import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { likePattern } from '../utils/like.js';
import { audit } from '../utils/audit.js';

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10000),
  directions: z.string().trim().min(1, 'Directions are required').max(500),
});

export const prescriptionSchema = z.object({
  customerName: z.string().trim().min(1, 'Customer name is required').max(150),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one drug').max(100),
});

export const cancellationSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

const isFullPrescriptionRole = (role) =>
  role === 'admin' || role === 'manager' || role === 'pharmacist';

async function fetchPrescription(db, pid, id) {
  const found = await db.query(
    `SELECT p.*, u.full_name AS pharmacist
       FROM prescriptions p JOIN users u ON u.id = p.pharmacist_id
      WHERE p.id = $1 AND p.pharmacy_id = $2`,
    [id, pid]
  );
  if (!found.rows[0]) return null;

  const items = await db.query(
    `SELECT pi.id, pi.product_id, pi.quantity, pi.directions,
            pr.name, pr.generic_name, pr.strength, pr.dosage_form
       FROM prescription_items pi JOIN products pr ON pr.id = pi.product_id
      WHERE pi.prescription_id = $1 AND pi.pharmacy_id = $2
      ORDER BY pi.created_at, pi.id`,
    [id, pid]
  );
  const r = found.rows[0];
  return {
    id: r.id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    status: r.status,
    pharmacist: r.pharmacist,
    sourcePrescriptionId: r.source_prescription_id,
    saleId: r.sale_id,
    dispensedAt: r.dispensed_at,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: items.rows.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name,
      genericName: i.generic_name,
      strength: i.strength,
      dosageForm: i.dosage_form,
      quantity: i.quantity,
      directions: i.directions,
    })),
  };
}

export async function listPrescriptions(req, res) {
  const pid = req.user.pharmacyId;
  const cashier = req.user.role === 'cashier';
  if (!isFullPrescriptionRole(req.user.role) && !cashier) {
    throw new HttpError(403, 'You do not have permission to view prescriptions');
  }

  const search = String(req.query.search || '').trim().slice(0, 100);
  const status = ['pending', 'dispensed', 'cancelled'].includes(req.query.status)
    ? req.query.status
    : (cashier ? 'pending' : null);
  const params = [pid];
  const where = ['p.pharmacy_id = $1'];

  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  if (search) {
    params.push(likePattern(search));
    const n = params.length;
    where.push(`(p.customer_name ILIKE $${n} ESCAPE '\\'
      OR p.customer_phone ILIKE $${n} ESCAPE '\\'
      OR u.full_name ILIKE $${n} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM prescription_items pi JOIN products pr ON pr.id = pi.product_id
        WHERE pi.prescription_id = p.id
          AND (pr.name ILIKE $${n} ESCAPE '\\' OR pr.generic_name ILIKE $${n} ESCAPE '\\')
      ))`);
  }

  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  params.push(pageSize, (page - 1) * pageSize);

  const { rows } = await query(
    `SELECT p.*, u.full_name AS pharmacist,
            COUNT(*) OVER() AS total_rows
       FROM prescriptions p JOIN users u ON u.id = p.pharmacist_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const list = [];
  for (const r of rows) {
    const full = await fetchPrescription({ query }, pid, r.id);
    list.push(cashier
      ? {
          id: full.id,
          customerName: full.customerName,
          status: full.status,
          items: full.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            strength: i.strength,
            dosageForm: i.dosageForm,
            quantity: i.quantity,
            directions: i.directions,
          })),
        }
      : full);
  }

  res.json({
    items: list,
    total: rows.length ? rows[0].total_rows : 0,
    page,
    pageSize,
  });
}

export async function getPrescription(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Prescription history is not available to this role');
  }
  const prescription = await fetchPrescription({ query }, req.user.pharmacyId, idParam(req));
  if (!prescription) throw new HttpError(404, 'Prescription not found');
  res.json({ prescription });
}

export async function getCustomerHistory(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Customer prescription history is not available to this role');
  }
  const name = String(req.query.name || '').trim().slice(0, 150);
  const phone = String(req.query.phone || '').trim().slice(0, 30);
  if (!name && !phone) throw new HttpError(400, 'A customer name or phone is required');

  const params = [req.user.pharmacyId];
  const where = ['p.pharmacy_id = $1'];
  if (name) {
    params.push(likePattern(name));
    where.push(`p.customer_name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (phone) {
    params.push(likePattern(phone));
    where.push(`p.customer_phone ILIKE $${params.length} ESCAPE '\\'`);
  }
  const { rows } = await query(
    `SELECT p.id FROM prescriptions p
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC`,
    params
  );
  const items = [];
  for (const row of rows) {
    items.push(await fetchPrescription({ query }, req.user.pharmacyId, row.id));
  }
  res.json({ prescriptions: items, total: items.length });
}

async function assertProducts(db, pid, items) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const { rows } = await db.query(
    `SELECT id FROM products WHERE pharmacy_id = $1 AND id = ANY($2::uuid[]) AND is_active`,
    [pid, ids]
  );
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more products are unavailable');
}

export async function createPrescription(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Only an admin, manager or pharmacist can create prescriptions');
  }
  const pid = req.user.pharmacyId;
  const prescription = await withTransaction(async (db) => {
    await assertProducts(db, pid, req.body.items);
    const created = await db.query(
      `INSERT INTO prescriptions (pharmacy_id, pharmacist_id, customer_name, customer_phone)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [pid, req.user.id, req.body.customerName, req.body.customerPhone || null]
    );
    const id = created.rows[0].id;
    for (const item of req.body.items) {
      await db.query(
        `INSERT INTO prescription_items (pharmacy_id, prescription_id, product_id, quantity, directions)
         VALUES ($1,$2,$3,$4,$5)`,
        [pid, id, item.productId, item.quantity, item.directions]
      );
    }
    await audit(db, req, 'prescription.create', 'prescription', id, {
      customerName: req.body.customerName,
      itemCount: req.body.items.length,
    });
    return fetchPrescription(db, pid, id);
  });
  res.status(201).json({ prescription });
}

export async function updatePrescription(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Only an admin, manager or pharmacist can edit prescriptions');
  }
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const prescription = await withTransaction(async (db) => {
    const found = await db.query(
      'SELECT status FROM prescriptions WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
      [id, pid]
    );
    if (!found.rows[0]) throw new HttpError(404, 'Prescription not found');
    if (found.rows[0].status !== 'pending') throw new HttpError(409, 'Only waiting prescriptions can be edited');
    await assertProducts(db, pid, req.body.items);
    await db.query(
      `UPDATE prescriptions SET customer_name = $1, customer_phone = $2, updated_at = now()
       WHERE id = $3 AND pharmacy_id = $4`,
      [req.body.customerName, req.body.customerPhone || null, id, pid]
    );
    await db.query('DELETE FROM prescription_items WHERE prescription_id = $1 AND pharmacy_id = $2', [id, pid]);
    for (const item of req.body.items) {
      await db.query(
        `INSERT INTO prescription_items (pharmacy_id, prescription_id, product_id, quantity, directions)
         VALUES ($1,$2,$3,$4,$5)`,
        [pid, id, item.productId, item.quantity, item.directions]
      );
    }
    await audit(db, req, 'prescription.update', 'prescription', id, {
      customerName: req.body.customerName,
      itemCount: req.body.items.length,
    });
    return fetchPrescription(db, pid, id);
  });
  res.json({ prescription });
}

export async function cancelPrescription(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Only an admin, manager or pharmacist can cancel prescriptions');
  }
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const prescription = await withTransaction(async (db) => {
    const found = await db.query(
      'SELECT status FROM prescriptions WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
      [id, pid]
    );
    if (!found.rows[0]) throw new HttpError(404, 'Prescription not found');
    if (found.rows[0].status !== 'pending') throw new HttpError(409, 'Only waiting prescriptions can be cancelled');
    await db.query(
      `UPDATE prescriptions SET status = 'cancelled', cancelled_by = $1, cancelled_at = now(),
              cancel_reason = $2, updated_at = now() WHERE id = $3 AND pharmacy_id = $4`,
      [req.user.id, req.body.reason, id, pid]
    );
    await audit(db, req, 'prescription.cancel', 'prescription', id, { reason: req.body.reason });
    return fetchPrescription(db, pid, id);
  });
  res.json({ prescription });
}

export async function repeatPrescription(req, res) {
  if (!isFullPrescriptionRole(req.user.role)) {
    throw new HttpError(403, 'Only an admin, manager or pharmacist can repeat prescriptions');
  }
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const prescription = await withTransaction(async (db) => {
    const source = await fetchPrescription(db, pid, id);
    if (!source) throw new HttpError(404, 'Prescription not found');
    const created = await db.query(
      `INSERT INTO prescriptions (pharmacy_id, pharmacist_id, customer_name, customer_phone, source_prescription_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [pid, req.user.id, source.customerName, source.customerPhone, source.id]
    );
    const newId = created.rows[0].id;
    for (const item of source.items) {
      await db.query(
        `INSERT INTO prescription_items (pharmacy_id, prescription_id, product_id, quantity, directions)
         VALUES ($1,$2,$3,$4,$5)`,
        [pid, newId, item.productId, item.quantity, item.directions]
      );
    }
    await audit(db, req, 'prescription.repeat', 'prescription', newId, { sourcePrescriptionId: source.id });
    return fetchPrescription(db, pid, newId);
  });
  res.json({ prescription });
}
