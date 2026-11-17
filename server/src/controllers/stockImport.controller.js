import crypto from 'node:crypto';
import { z } from 'zod';
import { withTransaction } from '../config/db.js';
import { audit } from '../utils/audit.js';
import { HttpError } from '../utils/httpError.js';

const MAX_ROWS = 2000;

const text = (max) => z.string().trim().max(max).optional().default('');
const numberish = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number(String(v).trim())));

const rowSchema = z.object({
  row: z.coerce.number().int().min(1),
  name: text(150),
  strength: text(60),
  dosageForm: text(60),
  barcode: text(64),
  batchNo: text(60),
  expiryDate: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expiry date not understood (use DD/MM/YYYY)'),
  quantity: numberish,
  costPrice: numberish,
  sellingPrice: numberish,
});

const label = (p) =>
  p.strength && !p.name.toLowerCase().includes(p.strength.toLowerCase()) ? `${p.name} ${p.strength}` : p.name;

// Works out what every row would do, without writing anything
async function analyse(db, pharmacy, rawRows) {
  const pid = pharmacy.id;

  const products = (
    await db.query('SELECT id, name, strength, dosage_form FROM products WHERE pharmacy_id = $1 AND is_active', [pid])
  ).rows;
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map();
  for (const p of products) {
    const k = p.name.toLowerCase();
    byName.set(k, [...(byName.get(k) || []), p]);
  }
  const byBarcode = new Map(
    (await db.query('SELECT barcode, product_id FROM product_barcodes WHERE pharmacy_id = $1', [pid])).rows.map((r) => [
      r.barcode,
      r.product_id,
    ])
  );
  const existingBatches = new Set(
    (
      await db.query(
        `SELECT product_id, lower(batch_no) AS b, COALESCE(expiry_date::text, '') AS e
           FROM batches WHERE pharmacy_id = $1 AND batch_no IS NOT NULL AND batch_no <> ''`,
        [pid]
      )
    ).rows.map((r) => `${r.product_id}|${r.b}|${r.e}`)
  );
  const today = (await db.query('SELECT (now() AT TIME ZONE $1)::date AS d', [pharmacy.timezone])).rows[0].d;

  const seenInFile = new Map();
  const results = [];
  const clean = [];

  for (const [i, raw] of rawRows.entries()) {
    const rowNo = Number(raw?.row) || i + 2;
    const fail = (message) => results.push({ row: rowNo, status: 'error', message });

    const parsed = rowSchema.safeParse({ ...raw, row: rowNo });
    if (!parsed.success) {
      fail(parsed.error.issues.map((x) => x.message).join('; '));
      continue;
    }
    const r = parsed.data;
    clean.push(r);

    if (!r.name && !r.barcode) {
      fail('Add a barcode or a product name');
      continue;
    }
    if (!Number.isInteger(r.quantity) || r.quantity <= 0 || r.quantity > 10_000_000) {
      fail('Quantity must be a whole number above 0');
      continue;
    }
    const priceProblem = [
      ['Cost price', r.costPrice],
      ['Selling price', r.sellingPrice],
    ].find(([, v]) => v === null || !Number.isFinite(v) || v < 0 || v > 100_000_000);
    if (priceProblem) {
      fail(`${priceProblem[0]} must be a number, 0 or more`);
      continue;
    }
    if (r.expiryDate && r.expiryDate < today) {
      fail(`Expiry date ${r.expiryDate} is in the past`);
      continue;
    }

    // Find the product: barcode first, then name (plus strength and form when given)
    let product = null;
    if (r.barcode && byBarcode.has(r.barcode)) product = byId.get(byBarcode.get(r.barcode));
    if (!product) {
      if (!r.name) {
        fail(`No product has the barcode ${r.barcode}`);
        continue;
      }
      const candidates = (byName.get(r.name.toLowerCase()) || []).filter(
        (p) =>
          (!r.strength || (p.strength || '').toLowerCase() === r.strength.toLowerCase()) &&
          (!r.dosageForm || (p.dosage_form || '').toLowerCase() === r.dosageForm.toLowerCase())
      );
      if (candidates.length === 0) {
        fail(`No product named "${r.name}" was found. Add it first with Import from Excel.`);
        continue;
      }
      if (candidates.length > 1) {
        fail(`More than one product matches "${r.name}". Add the barcode, strength or form to pick one.`);
        continue;
      }
      product = candidates[0];
    }

    if (r.batchNo) {
      const key = `${product.id}|${r.batchNo.toLowerCase()}|${r.expiryDate}`;
      if (seenInFile.has(key)) {
        fail(`Same batch as row ${seenInFile.get(key)}`);
        continue;
      }
      seenInFile.set(key, rowNo);
      if (existingBatches.has(key)) {
        fail(`Batch ${r.batchNo} already exists for ${label(product)}. Correct it in the product's Batches section instead.`);
        continue;
      }
    }

    results.push({
      row: rowNo,
      status: 'ok',
      productId: product.id,
      productName: label(product),
      quantity: r.quantity,
      costPrice: r.costPrice,
      sellingPrice: r.sellingPrice,
      batchNo: r.batchNo || null,
      expiryDate: r.expiryDate || null,
    });
  }

  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
  return { results, fingerprint };
}

