import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { audit } from '../utils/audit.js';
import { likePattern } from '../utils/like.js';
import { getPharmacy, getSaleReceipt } from '../services/receipt.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENTS = ['cash', 'pos', 'transfer', 'other', 'mixed'];

export const voidSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(200),
});

// The sales the person asked for. Cashiers only ever see their own.
export async function listSales(req, res) {
  const user = req.user;
  const pharmacy = await getPharmacy({ query }, user.pharmacyId);
  const sees = user.role === 'admin' || user.role === 'manager';

  const from = DATE.test(req.query.from || '') ? req.query.from : null;
  const to = DATE.test(req.query.to || '') ? req.query.to : null;
  const status = ['completed', 'voided'].includes(req.query.status) ? req.query.status : null;
  const payment = PAYMENTS.includes(req.query.payment) ? req.query.payment : null;
  const search = String(req.query.search || '').trim().slice(0, 40);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 15, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // Dates are days in the pharmacy's own time zone. Without dates, the list shows today.
  const params = [user.pharmacyId, pharmacy.timezone];
  const where = ['s.pharmacy_id = $1'];
  params.push(from);
  params.push(to);
  where.push(
    `(s.created_at AT TIME ZONE $2)::date BETWEEN COALESCE($3::date, (now() AT TIME ZONE $2)::date) AND COALESCE($4::date, $3::date, (now() AT TIME ZONE $2)::date)`
  );

  if (!sees) {
    params.push(user.id);
    where.push(`s.cashier_id = $${params.length}`);
  } else if (req.query.cashierId) {
    params.push(idParam({ params: { id: req.query.cashierId } }));
    where.push(`s.cashier_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }
  if (payment) {
    params.push(payment);
    where.push(`s.payment_method = $${params.length}`);
  }
  if (search) {
    params.push(likePattern(search));
    where.push(`s.receipt_no ILIKE $${params.length} ESCAPE '\\'`);
  }

  const filtered = `
    SELECT s.id, s.receipt_no, s.created_at, s.subtotal, s.discount, s.tax, s.total, s.payment_method,
           s.status, s.void_reason, u.full_name AS cashier,
           COALESCE(c.units, 0) AS units, COALESCE(c.cost, 0) AS cost
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      LEFT JOIN LATERAL (
        SELECT SUM(quantity) AS units, SUM(unit_cost * quantity) AS cost FROM sale_items WHERE sale_id = s.id
      ) c ON true
     WHERE ${where.join(' AND ')}`;

  const summaryRow = (
    await query(
      `WITH f AS (${filtered})
       SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0) AS completed_total,
              COUNT(*) FILTER (WHERE status = 'voided') AS voided_count,
              COALESCE(SUM(total) FILTER (WHERE status = 'voided'), 0) AS voided_total,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND payment_method = 'cash'), 0) AS cash,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND payment_method = 'pos'), 0) AS pos,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND payment_method = 'transfer'), 0) AS transfer,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND payment_method NOT IN ('cash','pos','transfer')), 0) AS other,
              COALESCE(SUM(subtotal - discount - cost) FILTER (WHERE status = 'completed'), 0) AS profit
         FROM f`,
      params
    )
  ).rows[0];

  const pageParams = [...params, pageSize, (page - 1) * pageSize];
  const { rows } = await query(
    `WITH f AS (${filtered})
     SELECT *, COUNT(*) OVER() AS total_rows FROM f
      ORDER BY created_at DESC, receipt_no DESC
      LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );

  const summary = {
    completedCount: summaryRow.completed_count,
    completedTotal: summaryRow.completed_total,
    voidedCount: summaryRow.voided_count,
    voidedTotal: summaryRow.voided_total,
    byPayment: { cash: summaryRow.cash, pos: summaryRow.pos, transfer: summaryRow.transfer, other: summaryRow.other },
  };
  if (sees) summary.profit = Math.round(summaryRow.profit * 100) / 100;

  // For the cashier filter on the screen
  const staff = sees
    ? (await query('SELECT id, full_name FROM users WHERE pharmacy_id = $1 ORDER BY lower(full_name)', [user.pharmacyId])).rows
    : [];

  res.json({
    timezone: pharmacy.timezone,
    cashiers: staff.map((u) => ({ id: u.id, name: u.full_name })),
    summary,
    total: rows.length ? rows[0].total_rows : 0,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receipt_no,
      createdAt: r.created_at,
      cashier: r.cashier,
      units: r.units,
      subtotal: r.subtotal,
      discount: r.discount,
      tax: r.tax,
      total: r.total,
      paymentMethod: r.payment_method,
      status: r.status,
      voidReason: r.void_reason,
    })),
  });
}

// Cancels a whole sale: the stock goes back on the shelf and the sale stops counting in the totals
export async function voidSale(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const { reason } = req.body;

  const sale = await withTransaction(async (db) => {
    // Same lock as checkout, so a void can never clash with a sale being rung up
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sale:${pid}`]);

    const found = await db.query(
      'SELECT receipt_no, status, total, prescription_id FROM sales WHERE id = $1 AND pharmacy_id = $2 FOR UPDATE',
      [id, pid]
    );
    const s = found.rows[0];
    if (!s) throw new HttpError(404, 'Sale not found');
    if (s.status !== 'completed') throw new HttpError(409, 'This sale has already been voided');

    const items = await db.query('SELECT batch_id, quantity FROM sale_items WHERE sale_id = $1', [id]);
    for (const item of items.rows) {
      await db.query('UPDATE batches SET qty_remaining = qty_remaining + $1 WHERE id = $2', [item.quantity, item.batch_id]);
    }
    await db.query(
      `UPDATE sales SET status = 'voided', void_reason = $1, voided_by = $2, voided_at = now() WHERE id = $3`,
      [reason, req.user.id, id]
    );
    if (s.prescription_id) {
      await db.query(
        `UPDATE prescriptions SET status = 'pending', sale_id = NULL, dispensed_by = NULL,
                dispensed_at = NULL, updated_at = now()
         WHERE id = $1 AND pharmacy_id = $2 AND status = 'dispensed'`,
        [s.prescription_id, pid]
      );
      await audit(db, req, 'prescription.reopened', 'prescription', s.prescription_id, {
        reason,
        voidedSaleId: id,
      });
    }
    await audit(db, req, 'sale.void', 'sale', id, {
      receiptNo: s.receipt_no,
      total: s.total,
      reason,
      unitsReturned: items.rows.reduce((sum, i) => sum + i.quantity, 0),
    });
    return getSaleReceipt(db, req.user, id);
  });

  res.json({ sale });
}