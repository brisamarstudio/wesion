/**
 * Un pool solo per tutta l'app.
 *
 * In sviluppo Next ricarica i moduli a ogni salvataggio: senza la cache sul
 * globalThis si aprirebbe un pool nuovo a ogni hot reload, finche' Neon non
 * rifiuta le connessioni. E' il classico che si scopre dopo mezz'ora di
 * "too many connections" senza aver cambiato niente.
 */
import { Pool } from 'pg';

const globalePool = globalThis as unknown as { poolWesion?: Pool };

export const pool =
  globalePool.poolWesion ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') globalePool.poolWesion = pool;

export async function query<T>(sql: string, valori: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query(sql, valori);
  return rows as T[];
}
