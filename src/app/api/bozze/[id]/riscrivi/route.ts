/**
 * Rifarlo scrivere — e poter tornare a quello di prima.
 *
 * ⚠️ IL BUCO CHE CHIUDE (16/09/2026). Su una bozza già scritta ma non ancora
 * uscita le strade erano due: correggerla a mano, o cancellarla e rifarla da
 * capo con «+ Post al volo». Cioè, per cambiare un testo che non convince,
 * buttare via anche la data, il fatto su cui si regge e l'aggancio allo slot
 * del piano — tutte cose che andavano bene.
 *
 * `POST` senza corpo: rigenera, mettendo da parte il testo di adesso.
 * `POST {"annulla": true}`: rimette quello di prima.
 *
 * ⚠️ NON TOCCA QUELLO CHE È PARTITO. `approvata` è già in mano al router,
 * `pubblicata` è nel mondo: là non si riscrive, si corregge dove è andata a
 * finire. La guardia vera sta in `scriviBozza` (stati ammessi) e nel WHERE qui
 * sotto, non nel bottone: fra il disegno del bottone e il click può passare il
 * giro dei trenta secondi.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { scriviBozza } from '@/lib/scrivi';

const RISCRIVIBILI = ['vuota', 'generata', 'attesa_approvazione'];

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isSafeInteger(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const corpo = (await richiesta.json().catch(() => ({}))) as { annulla?: boolean };

  if (corpo.annulla) {
    /**
     * Rimettere il testo di prima, con chi l'aveva scritto.
     *
     * Il `modello` torna a quello di allora e non resta 'mano': dire che l'ha
     * scritto una persona quando il testo è quello del modello sarebbe la
     * stessa bugia di prima, al contrario.
     */
    const [tornata] = await query<{ id: number }>(
      `WITH prima AS (
         UPDATE wesion.bozza
            SET contenuto = (contenuto - 'testo_prima')
                            || jsonb_build_object('testo', contenuto->>'testo_prima'),
                modello = NULLIF(contenuto->>'scritto_prima_da', 'nessuno')
          WHERE id = $1
            AND stato = ANY($2)
            AND contenuto ? 'testo_prima'
          RETURNING id, azienda_id, tipo
       ), tracciata AS (
         INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
         SELECT azienda_id, 'bozza_testo_ripristinato', 'dashboard',
                jsonb_build_object('bozza_id', id, 'tipo', tipo)
           FROM prima
         RETURNING id
       )
       SELECT p.id, (SELECT count(*) FROM tracciata) AS tracciati FROM prima p`,
      [bozzaId, RISCRIVIBILI]
    );

    if (!tornata) {
      return NextResponse.json(
        { errore: 'Non c’è un testo di prima da rimettere, o questa bozza è già partita.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ id: tornata.id, ripristinato: true });
  }

  try {
    const esito = await scriviBozza(bozzaId, { riscrivi: true });
    return NextResponse.json(esito);
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json({ errore: motivo }, { status: 400 });
  }
}
