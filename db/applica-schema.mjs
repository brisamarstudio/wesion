/**
 * Applica db/schema.sql al Neon europeo.
 *
 * Non tocca lo schema `leadgen`: crea solo `wesion`. Le vecchie tabelle restano
 * dove sono finche' non ci fidiamo del nuovo — cancellarle e' un'altra decisione,
 * presa un altro giorno.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(qui, 'schema.sql'), 'utf8');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'wesion' ORDER BY table_name`);
  console.log(`Schema wesion applicato. ${rows.length} tabelle:`);
  console.log('  ' + rows.map((r) => r.table_name).join(', '));
} finally {
  await pool.end();
}
