/**
 * I due numeri del menù: quanto aspetta te, e quanti clienti hai.
 *
 * ⚠️ NASCE DAL MENU A TRE VOCI (16/09/2026). Un menù di posti non dice niente;
 * un menù che dice «Oggi 4» dice se vale la pena entrare. I numeri non possono
 * arrivare dalle pagine — il telaio è uno solo e le pagine sono dieci — quindi
 * se li prende da qui, una volta per caricamento.
 *
 * ⚠️ DUE COUNT E BASTA, ED È UN VINCOLO. Questa rotta gira su OGNI pagina: se
 * un giorno venisse voglia di metterci il numero delle spie, sono decine di
 * query pesanti (`lib/spie.ts`) e le pagherebbe ogni click. Le spie hanno la
 * loro pagina, e quella può permettersele.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [righe] = await query<{ da_approvare: string; clienti: string }>(
    `SELECT
       (SELECT count(*) FROM wesion.bozza
         WHERE stato IN ('generata','attesa_approvazione'))     AS da_approvare,
       (SELECT count(*) FROM wesion.azienda
         WHERE stato = 'cliente')                               AS clienti`
  );

  return NextResponse.json({
    daApprovare: Number(righe?.da_approvare ?? 0),
    clienti: Number(righe?.clienti ?? 0),
  });
}
