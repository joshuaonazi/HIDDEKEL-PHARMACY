import pg from 'pg';
import { env } from './env.js';

// Return dates as plain 'YYYY-MM-DD' text (avoids timezone shifts) and numbers as JS numbers
pg.types.setTypeParser(1082, (value) => value); // DATE
pg.types.setTypeParser(1700, (value) => parseFloat(value)); // NUMERIC
pg.types.setTypeParser(20, (value) => parseInt(value, 10)); // BIGINT (COUNT, SUM)

const isLocal = /@(localhost|127\.0\.0\.1)/.test(env.databaseUrl);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false }, // hosted databases (Supabase, Neon) need SSL
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

// Runs several queries as one all-or-nothing unit (checkout, stock-in, imports)
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
