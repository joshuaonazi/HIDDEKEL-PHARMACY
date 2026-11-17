import { z } from 'zod';
import { query } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';
import { audit } from '../utils/audit.js';

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  parentId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
});

export async function listCategories(req, res) {
  const pid = req.user.pharmacyId;
  const { rows } = await query(
    `SELECT c.id, c.name, c.parent_id,
            COUNT(p.id) FILTER (WHERE p.is_active) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
      WHERE c.pharmacy_id = $1
      GROUP BY c.id
      ORDER BY c.name`,
    [pid]
  );
  const { rows: total } = await query(
    'SELECT COUNT(*) AS n FROM products WHERE pharmacy_id = $1 AND is_active',
    [pid]
  );
  res.json({
    categories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parent_id,
      productCount: r.product_count,
    })),
    totalProducts: total[0].n,
  });
}

export async function createCategory(req, res) {
  const pid = req.user.pharmacyId;
  const { name, parentId } = req.body;

  if (parentId) {
    const { rowCount } = await query('SELECT 1 FROM categories WHERE id = $1 AND pharmacy_id = $2', [parentId, pid]);
    if (!rowCount) throw new HttpError(400, 'Parent category not found');
  }
  const dup = await query(
    `SELECT 1 FROM categories
      WHERE pharmacy_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(name) = lower($3)`,
    [pid, parentId, name]
  );
  if (dup.rowCount) throw new HttpError(409, `A category named "${name}" already exists`);

  const { rows } = await query(
    'INSERT INTO categories (pharmacy_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id, name, parent_id',
    [pid, parentId, name]
  );
  await audit({ query }, req, 'category.create', 'category', rows[0].id, { name });
  res.status(201).json({ category: { id: rows[0].id, name: rows[0].name, parentId: rows[0].parent_id, productCount: 0 } });
}

export async function updateCategory(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);
  const { name } = req.body;

  const current = await query('SELECT parent_id, name FROM categories WHERE id = $1 AND pharmacy_id = $2', [id, pid]);
  if (!current.rowCount) throw new HttpError(404, 'Category not found');

  const dup = await query(
    `SELECT 1 FROM categories
      WHERE pharmacy_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(name) = lower($3) AND id <> $4`,
    [pid, current.rows[0].parent_id, name, id]
  );
  if (dup.rowCount) throw new HttpError(409, `A category named "${name}" already exists`);

  await query('UPDATE categories SET name = $1 WHERE id = $2 AND pharmacy_id = $3', [name, id, pid]);
  await audit({ query }, req, 'category.rename', 'category', id, { from: current.rows[0].name, to: name });
  res.json({ ok: true });
}

export async function deleteCategory(req, res) {
  const pid = req.user.pharmacyId;
  const id = idParam(req);

  const current = await query('SELECT name FROM categories WHERE id = $1 AND pharmacy_id = $2', [id, pid]);
  if (!current.rowCount) throw new HttpError(404, 'Category not found');

  const inUse = await query(
    'SELECT COUNT(*) AS n FROM products WHERE category_id = $1 AND pharmacy_id = $2 AND is_active',
    [id, pid]
  );
  if (inUse.rows[0].n > 0) {
    throw new HttpError(409, `${inUse.rows[0].n} product(s) still use this category. Move them first.`);
  }
  const children = await query('SELECT COUNT(*) AS n FROM categories WHERE parent_id = $1 AND pharmacy_id = $2', [id, pid]);
  if (children.rows[0].n > 0) throw new HttpError(409, 'This category has subcategories. Remove them first.');

  // Inactive (deleted) products may still point here; detach them so the category can go
  await query('UPDATE products SET category_id = NULL WHERE category_id = $1 AND pharmacy_id = $2', [id, pid]);
  await query('DELETE FROM categories WHERE id = $1 AND pharmacy_id = $2', [id, pid]);
  await audit({ query }, req, 'category.delete', 'category', id, { name: current.rows[0].name });
  res.json({ ok: true });
}
