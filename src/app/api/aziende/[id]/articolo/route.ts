/**
 * Un articolo per il blog del cliente.
 *
 * ⚠️ PERCHE' NON C'ERA (scoperto il 31/08/2026, provando il giro intero).
 * `scrivi.ts` sa scrivere un articolo — titolo, sommario, categoria, slug e
 * corpo in una chiamata sola — e `pubblica.ts` sa pubblicarlo. Ma NESSUNO
 * creava mai una bozza di tipo 'articolo': il piano del mese produce solo
 * `post_gbp`, quattro a settimana. L'unico articolo mai esistito, quello della
 * Trattoria La Fenice, era stato scritto in tabella a mano con una INSERT.
 * Metà catena esisteva e non aveva un ingresso.
 *
 * QUI SI CREA VUOTA, NON SCRITTA. La bozza nasce `stato='vuota'` col fatto su
 * cui si reggerà, e il testo lo mette `/api/bozze/<id>/scrivi`. Sono due passi
 * apposta, gli stessi del piano: se il fatto scelto è sbagliato lo vedi subito,
 * invece di leggere seicento parole per scoprirlo alla fine.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const corpo = (await richiesta.json().catch(() => ({}))) as {
    fattoId?: number;
    angolo?: string;
    titolo?: string;
  };

  /**
   * Il fatto su cui si regge l'articolo.
   *
   * Se non lo si sceglie, si prende quello che di solito porta più lontano: un
   * punto di forza. È la differenza fra «cosa vendiamo» (che sanno tutti) e
   * «perché noi» (che è l'unica cosa che si può raccontare per seicento parole
   * senza ripetersi). Se non ce ne sono, va bene qualunque fatto attivo.
   */
  const [fatto] = corpo.fattoId
    ? await query<{ id: number; valore: string }>(
        `SELECT id, valore FROM wesion.fatto WHERE id = $1 AND azienda_id = $2 AND attivo`,
        [corpo.fattoId, aziendaId]
      )
    : await query<{ id: number; valore: string }>(
        `SELECT id, valore FROM wesion.fatto
          WHERE azienda_id = $1 AND attivo
          ORDER BY CASE chiave WHEN 'punti_forza' THEN 0 WHEN 'cosa_fa' THEN 1 ELSE 2 END, id
          LIMIT 1`,
        [aziendaId]
      );

  if (!fatto) {
    return NextResponse.json(
      {
        errore:
          'Questo cliente non ha nemmeno un fatto attivo: un articolo scritto senza niente di vero è esattamente quello che non vogliamo pubblicare. Riempi «Cosa è vero» nella scheda.',
      },
      { status: 409 }
    );
  }

  const [bozza] = await query<{ id: number }>(
    `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato)
     VALUES ($1, 'articolo', 'manuale', $2, $3::jsonb, 'vuota')
     RETURNING id`,
    [
      aziendaId,
      fatto.id,
      JSON.stringify({
        fatto: fatto.valore,
        angolo:
          corpo.angolo?.trim() ||
          'Spiega questo fatto a chi non ci conosce: cosa vuol dire in concreto, perché è così, e cosa cambia per chi ci lavora insieme.',
        ...(corpo.titolo?.trim() ? { titolo: corpo.titolo.trim() } : {}),
      }),
    ]
  );

  return NextResponse.json({ bozzaId: bozza.id, fatto: fatto.valore }, { status: 201 });
}
