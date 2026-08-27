/**
 * Il calendario: cosa esce questa settimana, su TUTTI i clienti.
 *
 * ⚠️ È LA VISTA CHE SI APRE LA MATTINA, e finora non esisteva. C'era il piano,
 * ma per un cliente per volta: con quindici clienti vuol dire aprire quindici
 * pagine per sapere cosa succede oggi — cioè non saperlo.
 *
 * COSA MOSTRA E PERCHÉ:
 *
 *   I GIORNI VUOTI SI VEDONO. Un giovedì in cui non esce niente da nessuna
 *   parte è un'informazione, non uno spazio da comprimere: è il buco che il
 *   cliente noterebbe guardando la sua pagina. Nascondendolo si perde
 *   esattamente la cosa che serviva vedere.
 *
 *   QUELLO CHE ASPETTA UNA PERSONA STA IN CIMA. Un post «da approvare» con la
 *   data di oggi non esce finché qualcuno non dice sì: è l'unica coda che si
 *   ferma da sola, e va guardata prima di tutto il resto.
 *
 *   QUELLO CHE È RIMASTO INDIETRO SI VEDE COL SUO NOME. Approvato, data
 *   passata, mai uscito: vuol dire che il router non ha letto. È il guasto più
 *   caro dell'impianto ed è muto per costruzione — qui almeno si vede.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { Calendario, type GiornoCalendario, type VoceCalendario } from '@/componenti/Calendario';
import { giornoRoma } from '@/lib/quando';

export const dynamic = 'force-dynamic';

/** Il lunedì della settimana che contiene questa data, in ora italiana. */
function lunedi(d: Date): Date {
  const g = new Date(d);
  // getDay(): 0 è domenica. In Italia la settimana comincia di lunedì, e uno
  // scarto qui sposterebbe tutta la griglia di un giorno.
  const scarto = (g.getDay() + 6) % 7;
  g.setDate(g.getDate() - scarto);
  g.setHours(0, 0, 0, 0);
  return g;
}

export default async function PaginaCalendario({
  searchParams,
}: {
  searchParams: Promise<{ da?: string }>;
}) {
  const p = await searchParams;
  const inizio = p.da ? lunedi(new Date(p.da)) : lunedi(new Date());
  const fine = new Date(inizio);
  fine.setDate(fine.getDate() + 7);

  const voci = await query<VoceCalendario>(
    `SELECT b.id, b.tipo, b.stato, b.pubblica_at, b.scade_at,
            a.id AS azienda_id, a.nome AS azienda,
            b.contenuto->>'titolo' AS titolo,
            b.contenuto->>'testo'  AS testo,
            EXISTS (SELECT 1 FROM wesion.pubblicazione x
                     WHERE x.bozza_id = b.id AND x.esito = 'ok')     AS uscita,
            EXISTS (SELECT 1 FROM wesion.pubblicazione x
                     WHERE x.bozza_id = b.id AND x.esito = 'errore') AS fallita,
            -- CASE e non FILTER: FILTER vale solo per le funzioni di
            -- aggregazione, e jsonb_array_length non lo e'. Il controllo sul
            -- tipo serve perche' su una riga vecchia avvisi puo' non essere
            -- un array, e la funzione andrebbe in errore invece di dare zero.
            CASE WHEN jsonb_typeof(b.avvisi) = 'array'
                 THEN jsonb_array_length(b.avvisi) ELSE 0 END AS quanti_avvisi
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      -- COALESCE perche' i due tipi usano due colonne diverse, e apposta:
      -- pubblica_at e' "non prima" (il piano), scade_at e' "non dopo" (il
      -- menu del giorno, che vale quindici minuti).
      WHERE COALESCE(b.pubblica_at, b.scade_at) >= $1
        AND COALESCE(b.pubblica_at, b.scade_at) <  $2
      ORDER BY COALESCE(b.pubblica_at, b.scade_at), a.nome`,
    [inizio.toISOString(), fine.toISOString()]
  );

  /**
   * Rimasti indietro: approvati, data passata, mai usciti.
   *
   * Si cercano FUORI dalla finestra della settimana, apposta: il guasto tipico
   * è di tre giorni fa, e guardandolo solo dentro la settimana corrente lo si
   * perderebbe ogni lunedì mattina — che è esattamente quando serve saperlo.
   */
  const indietro = await query<VoceCalendario>(
    `SELECT b.id, b.tipo, b.stato, b.pubblica_at, b.scade_at,
            a.id AS azienda_id, a.nome AS azienda,
            b.contenuto->>'titolo' AS titolo,
            b.contenuto->>'testo'  AS testo,
            false AS uscita, false AS fallita, 0 AS quanti_avvisi
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.stato = 'approvata'
        AND COALESCE(b.pubblica_at, b.approvata_at) < now() - INTERVAL '30 minutes'
        AND NOT EXISTS (SELECT 1 FROM wesion.pubblicazione x
                         WHERE x.bozza_id = b.id AND x.esito = 'ok')
      ORDER BY COALESCE(b.pubblica_at, b.approvata_at)
      LIMIT 20`
  );

  // Tutti e sette i giorni, anche quelli vuoti: un giorno senza niente è
  // un'informazione, non uno spazio da togliere.
  const giorni: GiornoCalendario[] = [];
  for (let i = 0; i < 7; i++) {
    const g = new Date(inizio);
    g.setDate(g.getDate() + i);
    // ⚠️ `giornoRoma` e non `toISOString().slice(0,10)`: su una mezzanotte
    // italiana quest'ultimo restituisce il giorno PRIMA, e le colonne
    // timestamptz tornano come Date e non come stringhe. Due bug che insieme
    // facevano dire "non esce niente" a una settimana piena.
    const chiave = giornoRoma(g);
    giorni.push({
      data: g.toISOString(),
      voci: voci.filter((v) => giornoRoma(v.pubblica_at ?? v.scade_at) === chiave),
    });
  }

  return (
    <Telaio attiva="/calendario">
      <Calendario
        giorni={giorni}
        indietro={indietro}
        inizio={inizio.toISOString()}
        oggi={giornoRoma(new Date())}
      />
    </Telaio>
  );
}
