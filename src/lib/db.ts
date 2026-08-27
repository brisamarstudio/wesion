/**
 * Un pool solo per tutta l'app.
 *
 * In sviluppo Next ricarica i moduli a ogni salvataggio: senza la cache sul
 * globalThis si aprirebbe un pool nuovo a ogni hot reload, finche' Neon non
 * rifiuta le connessioni. E' il classico che si scopre dopo mezz'ora di
 * "too many connections" senza aver cambiato niente.
 */
import { Pool, types } from 'pg';

/**
 * I BIGINT tornano come NUMERI, non come stringhe.
 *
 * ⚠️ Per difetto node-postgres restituisce int8 come stringa, perche' un bigint
 * puo' superare quello che un numero JavaScript regge. Corretto in teoria e
 * bugiardo in pratica: tutte le nostre interfacce dichiarano `id: number`, e
 * il codice sembra funzionare — finche' qualcuno non scrive `b.id + 1` e
 * ottiene "411" invece di 42. Scoperto il 27/08/2026 mentre un `find(x => x.id
 * === 51)` non trovava una riga che c'era.
 *
 * I nostri id vengono da BIGSERIAL e partono da 1: per superare i 9 milioni di
 * miliardi che JavaScript regge senza perdere precisione servirebbero piu' post
 * di quanti se ne possano scrivere. Meglio un numero vero che una stringa che
 * si finge tale.
 */
types.setTypeParser(types.builtins.INT8, (v) => Number(v));

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
