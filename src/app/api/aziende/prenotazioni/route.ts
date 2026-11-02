/**
 * Controlla dove va chi vuole prenotare, per le strutture ricettive di una
 * ricerca (o per gli id passati). Vedi src/lib/prenotazioni.ts.
 *
 * Tre alla volta e non tutte insieme: ogni lettura apre un Chromium, e
 * trenta Chromium in parallelo sul server della dashboard sono un modo
 * elegante di spegnerla. Tetto a 40 per chiamata, come l'audit: si richiama.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { salvaPrenotazione, RICETTIVA } from '@/lib/prenotazioni';

export const maxDuration = 300;

export async function POST(richiesta: Request) {
  const corpo = (await richiesta.json().catch(() => ({}))) as {
    campagna?: number | string;
    ids?: Array<number | string>;
    ancheGiaFatte?: boolean;
  };
  const tetto = 40;

  let ids = Array.isArray(corpo.ids) ? corpo.ids.map(String) : [];
  if (!ids.length) {
    if (!corpo.campagna) return NextResponse.json({ errore: 'Serve una ricerca o un elenco.' }, { status: 400 });
    const righe = await query<{ id: string; categoria: string | null }>(
      `SELECT a.id::text AS id, a.categoria FROM wesion.azienda a
        WHERE a.campagna_id = $1 AND a.stato <> 'cliente'
          AND ($2::boolean OR a.prenotazione IS NULL)
        ORDER BY a.id`,
      [corpo.campagna, Boolean(corpo.ancheGiaFatte)]
    );
    ids = righe.filter((r) => RICETTIVA.test(r.categoria ?? '')).map((r) => r.id);
  }
  ids = ids.slice(0, tetto);

  const coda = [...ids];
  const esiti: Record<string, string> = {};
  await Promise.all(
    [1, 2, 3].map(async () => {
      let id: string | undefined;
      while ((id = coda.shift())) {
        try {
          const e = await salvaPrenotazione(id);
          esiti[id] = e?.tipo ?? 'non_ricettiva';
        } catch (errore) {
          esiti[id] = 'errore';
          console.error(`[prenotazioni] azienda ${id}`, errore);
        }
      }
    })
  );

  const conta: Record<string, number> = {};
  for (const t of Object.values(esiti)) conta[t] = (conta[t] ?? 0) + 1;
  return NextResponse.json({ controllate: ids.length, conta });
}
