import { HttpError } from '../utils/httpError.js';
import { fromKobo, toKobo } from '../utils/money.js';

/*
 * Works out what a cart costs and which batches it will come from.
 * Stock is taken earliest-expiry-first and expired batches are never sold.
 * With { lock: true } (checkout) the batch rows are locked so two cashiers cannot sell the same last unit.
 * The price always comes from the database, never from the browser.
 */
export async function allocateCart(db, pharmacy, items, { lock }) {
  const lines = [];
  const problems = [];

  // Always lock in the same order to avoid deadlocks between two simultaneous sales
  const ordered = [...items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const item of ordered) {
    const { rows } = await db.query(
      `SELECT id, name, strength, dosage_form, requires_prescription
         FROM products WHERE id = $1 AND pharmacy_id = $2 AND is_active`,
      [item.productId, pharmacy.id]
    );
    const product = rows[0];
    if (!product) {
      problems.push({ productId: item.productId, message: 'A product in the cart is no longer available' });
      continue;
    }

    const batches = await db.query(
      `SELECT id, qty_remaining, cost_price, selling_price
         FROM batches
        WHERE product_id = $1 AND pharmacy_id = $2 AND qty_remaining > 0
          AND (expiry_date IS NULL OR expiry_date >= (now() AT TIME ZONE $3)::date)
        ORDER BY expiry_date NULLS LAST, created_at, id
        ${lock ? 'FOR UPDATE' : ''}`,
      [item.productId, pharmacy.id, pharmacy.timezone]
    );

    const available = batches.rows.reduce((sum, b) => sum + b.qty_remaining, 0);
    const label = product.strength && !product.name.toLowerCase().includes(product.strength.toLowerCase())
      ? `${product.name} ${product.strength}`
      : product.name;

    if (available < item.quantity) {
      problems.push({
        productId: item.productId,
        available,
        message:
          available === 0
            ? `${label} is out of stock (or only has expired stock)`
            : `Only ${available} of ${label} can be sold, but ${item.quantity} were requested`,
      });
      continue;
    }

    let remaining = item.quantity;
    const segments = [];
    for (const b of batches.rows) {
      if (remaining === 0) break;
      const take = Math.min(remaining, b.qty_remaining);
      segments.push({
        batchId: b.id,
        quantity: take,
        unitPriceKobo: toKobo(b.selling_price),
        unitCostKobo: toKobo(b.cost_price),
      });
      remaining -= take;
    }

    lines.push({
      productId: product.id,
      name: product.name,
      strength: product.strength,
      label,
      requiresPrescription: product.requires_prescription,
      quantity: item.quantity,
      segments,
      lineTotalKobo: segments.reduce((sum, s) => sum + s.quantity * s.unitPriceKobo, 0),
    });
  }

  return { lines, problems };
}

export function computeTotals(lines, discount, taxRate) {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalKobo, 0);

  let discountKobo = 0;
  if (discount && discount.value > 0) {
    if (discount.type === 'percent') {
      if (discount.value > 100) throw new HttpError(400, 'A discount cannot be more than 100%');
      discountKobo = Math.round((subtotal * discount.value) / 100);
    } else {
      discountKobo = toKobo(discount.value);
    }
    if (discountKobo > subtotal) throw new HttpError(400, 'The discount cannot be more than the subtotal');
  }

  const taxable = subtotal - discountKobo;
  const taxKobo = taxRate > 0 ? Math.round((taxable * taxRate) / 100) : 0;
  const totalKobo = taxable + taxKobo;

  return {
    subtotal: fromKobo(subtotal),
    discount: fromKobo(discountKobo),
    tax: fromKobo(taxKobo),
    total: fromKobo(totalKobo),
    totalKobo,
  };
}

export const quoteLineOut = (l) => ({
  productId: l.productId,
  name: l.name,
  strength: l.strength,
  label: l.label,
  requiresPrescription: l.requiresPrescription,
  quantity: l.quantity,
  unitPrice: fromKobo(Math.round(l.lineTotalKobo / l.quantity)),
  lineTotal: fromKobo(l.lineTotalKobo),
});
