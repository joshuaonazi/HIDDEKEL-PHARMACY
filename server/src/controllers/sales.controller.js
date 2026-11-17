import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { audit } from '../utils/audit.js';
import { fromKobo, toKobo } from '../utils/money.js';
import { receiptPrefix } from '../utils/receiptNo.js';
import { allocateCart, computeTotals, quoteLineOut } from '../services/sales.service.js';
import { getPharmacy, getSaleReceipt } from '../services/receipt.service.js';

const itemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10000),
});
const discountSchema = z
  .object({
    type: z.enum(['amount', 'percent']),
    value: z.number().min(0).max(100_000_000),
  })
  .nullable()
  .optional();

export const quoteSchema = z.object({
  items: z.array(itemSchema).min(1, 'The cart is empty').max(100),
  discount: discountSchema,
});

export const saleSchema = quoteSchema.extend({
  paymentMethod: z.enum(['cash', 'transfer', 'pos', 'other']),
  amountTendered: z.number().min(0).max(1_000_000_000).nullable().optional(),
  rxConfirmed: z.boolean().default(false),
  clientRef: z.string().uuid().optional(),
});

// The same product scanned twice becomes one line
function mergeItems(items) {
  const map = new Map();
  for (const i of items) map.set(i.productId, (map.get(i.productId) || 0) + i.quantity);
  return [...map].map(([productId, quantity]) => ({ productId, quantity }));
}

// Preview: exact prices and stock check for the cart, nothing is saved
export async function quote(req, res) {
  const pharmacy = await getPharmacy({ query }, req.user.pharmacyId);
  const { lines, problems } = await allocateCart({ query }, pharmacy, mergeItems(req.body.items), { lock: false });

  let totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };
  let discountError = null;
  try {
    totals = computeTotals(lines, req.body.discount, pharmacy.tax_rate);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    discountError = err.message;
    totals = computeTotals(lines, null, pharmacy.tax_rate);
  }

  res.json({
    lines: lines.map(quoteLineOut),
    problems,
    discountError,
    needsRx: lines.some((l) => l.requiresPrescription),
    taxRate: pharmacy.tax_rate,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
  });
}

export async function createSale(req, res) {
  const pid = req.user.pharmacyId;
  const { discount, paymentMethod, amountTendered, rxConfirmed, clientRef } = req.body;

  const receipt = await withTransaction(async (db) => {
    // One sale at a time per pharmacy: keeps receipt numbers in order and stock counts exact
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sale:${pid}`]);

    // A double-click or retry sends the same clientRef: return the sale already saved
    if (clientRef) {
      const existing = await db.query('SELECT id FROM sales WHERE pharmacy_id = $1 AND client_ref = $2', [pid, clientRef]);
      if (existing.rowCount) {
        const r = await getSaleReceipt(db, req.user, existing.rows[0].id);
        return { ...r, duplicate: true };
      }
    }

    const pharmacy = await getPharmacy(db, pid);
    const { lines, problems } = await allocateCart(db, pharmacy, mergeItems(req.body.items), { lock: true });
    if (problems.length) throw new HttpError(409, problems[0].message);

    if (lines.some((l) => l.requiresPrescription) && !rxConfirmed) {
      throw new HttpError(400, 'Confirm the prescription before selling prescription-only items');
    }

    const totals = computeTotals(lines, discount, pharmacy.tax_rate);
    if (paymentMethod === 'cash' && amountTendered != null && toKobo(amountTendered) < totals.totalKobo) {
      throw new HttpError(400, 'The amount received is less than the total');
    }

    const seq = await db.query(
      `SELECT COUNT(*) + 1 AS n, to_char(now() AT TIME ZONE $2, 'YYYYMMDD') AS d
         FROM sales
        WHERE pharmacy_id = $1 AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [pid, pharmacy.timezone]
    );
    const receiptNo = `${receiptPrefix(pharmacy.name)}-${seq.rows[0].d}-${String(seq.rows[0].n).padStart(4, '0')}`;

    const sale = await db.query(
      `INSERT INTO sales (pharmacy_id, receipt_no, cashier_id, subtotal, discount, tax, total, payment_method,
                          amount_tendered, rx_confirmed, client_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [pid, receiptNo, req.user.id, totals.subtotal, totals.discount, totals.tax, totals.total, paymentMethod,
        paymentMethod === 'cash' ? (amountTendered ?? totals.total) : null, rxConfirmed, clientRef || null]
    );
    const saleId = sale.rows[0].id;

    for (const line of lines) {
      for (const seg of line.segments) {
        await db.query(
          `INSERT INTO sale_items (sale_id, product_id, batch_id, quantity, unit_cost, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [saleId, line.productId, seg.batchId, seg.quantity, fromKobo(seg.unitCostKobo), fromKobo(seg.unitPriceKobo),
            fromKobo(seg.quantity * seg.unitPriceKobo)]
        );
        await db.query('UPDATE batches SET qty_remaining = qty_remaining - $1 WHERE id = $2', [seg.quantity, seg.batchId]);
      }
    }

    await audit(db, req, 'sale.create', 'sale', saleId, {
      receiptNo,
      total: totals.total,
      lines: lines.length,
      paymentMethod,
      rxConfirmed,
    });
    if (totals.discount > 0) {
      await audit(db, req, 'sale.discount', 'sale', saleId, { receiptNo, discount: totals.discount, requested: discount });
    }
    return getSaleReceipt(db, req.user, saleId);
  });

  res.status(receipt.duplicate ? 200 : 201).json({ sale: receipt });
}

export async function getSale(req, res) {
  const receipt = await getSaleReceipt({ query }, req.user, idParam(req));
  if (!receipt) throw new HttpError(404, 'Sale not found');
  res.json({ sale: receipt });
}
