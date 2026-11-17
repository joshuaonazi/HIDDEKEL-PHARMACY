import { z } from 'zod';
import { query } from '../config/db.js';
import { audit } from '../utils/audit.js';
import { getPharmacy, settingsOut } from '../services/receipt.service.js';

const optText = (max) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);

export const settingsSchema = z.object({
  name: z.string().trim().min(1, 'The pharmacy name is required').max(120),
  address: optText(200),
  phone: optText(30),
  receiptFooter: optText(120),
  taxRate: z.number().min(0, 'The VAT rate cannot be negative').max(100, 'The VAT rate cannot be more than 100'),
});

export async function getSettings(req, res) {
  res.json({ settings: settingsOut(await getPharmacy({ query }, req.user.pharmacyId)) });
}

export async function updateSettings(req, res) {
  const s = req.body;
  await query(
    `UPDATE pharmacies SET name = $1, address = $2, phone = $3, receipt_footer = $4, tax_rate = $5 WHERE id = $6`,
    [s.name, s.address, s.phone, s.receiptFooter, s.taxRate, req.user.pharmacyId]
  );
  await audit({ query }, req, 'settings.update', 'pharmacy', req.user.pharmacyId, { name: s.name, taxRate: s.taxRate });
  res.json({ settings: settingsOut(await getPharmacy({ query }, req.user.pharmacyId)) });
}
