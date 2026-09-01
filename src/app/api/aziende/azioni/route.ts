/**
 * Le azioni in blocco sulle righe spuntate: buttare, o togliere di mezzo.
 *
 * ⚠️ PERCHE' SERVE (31/08/2026). Una lista di lead si lavora SCREMANDOLA: si
 * scorre, si riconosce il rumore — un network con 81 filiali finito fra i
 * dentisti di Abbiategrasso — e lo si toglie mentre si legge. Con la
 * cancellazione una-per-una bisognava aprire la riga, andare nel pannello e
 * cancellare: tre gesti per ogni riga sbagliata, quindi non lo si fa e la lista
 * resta sporca per sempre.
 *
 * DUE AZIONI, E LA SECONDA E' QUELLA GIUSTA PIU' SPESSO:
 *
 *   elimina   — la riga sparisce. Per quello che non doveva proprio entrare.
 *   archivia  — la riga resta, esce dai filtri. Per quello che non ci serve
 *               ADESSO ma che e' un'azienda vera: fra un anno quel dentista
 *               potrebbe volerlo, un sito.
 *
 * La differenza conta perche' cancellare e' l'unica cosa qui dentro che non
 * torna indietro, e chi screma una lista alle sette di sera clicca in fretta.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(richiesta: Request) {
  const { ids, azione } = (await richiesta.json().catch(() => ({}))) as {
    ids?: number[];
    azione?: string;
  };

  const numeri = (ids ?? []).map(Number).filter(Number.isFinite);
  if (!numeri.length) return NextResponse.json({ errore: 'nessuna riga selezionata' }, { status: 400 });
  if (azione !== 'elimina' && azione !== 'archivia') {
    return NextResponse.json({ errore: 'azione non prevista' }, { status: 400 });
  }

  if (azione === 'archivia') {
    const toccate = await query<{ id: number }>(
      `UPDATE wesion.azienda SET stato = 'archiviato', aggiornata_at = now()
        WHERE id = ANY($1::bigint[]) RETURNING id`,
      [numeri]
    );
    return NextResponse.json({ archiviate: toccate.length, protette: 0, nomiProtetti: [] });
  }

  /**
   * Stessa regola della cancellazione singola, riga per riga: si butta un lead
   * che non serve, non del lavoro fatto. Chi e' cliente o in trattativa, e
   * chiunque abbia bozze, servizi o messaggi, resta — e si dice quale.
   */
  const righe = await query<{ id: number; nome: string; stato: string; lavoro: number }>(
    `SELECT a.id, a.nome, a.stato,
            (SELECT count(*)::int FROM wesion.bozza b     WHERE b.azienda_id = a.id)
          + (SELECT count(*)::int FROM wesion.servizio s  WHERE s.azienda_id = a.id)
          + (SELECT count(*)::int FROM wesion.messaggio m WHERE m.azienda_id = a.id) AS lavoro
       FROM wesion.azienda a WHERE a.id = ANY($1::bigint[])`,
    [numeri]
  );

  const protette = righe.filter((r) => ['cliente', 'in_trattativa'].includes(r.stato) || r.lavoro > 0);
  const daButtare = righe.filter((r) => !protette.includes(r));

  if (daButtare.length) {
    await query(`DELETE FROM wesion.azienda WHERE id = ANY($1::bigint[])`, [daButtare.map((r) => r.id)]);
  }

  return NextResponse.json({
    cancellate: daButtare.length,
    protette: protette.length,
    nomiProtetti: protette.slice(0, 8).map((r) => r.nome),
  });
}
