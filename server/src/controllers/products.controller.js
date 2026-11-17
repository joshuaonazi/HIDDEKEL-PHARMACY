import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { likePattern } from '../utils/like.js';
import { audit } from '../utils/audit.js';
import { batchOut, productListOut, stockStatus } from '../utils/serializers.js';

/* ---------- validation ---------- */

const optText = (max) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const money = z.coerce.number().min(0, 'Cannot be negative').max(100_000_000);

const batchSchema = z.object({
  id: z.string().uuid().optional(),
  batchNo: optText(60),
  expiryDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
  quantity: z.coerce.number().int().min(0).max(10_000_000).optional().default(0), // used for NEW batches only
  costPrice: money,
  sellingPrice: money,
});

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  genericName: optText(150),
  strength: optText(60),
  dosageForm: optText(60),
  manufacturer: optText(150),
  regNumber: optText(60),
  itemType: z.enum(['drug', 'general']).default('drug'),
  categoryId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
  requiresPrescription: z.boolean().default(false),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0),
  barcodes: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
  batches: z.array(batchSchema).max(50).default([]),
});

/* ---------- shared helpers ---------- */

function cleanProduct(input) {
  const isGeneral = input.itemType === 'general';
  return {
    ...input,
    // General store items have no strength, form or prescription flag
    strength: isGeneral ? null : input.strength,
    dosageForm: isGeneral ? null : input.dosageForm,
    requiresPrescription: isGeneral ? false : input.requiresPrescription,
    barcodes: [...new Set(input.barcodes)],
  };
}

async function assertCategory(db, pid, categoryId) {
  if (!categoryId) return;
  const { rowCount } = await db.query('SELECT 1 FROM categories WHERE id = $1 AND pharmacy_id = $2', [categoryId, pid]);
  if (!rowCount) throw new HttpError(400, 'Category not found');
}

async function assertBarcodesFree(db, pid, barcodes, exceptProductId = null) {
  if (!barcodes.length) return;
  const { rows } = await db.query(
    `SELECT b.barcode, p.name
       FROM product_barcodes b JOIN products p ON p.id = b.product_id
      WHERE b.pharmacy_id = $1 AND b.barcode = ANY($2::text[])
        AND ($3::uuid IS NULL OR b.product_id <> $3)`,
    [pid, barcodes, exceptProductId]
  );
  if (rows.length) {
    const first = rows[0];
    throw new HttpError(409, `Barcode ${first.barcode} already belongs to "${first.name}"`);
  }
}

async function fetchProduct(db, user, id) {
  const { rows } = await db.query(
    `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.pharmacy_id = $2 AND p.is_active`,
    [id, user.pharmacyId]
  );
  const p = rows[0];
  if (!p) return null;
  const barcodes = await db.query('SELECT barcode FROM product_barcodes WHERE product_id = $1 ORDER BY barcode', [id]);
  const batches = await db.query(
    `SELECT id, batch_no, expiry_date, qty_received, qty_remaining, cost_price, selling_price
       FROM batches WHERE product_id = $1 AND pharmacy_id = $2
      ORDER BY expiry_date NULLS LAST, created_at`,
    [id, user.pharmacyId]
  );
  const stock = batches.rows.reduce((sum, b) => sum + b.qty_remaining, 0);
  return {
    id: p.id,
    name: p.name,
    genericName: p.generic_name,
    strength: p.strength,
    dosageForm: p.dosage_form,
    manufacturer: p.manufacturer,
    regNumber: p.reg_number,
    itemType: p.item_type,
    requiresPrescription: p.requires_prescription,
    reorderLevel: p.reorder_level,
    category: p.category_id ? { id: p.category_id, name: p.category_name } : null,
    barcodes: barcodes.rows.map((r) => r.barcode),
    stock,
    status: stockStatus(stock, p.reorder_level),
    batches: batches.rows.map((b) => batchOut(b, user)),
  };
}

/* ---------- handlers ---------- */

