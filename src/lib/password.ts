/**
 * Le password: impastarle e verificarle.
 *
 * ⚠️ STA IN UN FILE SUO, SEPARATO DAL COOKIE, E NON E' PIGNOLERIA.
 *
 * Usa `node:crypto`, che sul runtime Edge non esiste. Il middleware di Next
 * gira proprio li', e importa la sessione per verificare il cookie: se le due
 * cose stanno nello stesso file, l'import di scrypt viene trascinato dentro il
 * middleware e la build fallisce. Scoperto il 27/08/2026 tenendole insieme —
 * il commento in `sessione.ts` diceva gia' che erano due meccanismi diversi
 * per due problemi diversi, mancava di trarne la conseguenza.
 *
 * scrypt deve essere LENTO apposta: e' quello che rende costoso provare un
 * milione di parole a chi si prende il database. Il cookie invece si verifica a
 * ogni richiesta e deve volare: per quello c'e' l'HMAC in `sessione.ts`.
 *
 * Perche' non `bcrypt`: e' un modulo nativo da compilare, e su ARM dentro
 * un'immagine Docker costruita sul server e' il genere di cosa che fallisce a
 * fine build dopo tre minuti. scrypt sta dentro Node ed e' progettato per le
 * password esattamente come bcrypt.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, l: number) => Promise<Buffer>;

/** Genera l'hash da salvare: `sale:hash`, entrambi in esadecimale. */
export async function impastaPassword(password: string): Promise<string> {
  const sale = randomBytes(16);
  const hash = await scrypt(password, sale, 64);
  return `${sale.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verifica una password.
 *
 * ⚠️ `timingSafeEqual` e non `===`. Un confronto normale si ferma al primo
 * byte diverso, e il tempo che ci mette racconta quanti byte erano giusti: con
 * abbastanza tentativi si ricostruisce l'hash un carattere per volta. Costa
 * niente farlo bene.
 */
export async function verificaPassword(password: string, impastata: string): Promise<boolean> {
  const [saleHex, hashHex] = String(impastata).split(':');
  if (!saleHex || !hashHex) return false;
  try {
    const atteso = Buffer.from(hashHex, 'hex');
    const calcolato = await scrypt(password, Buffer.from(saleHex, 'hex'), atteso.length);
    return timingSafeEqual(atteso, calcolato);
  } catch {
    return false;
  }
}

