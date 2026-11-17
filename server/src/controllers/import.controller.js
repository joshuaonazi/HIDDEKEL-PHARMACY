import { z } from 'zod';
import { withTransaction } from '../config/db.js';
import { audit } from '../utils/audit.js';
import { HttpError } from '../utils/httpError.js';

const MAX_ROWS = 2000;

const text = (max) => z.string().trim().max(max).optional().default('');
const num = z
  .string()
  .trim()
  .optional()
  .default('')
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), 'Must be a number, 0 or more');

const rowSchema = z.object({
  row: z.coerce.number().int().min(1),
  name: z.string().trim().min(1, 'Name is missing').max(150),
  genericName: text(150),
  strength: text(60),
  dosageForm: text(60),
  category: text(60),
  barcode: text(64),
  itemType: text(20),
  prescriptionOnly: text(20),
  reorderLevel: num,
  batchNo: text(60),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expiry date not understood (use DD/MM/YYYY)'),
  quantity: num,
  costPrice: num,
  sellingPrice: num,
});

const YES = new Set(['yes', 'y', 'true', '1', 'rx']);

// Reads rows the browser parsed from the Excel/CSV file. Valid rows are created; the rest are reported.
export async function importProducts(req, res) {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Too many rows. Import up to ${MAX_ROWS} at a time.`);

  const pid = req.user.pharmacyId;
  const errors = [];
  const skipped = [];
  const valid = [];

  rows.forEach((raw, i) => {
    const parsed = rowSchema.safeParse({ ...raw, row: raw?.row ?? i + 2 });
    if (!parsed.success) {
      errors.push({ row: Number(raw?.row) || i + 2, message: parsed.error.issues.map((x) => x.message).join('; ') });
      return;
    }
    const r = parsed.data;
    const hasPrice = r.costPrice !== null || r.sellingPrice !== null;
    if ((r.quantity || hasPrice) && (r.costPrice === null || r.sellingPrice === null)) {
      errors.push({ row: r.row, message: 'Stock needs both a cost price and a selling price' });
      return;
    }
    valid.push(r);
  });

  const result = await withTransaction(async (db) => {
    let created = 0;

    // Existing data, to avoid duplicates
    const existingCodes = new Set(
      (await db.query('SELECT barcode FROM product_barcodes WHERE pharmacy_id = $1', [pid])).rows.map((r) => r.barcode)
    );
    const existingKeys = new Set(
      (
        await db.query(
          `SELECT lower(name) || '|' || lower(COALESCE(strength,'')) || '|' || lower(COALESCE(dosage_form,'')) AS k
             FROM products WHERE pharmacy_id = $1 AND is_active`,
          [pid]
        )
      ).rows.map((r) => r.k)
    );
    const categoryIds = new Map(
      (await db.query('SELECT id, lower(name) AS n FROM categories WHERE pharmacy_id = $1 AND parent_id IS NULL', [pid])).rows.map(
        (r) => [r.n, r.id]
      )
    );

    for (const r of valid) {
      const key = `${r.name.toLowerCase()}|${r.strength.toLowerCase()}|${r.dosageForm.toLowerCase()}`;
      if ((r.barcode && existingCodes.has(r.barcode)) || existingKeys.has(key)) {
        skipped.push({ row: r.row, message: `"${r.name}" already exists, so it was skipped` });
        continue;
      }

      let categoryId = null;
      if (r.category) {
        const k = r.category.toLowerCase();
        if (!categoryIds.has(k)) {
          const ins = await db.query(
            'INSERT INTO categories (pharmacy_id, name) VALUES ($1, $2) RETURNING id',
            [pid, r.category]
          );
          categoryIds.set(k, ins.rows[0].id);
        }
        categoryId = categoryIds.get(k);
      }

      const isGeneral = r.itemType.toLowerCase() === 'general';
      const ins = await db.query(
        `INSERT INTO products (pharmacy_id, category_id, item_type, name, generic_name, strength, dosage_form,
                               requires_prescription, reorder_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          pid,
          categoryId,
          isGeneral ? 'general' : 'drug',
          r.name,
          r.genericName || null,
          isGeneral ? null : r.strength || null,
          isGeneral ? null : r.dosageForm || null,
          isGeneral ? false : YES.has(r.prescriptionOnly.toLowerCase()),
          Math.round(r.reorderLevel ?? 0),
        ]
      );
      const productId = ins.rows[0].id;
      existingKeys.add(key);

      if (r.barcode) {
        await db.query('INSERT INTO product_barcodes (pharmacy_id, product_id, barcode) VALUES ($1,$2,$3)', [
          pid,
          productId,
          r.barcode,
        ]);
        existingCodes.add(r.barcode);
      }
      if (r.sellingPrice !== null) {
        const qty = Math.round(r.quantity ?? 0);
        await db.query(
          `INSERT INTO batches (pharmacy_id, product_id, batch_no, expiry_date, qty_received, qty_remaining, cost_price, selling_price)
           VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
          [pid, productId, r.batchNo || null, r.expiryDate || null, qty, r.costPrice, r.sellingPrice]
        );
      }
      created += 1;
    }

    await audit(db, req, 'product.import', 'product', null, {
      received: rows.length,
      created,
      skipped: skipped.length,
      errors: errors.length,
    });
    return created;
  });

  res.json({ created: result, skipped, errors, received: rows.length });
}