export async function listProducts(req, res) {
  const pid = req.user.pharmacyId;
  const search = String(req.query.search || '').trim().slice(0, 100);
  const categoryId = req.query.categoryId ? idParam({ params: { id: req.query.categoryId } }) : null;
  const status = ['in', 'low', 'out'].includes(req.query.status) ? req.query.status : null;
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const params = [pid];
  const where = ['p.pharmacy_id = $1', 'p.is_active'];
  if (categoryId) {
    params.push(categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (search) {
    params.push(likePattern(search));
    const n = params.length;
    where.push(
      `(p.name ILIKE $${n} ESCAPE '\\' OR p.generic_name ILIKE $${n} ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.product_id = p.id AND pb.barcode ILIKE $${n} ESCAPE '\\'))`
    );
  }

  const statusFilter =
    status === 'out'
      ? 'WHERE stock = 0'
      : status === 'low'
        ? 'WHERE stock > 0 AND reorder_level > 0 AND stock <= reorder_level'
        : status === 'in'
          ? 'WHERE stock > 0 AND (reorder_level = 0 OR stock > reorder_level)'
          : '';

  params.push(pageSize, (page - 1) * pageSize);
  const limitIdx = params.length - 1;

  const { rows } = await query(
    `WITH base AS (
       SELECT p.id, p.name, p.generic_name, p.strength, p.dosage_form, p.item_type,
              p.requires_prescription, p.reorder_level,
              c.id AS category_id, c.name AS category_name,
              COALESCE(s.stock, 0) AS stock, COALESCE(s.sellable, 0) AS sellable, s.nearest_expiry, price.selling_price,
              COALESCE((SELECT array_agg(pb.barcode ORDER BY pb.barcode)
                          FROM product_barcodes pb WHERE pb.product_id = p.id), '{}') AS barcodes
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT SUM(qty_remaining) AS stock,
                  SUM(qty_remaining) FILTER (WHERE expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AS sellable,
                  MIN(expiry_date) FILTER (WHERE qty_remaining > 0) AS nearest_expiry
             FROM batches WHERE product_id = p.id
         ) s ON true
         LEFT JOIN LATERAL (
           SELECT selling_price FROM batches WHERE product_id = p.id
            ORDER BY (qty_remaining > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)) DESC,
                     CASE WHEN qty_remaining > 0 AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
                          THEN expiry_date END NULLS LAST,
                     created_at DESC
            LIMIT 1
         ) price ON true
        WHERE ${where.join(' AND ')}
     )
     SELECT *, COUNT(*) OVER() AS total
       FROM base ${statusFilter}
      ORDER BY lower(name), strength
      LIMIT $${limitIdx} OFFSET $${limitIdx + 1}`,
    params
  );

  res.json({
    items: rows.map(productListOut),
    total: rows.length ? rows[0].total : 0,
    page,
    pageSize,
  });
}

export async function getProduct(req, res) {
  const product = await fetchProduct({ query }, req.user, idParam(req));
  if (!product) throw new HttpError(404, 'Product not found');
  res.json({ product });
}

// Used by the sales screen: scan a code, get the product and the batch to sell from (earliest expiry first)
export async function getByBarcode(req, res) {
  const code = String(req.params.code || '').trim();
  if (!code || code.length > 64) throw new HttpError(400, 'Invalid barcode');
  const pid = req.user.pharmacyId;

  const found = await query(
    `SELECT p.id FROM product_barcodes pb JOIN products p ON p.id = pb.product_id
      WHERE pb.pharmacy_id = $1 AND pb.barcode = $2 AND p.is_active`,
    [pid, code]
  );
  if (!found.rowCount) throw new HttpError(404, 'No product with that barcode');

  const product = await fetchProduct({ query }, req.user, found.rows[0].id);
  const sellable = product.batches
    .filter((b) => b.qtyRemaining > 0)
    .sort((a, b) => (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31'));
  const today = new Date().toISOString().slice(0, 10);
  const fresh = sellable.filter((b) => !b.expiryDate || b.expiryDate >= today);
  res.json({
    product,
    sellBatch: fresh[0] || null,
    sellableStock: fresh.reduce((sum, b) => sum + b.qtyRemaining, 0),
    hasExpiredStock: sellable.length > fresh.length,
  });
}

async function writeBatches(db, req, productId, batches, isNew) {
  const pid = req.user.pharmacyId;
  for (const b of batches) {
    if (b.id) {
      const old = await db.query(
        'SELECT batch_no, expiry_date, cost_price, selling_price FROM batches WHERE id = $1 AND product_id = $2 AND pharmacy_id = $3',
        [b.id, productId, pid]
      );
      if (!old.rowCount) throw new HttpError(400, 'A batch does not belong to this product');
      // Quantity is not editable here; stock changes go through stock-in or stock adjustments
      await db.query(
        `UPDATE batches SET batch_no = $1, expiry_date = $2, cost_price = $3, selling_price = $4
          WHERE id = $5 AND product_id = $6 AND pharmacy_id = $7`,
        [b.batchNo, b.expiryDate, b.costPrice, b.sellingPrice, b.id, productId, pid]
      );
      const o = old.rows[0];
      if (o.cost_price !== b.costPrice || o.selling_price !== b.sellingPrice) {
        await audit(db, req, 'batch.price_change', 'batch', b.id, {
          cost: [o.cost_price, b.costPrice],
          selling: [o.selling_price, b.sellingPrice],
        });
      }
    } else {
      const ins = await db.query(
        `INSERT INTO batches (pharmacy_id, product_id, batch_no, expiry_date, qty_received, qty_remaining, cost_price, selling_price)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7) RETURNING id`,
        [pid, productId, b.batchNo, b.expiryDate, b.quantity, b.costPrice, b.sellingPrice]
      );
      await audit(db, req, isNew ? 'batch.opening_stock' : 'batch.create', 'batch', ins.rows[0].id, {
        quantity: b.quantity,
        cost: b.costPrice,
        selling: b.sellingPrice,
      });
    }
  }
}

export async function createProduct(req, res) {
  const pid = req.user.pharmacyId;
  const input = cleanProduct(req.body);

  const product = await withTransaction(async (db) => {
    await assertCategory(db, pid, input.categoryId);
    await assertBarcodesFree(db, pid, input.barcodes);

    const ins = await db.query(
      `INSERT INTO products (pharmacy_id, category_id, item_type, name, generic_name, strength, dosage_form,
                             manufacturer, reg_number, requires_prescription, reorder_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [pid, input.categoryId, input.itemType, input.name, input.genericName, input.strength, input.dosageForm,
        input.manufacturer, input.regNumber, input.requiresPrescription, input.reorderLevel]
    );
    const id = ins.rows[0].id;
    for (const code of input.barcodes) {
      await db.query('INSERT INTO product_barcodes (pharmacy_id, product_id, barcode) VALUES ($1,$2,$3)', [pid, id, code]);
    }
    await writeBatches(db, req, id, input.batches, true);
    await audit(db, req, 'product.create', 'product', id, { name: input.name });
    return fetchProduct(db, req.user, id);
  });
  res.status(201).json({ product });
}

export async function updateProduct(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const input = cleanProduct(req.body);

  const product = await withTransaction(async (db) => {
    const exists = await db.query('SELECT 1 FROM products WHERE id = $1 AND pharmacy_id = $2 AND is_active', [id, pid]);
    if (!exists.rowCount) throw new HttpError(404, 'Product not found');
    await assertCategory(db, pid, input.categoryId);
    await assertBarcodesFree(db, pid, input.barcodes, id);

    await db.query(
      `UPDATE products SET category_id=$1, item_type=$2, name=$3, generic_name=$4, strength=$5, dosage_form=$6,
              manufacturer=$7, reg_number=$8, requires_prescription=$9, reorder_level=$10
        WHERE id=$11 AND pharmacy_id=$12`,
      [input.categoryId, input.itemType, input.name, input.genericName, input.strength, input.dosageForm,
        input.manufacturer, input.regNumber, input.requiresPrescription, input.reorderLevel, id, pid]
    );
    await db.query('DELETE FROM product_barcodes WHERE product_id = $1 AND barcode <> ALL($2::text[])', [id, input.barcodes]);
    for (const code of input.barcodes) {
      await db.query(
        `INSERT INTO product_barcodes (pharmacy_id, product_id, barcode) VALUES ($1,$2,$3)
         ON CONFLICT (pharmacy_id, barcode) DO NOTHING`,
        [pid, id, code]
      );
    }
    await writeBatches(db, req, id, input.batches, false);
    await audit(db, req, 'product.update', 'product', id, { name: input.name });
    return fetchProduct(db, req.user, id);
  });
  res.json({ product });
}

// Soft delete: the product disappears from lists and scanning, but past sales keep their history
export async function deleteProduct(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      'UPDATE products SET is_active = false WHERE id = $1 AND pharmacy_id = $2 AND is_active RETURNING name',
      [id, pid]
    );
    if (!rows.length) throw new HttpError(404, 'Product not found');
    await db.query('DELETE FROM product_barcodes WHERE product_id = $1', [id]); // frees the codes for reuse
    await audit(db, req, 'product.delete', 'product', id, { name: rows[0].name });
  });
  res.json({ ok: true });
}