export async function stockImport(req, res) {
  const { rows, dryRun = true, allowRepeat = false } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Too many rows. Import up to ${MAX_ROWS} at a time.`);

  const pid = req.user.pharmacyId;

  const payload = await withTransaction(async (db) => {
    // Only one stock import at a time per pharmacy
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`stockimport:${pid}`]);
    const pharmacy = (await db.query('SELECT id, timezone FROM pharmacies WHERE id = $1', [pid])).rows[0];

    const { results, fingerprint } = await analyse(db, pharmacy, rows);
    const errors = results.filter((r) => r.status === 'error');
    const ok = results.filter((r) => r.status === 'ok');
    const summary = {
      rows: rows.length,
      batches: ok.length,
      units: ok.reduce((s, r) => s + r.quantity, 0),
      errors: errors.length,
    };

    const prior = await db.query(
      `SELECT created_at FROM audit_logs
        WHERE pharmacy_id = $1 AND action = 'stock.import' AND details->>'fingerprint' = $2
        ORDER BY created_at DESC LIMIT 1`,
      [pid, fingerprint]
    );
    const previouslyImportedAt = prior.rows[0]?.created_at || null;

    const base = { dryRun: Boolean(dryRun), committed: false, summary, previouslyImportedAt, rows: results.sort((a, b) => a.row - b.row) };
    if (dryRun) return base;

    // Nothing is added unless every row is valid, so a corrected file can always be imported safely
    if (errors.length) throw new HttpError(409, `${errors.length} row(s) have problems. No stock was added. Fix the file and try again.`);
    if (previouslyImportedAt && !allowRepeat) {
      throw new HttpError(409, 'This exact file was already imported before. Importing it again would double the stock.');
    }

    for (const r of ok) {
      const ins = await db.query(
        `INSERT INTO batches (pharmacy_id, product_id, batch_no, expiry_date, qty_received, qty_remaining, cost_price, selling_price)
         VALUES ($1,$2,$3,$4,$5,$5,$6,$7) RETURNING id`,
        [pid, r.productId, r.batchNo, r.expiryDate, r.quantity, r.costPrice, r.sellingPrice]
      );
      await audit(db, req, 'batch.create', 'batch', ins.rows[0].id, {
        source: 'stock_import',
        quantity: r.quantity,
        cost: r.costPrice,
        selling: r.sellingPrice,
      });
    }
    await audit(db, req, 'stock.import', 'batch', null, { fingerprint, ...summary });
    return { ...base, committed: true };
  });

  res.json(payload);
}
