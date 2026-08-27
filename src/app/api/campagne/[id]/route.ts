/**
 * Cancellare una campagna, e volendo i lead che ha portato.
 *
 * ⚠️ IL LAVORO FATTO NON SI CANCELLA MAI, NEMMENO SE LO CHIEDI.
 *
 * Serve a buttare via una ricerca sbagliata — categoria storta, citta' storta,
 * "stavo solo provando" — e in quel caso portarsi dietro i lead e' giusto:
 * sono spazzatura anche loro.
 *
 * Ma dentro quella lista puo' esserci un'azienda che nel frattempo e' diventata
 * cliente, o che ha gia' delle bozze, o dei servizi attivi, o dei messaggi. Quella
 * NON si tocca: perde solo il legame con la campagna. Cancellarla vorrebbe dire
 * portarsi via a cascata bozze, pubblicazioni e storia — e sarebbe irreversibile
 * per un gesto nato come "faccio pulizia".
 *
 * Le protette si contano e si dicono, invece di sparire in silenzio dal numero.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function DELETE(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const campagnaId = Number(id);
  if (!Number.isFinite(campagnaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  // `?aziende=si` porta via anche i lead. Senza, si cancella solo la campagna
  // e le aziende restano (con campagna_id a NULL, per la chiave ON DELETE SET NULL).
  const anche = new URL(richiesta.url).searchParams.get('aziende') === 'si';

  const [campagna] = await query<{ nome: string }>(`SELECT nome FROM wesion.campagna WHERE id = $1`, [campagnaId]);
  if (!campagna) return NextResponse.json({ errore: 'campagna inesistente' }, { status: 404 });

  let cancellate = 0;
  let protette: string[] = [];

  if (anche) {
    // Chi ha del lavoro attaccato resta. La condizione e' esplicita e lunga
    // apposta: e' piu' facile leggerla che ricostruirla fra sei mesi.
    const salve = await query<{ nome: string }>(
      `SELECT a.nome FROM wesion.azienda a
        WHERE a.campagna_id = $1
          AND (a.stato IN ('cliente','in_trattativa')
            OR EXISTS (SELECT 1 FROM wesion.bozza b    WHERE b.azienda_id = a.id)
            OR EXISTS (SELECT 1 FROM wesion.servizio s WHERE s.azienda_id = a.id)
            OR EXISTS (SELECT 1 FROM wesion.messaggio m WHERE m.azienda_id = a.id))`,
      [campagnaId]
    );
    protette = salve.map((r) => r.nome);

    const via = await query<{ id: number }>(
      `DELETE FROM wesion.azienda a
        WHERE a.campagna_id = $1
          AND a.stato NOT IN ('cliente','in_trattativa')
          AND NOT EXISTS (SELECT 1 FROM wesion.bozza b    WHERE b.azienda_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM wesion.servizio s WHERE s.azienda_id = a.id)
          AND NOT EXISTS (SELECT 1 FROM wesion.messaggio m WHERE m.azienda_id = a.id)
        RETURNING a.id`,
      [campagnaId]
    );
    cancellate = via.length;
  }

  await query(`DELETE FROM wesion.campagna WHERE id = $1`, [campagnaId]);

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
     VALUES (NULL, 'campagna_cancellata', 'dashboard', $1)`,
    [JSON.stringify({ campagna: campagna.nome, aziende_cancellate: cancellate, protette: protette.length })]
  );

  return NextResponse.json({ cancellate, protette });
}
