/**
 * Svuotare la coda di un cliente — in un click, non una alla volta.
 *
 * ⚠️ NASCE DA UN CASO VERO (16/09/2026). MyWebby aveva 15 bozze Google ferme
 * da decidere, alcune con la data già passata: un vecchio piano mai deciso.
 * Ricostruire il piano non le toglieva — `salvaPiano` cancella solo le
 * `vuota` ancora senza testo, per non buttare via lavoro già scritto — quindi
 * ogni «Costruisci il piano del mese» le sommava alle precedenti invece di
 * sostituirle. «Voglio con un click svuotare tutto, non ho un CRUD».
 *
 * DELETE cancella tutte le bozze ANCORA DA DECIDERE (vuota, generata,
 * attesa_approvazione) di questo cliente, filtrate per prodotto se lo passi
 * (`?prodotto=google`).
 *
 * ⚠️ SOLO LE ANCORA DA DECIDERE, NON TUTTA LA STORIA. `rifiutata` e `scaduta`
 * sono decisioni già prese, non una coda: cancellarle insieme svuoterebbe
 * anche quello che un domani si vuole ancora rileggere ("perché l'avevo
 * rifiutata?"). `approvata` non si tocca: è già in mano al router, e
 * cancellarla in massa vorrebbe dire fermare in silenzio qualcosa che sta per
 * uscire — chi vuole fermarne una lo fa apposta, dal pannello, con «Torna
 * indietro» o «Cancella» singola.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { leggiProdotto, PRODOTTI } from '@/lib/prodotti';

const OPERATORE = 'dashboard';

export async function DELETE(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const prodotto = leggiProdotto(new URL(richiesta.url).searchParams.get('prodotto'));
  const tipi = prodotto ? PRODOTTI[prodotto].tipi : null;

  // Stessa forma della cancellazione singola in /api/bozze/[id] (RETURNING +
  // tracciata referenziata: su CockroachDB una CTE di sola scrittura mai
  // guardata può non essere eseguita — vedi STATO.md §19).
  const righe = await query<{ id: number; tracciati: string }>(
    `WITH via AS (
       DELETE FROM wesion.bozza
        WHERE azienda_id = $1
          AND stato = ANY(ARRAY['vuota','generata','attesa_approvazione'])
          AND ($2::text[] IS NULL OR tipo = ANY($2))
       RETURNING id, azienda_id, tipo, contenuto
     ), tracciata AS (
       INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
       SELECT azienda_id, 'bozza_cancellata', $3,
              jsonb_build_object('bozza_id', id, 'tipo', tipo,
                                 'titolo', contenuto->>'titolo', 'motivo', 'svuota_coda')
         FROM via
       RETURNING id
     )
     SELECT v.id, (SELECT count(*) FROM tracciata) AS tracciati FROM via v`,
    [aziendaId, tipi, OPERATORE]
  );

  return NextResponse.json({ cancellate: righe.length });
}
