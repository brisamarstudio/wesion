/**
 * Cancellare un'azienda.
 *
 * ⚠️ Stessa regola della campagna: si cancella un lead che non serve, non del
 * lavoro fatto. Se e' cliente, o se ha bozze, servizi o messaggi, non si tocca
 * — e si dice PERCHE', o chi ha premuto il bottone pensa che sia rotto.
 *
 * Per togliere di mezzo un'azienda che ha una storia c'e' lo stato
 * `archiviato`: sparisce dai filtri e resta nel database, che e' quasi sempre
 * quello che si voleva davvero.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function DELETE(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [a] = await query<{ nome: string; stato: string; bozze: number; servizi: number; messaggi: number }>(
    `SELECT a.nome, a.stato,
            (SELECT count(*)::int FROM wesion.bozza b     WHERE b.azienda_id = a.id) AS bozze,
            (SELECT count(*)::int FROM wesion.servizio s  WHERE s.azienda_id = a.id) AS servizi,
            (SELECT count(*)::int FROM wesion.messaggio m WHERE m.azienda_id = a.id) AS messaggi
       FROM wesion.azienda a WHERE a.id = $1`,
    [aziendaId]
  );
  if (!a) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });

  const motivi = [
    ['cliente', 'in_trattativa'].includes(a.stato) ? `è in stato «${a.stato}»` : null,
    a.bozze ? `ha ${a.bozze} bozze` : null,
    a.servizi ? `ha ${a.servizi} servizi configurati` : null,
    a.messaggi ? `ha ${a.messaggi} messaggi` : null,
  ].filter(Boolean);

  if (motivi.length) {
    return NextResponse.json(
      {
        errore:
          `«${a.nome}» non si cancella perché ${motivi.join(', ')}. ` +
          'Per toglierla di mezzo senza perdere niente, mettila in stato «archiviata».',
      },
      { status: 409 }
    );
  }

  await query(`DELETE FROM wesion.azienda WHERE id = $1`, [aziendaId]);
  return NextResponse.json({ cancellata: a.nome });
}
