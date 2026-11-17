// Creates the first pharmacy, the admin account and starter categories.
// Safe to run again: it will not create duplicates.
import 'dotenv/config';
import { pool, withTransaction } from '../src/config/db.js';
import { hashPassword } from '../src/utils/password.js';

const pharmacyName = process.env.PHARMACY_NAME || 'Hiddekel Pharmacy and Store';
const adminName = process.env.ADMIN_NAME;
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminName || !adminEmail || !adminPassword) {
  console.error('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first.');
  process.exit(1);
}
if (adminPassword.length < 10) {
  console.error('ADMIN_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

const categories = [
  'Antibiotics', 'Analgesics', 'Vitamins', 'Antimalarials',
  'Antidiabetic', 'Cardiovascular', 'Baby Care', 'Cosmetics',
];

try {
  await withTransaction(async (db) => {
    let { rows } = await db.query('SELECT id FROM pharmacies WHERE name = $1', [pharmacyName]);
    let pharmacyId = rows[0]?.id;
    if (!pharmacyId) {
      ({ rows } = await db.query('INSERT INTO pharmacies (name) VALUES ($1) RETURNING id', [pharmacyName]));
      pharmacyId = rows[0].id;
      console.log('Created pharmacy:', pharmacyName);
    }

    ({ rows } = await db.query('SELECT id FROM users WHERE lower(email) = $1', [adminEmail]));
    if (!rows[0]) {
      const hash = await hashPassword(adminPassword);
      await db.query(
        `INSERT INTO users (pharmacy_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')`,
        [pharmacyId, adminName, adminEmail, hash]
      );
      console.log('Created admin user:', adminEmail);
    } else {
      console.log('Admin already exists:', adminEmail);
    }

    for (const name of categories) {
      await db.query(
        `INSERT INTO categories (pharmacy_id, name)
         SELECT $1, $2
          WHERE NOT EXISTS (SELECT 1 FROM categories WHERE pharmacy_id = $1 AND parent_id IS NULL AND name = $2)`,
        [pharmacyId, name]
      );
    }
    console.log('Categories ready');
  });
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
