/**
 * UN post per la scheda Google, quando serve quello e non un mese intero.
 *
 * ⚠️ PERCHE' NON C'ERA (31/08/2026). L'unica strada per avere un post era
 * «Costruisci il piano del mese»: diciassette bozze in un colpo, distribuite su
 * quattro settimane. Ma il lavoro vero capita anche al contrario — il cliente
 * chiama e dice che domenica fa una serata, o che e' arrivato il pesce fresco,
 * e tu vuoi UN post, per QUEL giorno. Senza questa porta bisognava generare il
 * mese e poi buttare sedici bozze, oppure scrivere in SQL.
 *
 * Vale anche per gli articoli: stessa forma, `tipo` diverso. Le due strade
 * restano una sola perche' cambiano solo il tipo di bozza e il generatore che
 * la scrive dopo — tutto il resto (fatto, angolo, data, approvazione) e' uguale.
 *
 * NASCE VUOTA. Il testo lo mette `/api/bozze/<id>/scrivi`, come per il piano:
 * prima si sceglie SU COSA parla, poi si spende una generazione.
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
    /** YYYY-MM-DD. Assente = esce al primo giro del router. */
    quando?: string;
    tipo?: 'post_gbp' | 'articolo';
  };

  const tipo = corpo.tipo === 'articolo' ? 'articolo' : 'post_gbp';

  const [fatto] = corpo.fattoId
    ? await query<{ id: number; valore: string }>(
        `SELECT id, valore FROM wesion.fatto WHERE id = $1 AND azienda_id = $2 AND attivo`,
        [corpo.fattoId, aziendaId]
      )
    : await query<{ id: number; valore: string }>(
        `SELECT id, valore FROM wesion.fatto
          WHERE azienda_id = $1 AND attivo
          ORDER BY CASE chiave WHEN 'punti_forza' THEN 0 WHEN 'offerta' THEN 1 ELSE 2 END, id
          LIMIT 1`,
        [aziendaId]
      );

  if (!fatto) {
    return NextResponse.json(
      {
        errore:
          'Questo cliente non ha nemmeno un fatto attivo: un post senza niente di vero è quello che non vogliamo pubblicare. Riempi «Cosa è vero» nella scheda.',
      },
      { status: 409 }
    );
  }

  /**
   * ⚠️ L'ORA E' QUELLA DI ROMA, non quella del server.
   *
   * Chi scrive «esce il 12 settembre» intende le dieci del mattino a Vigevano.
   * Costruire la data senza fuso la fa diventare mezzanotte UTC, cioe' le due
   * di notte da noi in estate: il post esce mentre dormono tutti. Le dieci sono
   * la stessa ora che usa il piano del mese.
   */
  const quando = corpo.quando?.trim()
    ? new Date(`${corpo.quando}T10:00:00${mesiEstivi(corpo.quando) ? '+02:00' : '+01:00'}`)
    : null;

  const [bozza] = await query<{ id: number }>(
    `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato, pubblica_at)
     VALUES ($1, $2, 'manuale', $3, $4::jsonb, 'vuota', $5)
     RETURNING id`,
    [
      aziendaId,
      tipo,
      fatto.id,
      JSON.stringify({
        fatto: fatto.valore,
        angolo: corpo.angolo?.trim() || 'Raccontalo in modo concreto e utile a chi legge.',
      }),
      quando,
    ]
  );

  return NextResponse.json({ bozzaId: bozza.id, fatto: fatto.valore, quando }, { status: 201 });
}

/** L'ora legale italiana, senza portarsi dietro una libreria per due mesi. */
function mesiEstivi(iso: string): boolean {
  const mese = Number(iso.slice(5, 7));
  return mese >= 4 && mese <= 10;
}
