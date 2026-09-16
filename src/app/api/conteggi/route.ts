/**
 * I numeri del menù: quanto aspetta te in ogni prodotto, e quanti clienti hai.
 *
 * ⚠️ NASCE DAL MENU PER PRODOTTO (16/09/2026). Un menù di posti non dice
 * niente; un menù che dice «Google 38» dice se vale la pena entrare. I numeri
 * non possono arrivare dalle pagine — il telaio è uno solo e le pagine sono
 * dieci — quindi se li prende da qui, una volta per caricamento.
 *
 * ⚠️ DUE QUERY E BASTA, ED È UN VINCOLO. Questa rotta gira su OGNI pagina: se
 * un giorno venisse voglia di metterci il numero delle spie, sono decine di
 * query pesanti (`lib/spie.ts`) e le pagherebbe ogni click. Le spie hanno la
 * loro pagina, e quella può permettersele.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { prodottoDelTipo } from '@/lib/prodotti';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Una query sola: gira su ogni pagina. Il raggruppamento per tipo lo fa
  // Postgres, la somma per prodotto la fa `lib/prodotti.ts` — così quando un
  // tipo cambia casa non si tocca l'SQL.
  const perTipo = await query<{ tipo: string; quante: string }>(
    `SELECT tipo, count(*) AS quante
       FROM wesion.bozza
      WHERE stato IN ('generata','attesa_approvazione')
      GROUP BY tipo`
  );

  const [righe] = await query<{ clienti: string }>(
    `SELECT count(*) AS clienti FROM wesion.azienda WHERE stato = 'cliente'`
  );

  const prodotti: Record<string, number> = {};
  for (const r of perTipo) {
    const p = prodottoDelTipo(r.tipo);
    if (!p) continue;
    prodotti[p] = (prodotti[p] ?? 0) + Number(r.quante);
  }

  return NextResponse.json({ prodotti, clienti: Number(righe?.clienti ?? 0) });
}
