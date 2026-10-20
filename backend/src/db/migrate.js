import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('[MIGRATE] Running database migrations...');
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schemaSql);
    console.log('[MIGRATE] Database schema applied successfully. No seed data injected.');
  } catch (error) {
    console.error('[MIGRATE] Error applying schema migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
