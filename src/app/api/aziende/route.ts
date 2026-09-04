/**
 * Aggiungere un'azienda che lo scraper non ha trovato.
 *
 * Fino al 31/08/2026 questa porta non c'era: le aziende nascevano solo da una
 * campagna Apify. Chi arrivava per telefono o per passaparola non aveva modo di
 * entrare nello strumento, e noi stessi nemmeno.
 *
 * Le regole sono in `lib/anagrafica.ts` e non qui, perche' le condivide con il
 * salvataggio della scheda: due copie che si scostano vorrebbero dire un numero
 * normalizzato in due modi, cioe' un router che non riconosce piu' il titolare.
 */
import { NextResponse } from 'next/server';
import { creaAzienda, type DatiAzienda } from '@/lib/anagrafica';
import { query } from '@/lib/db';

/**
 * L'elenco delle aziende, per chi deve sceglierne una da un menu a tendina.
 *
 * Serviva gia' a ModaleNuovoPost, che la chiedeva a questa rotta: ma qui
 * c'era solo la POST, quindi la fetch falliva in silenzio e il selettore del
 * cliente spariva, lasciando la modale in un vicolo cieco.
 */
export async function GET(richiesta: Request) {
  const stato = new URL(richiesta.url).searchParams.get('stato');

  try {
    const righe = await query<{ id: number; nome: string; stato: string; citta: string | null }>(
      `SELECT id, nome, stato, citta
         FROM wesion.azienda
        ${stato ? 'WHERE stato = $1' : ''}
        ORDER BY nome`,
      stato ? [stato] : []
    );

    return NextResponse.json(righe);
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : 'elenco aziende non disponibile' },
      { status: 500 }
    );
  }
}

export async function POST(richiesta: Request) {
  let corpo: DatiAzienda;
  try {
    corpo = (await richiesta.json()) as DatiAzienda;
  } catch {
    return NextResponse.json({ errore: 'corpo della richiesta non leggibile' }, { status: 400 });
  }

  try {
    const esito = await creaAzienda(corpo);
    /**
     * 200 e non 201 quando il Place ID c'era gia': non abbiamo creato niente,
     * abbiamo ritrovato. Chi chiama deve poter distinguere le due cose senza
     * leggere il testo di un messaggio.
     */
    return NextResponse.json(esito, { status: esito.giaEsisteva ? 200 : 201 });
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : String(errore) },
      { status: 400 }
    );
  }
}
