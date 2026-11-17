import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connected');
  } catch (err) {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  }
  app.listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
}

start();
