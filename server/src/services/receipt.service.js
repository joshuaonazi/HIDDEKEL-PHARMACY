import { HttpError } from '../utils/httpError.js';

export async function getPharmacy(db, pharmacyId) {
  const { rows } = await db.query(
    `SELECT id, name, address, phone, logo_url, receipt_footer, tax_rate, currency, timezone
       FROM pharmacies WHERE id = $1`,
    [pharmacyId]
  );
  if (!rows[0]) throw new HttpError(404, 'Pharmacy not found');
  return rows[0];
}

export const settingsOut = (p) => ({
  name: p.name,
  address: p.address,
  phone: p.phone,
  receiptFooter: p.receipt_footer,
  taxRate: p.tax_rate,
  currency: p.currency,
  timezone: p.timezone,
});

// Everything the receipt needs, in one object (used right after checkout and when reprinting)
export async function getSaleReceipt(db, user, saleId) {
  const { rows } = await db.query(
    `SELECT s.id, s.receipt_no, s.created_at, s.subtotal, s.discount, s.tax, s.total, s.payment_method,
            s.amount_tendered, s.status, s.cashier_id, s.void_reason, s.voided_at,
            u.full_name AS cashier, vu.full_name AS voided_by
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN users vu ON vu.id = s.voided_by
      WHERE s.id = $1 AND s.pharmacy_id = $2`,
    [saleId, user.pharmacyId]
  );
  const s = rows[0];
  // Cashiers may only open their own sales
  if (!s || (user.role === 'cashier' && s.cashier_id !== user.id)) return null;

  const items = await db.query(
    `SELECT p.name, p.strength, si.unit_price, SUM(si.quantity) AS quantity, SUM(si.line_total) AS line_total
       FROM sale_items si JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = $1
      GROUP BY p.id, p.name, p.strength, si.unit_price
      ORDER BY p.name, si.unit_price`,
    [saleId]
  );
  const pharmacy = await getPharmacy(db, user.pharmacyId);
  const cash = s.payment_method === 'cash' && s.amount_tendered !== null;

  return {
    id: s.id,
    receiptNo: s.receipt_no,
    createdAt: s.created_at,
    status: s.status,
    voidReason: s.void_reason,
    voidedAt: s.voided_at,
    voidedBy: s.voided_by,
    cashier: s.cashier,
    paymentMethod: s.payment_method,
    subtotal: s.subtotal,
    discount: s.discount,
    tax: s.tax,
    total: s.total,
    amountTendered: cash ? s.amount_tendered : null,
    change: cash ? Math.round((s.amount_tendered - s.total) * 100) / 100 : null,
    taxRate: pharmacy.tax_rate,
    items: items.rows.map((r) => ({
      name: r.name,
      strength: r.strength,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      lineTotal: r.line_total,
    })),
    pharmacy: {
      name: pharmacy.name,
      address: pharmacy.address,
      phone: pharmacy.phone,
      receiptFooter: pharmacy.receipt_footer,
      timezone: pharmacy.timezone,
    },
  };
}