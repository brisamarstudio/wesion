/**
 * Cambiare lo stato commerciale di un'azienda.
 *
 * Sta in una rotta sua e non dentro `/scheda` perche' e' l'azione che si fa di
 * piu': si scorre l'elenco dopo dieci telefonate e si segnano gli esiti. Farla
 * passare dal salvataggio dell'intera scheda vorrebbe dire rileggere e
 * riscrivere fatti, voce e servizi per cambiare una parola.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const AMMESSI = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso', 'archiviato'];

export async function PATCH(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { stato, note } = (await richiesta.json().catch(() => ({}))) as { stato?: string; note?: string };
  if (!stato || !AMMESSI.includes(stato)) {
    return NextResponse.json({ errore: `stato deve essere uno fra: ${AMMESSI.join(', ')}` }, { status: 400 });
  }

  const [prima] = await query<{ stato: string }>(`SELECT stato FROM wesion.azienda WHERE id = $1`, [aziendaId]);
  if (!prima) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });

  await query(
    `UPDATE wesion.azienda
        SET stato = $2, note = COALESCE($3, note), aggiornata_at = now()
      WHERE id = $1`,
    [aziendaId, stato, note ?? null]
  );

  // Il cambio di stato e' storia commerciale: fra un mese "quando l'abbiamo
  // contattato?" deve avere una risposta che non sia "boh".
  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'stato_cambiato', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ da: prima.stato, a: stato })]
  );

  return NextResponse.json({ id: aziendaId, stato });
}
