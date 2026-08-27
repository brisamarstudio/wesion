/**
 * Da slot vuoto a testo da approvare.
 *
 * È l'ultimo anello: il piano ha già deciso quando si pubblica e di cosa si
 * parla, qui si scrive. Una bozza per volta, e solo su richiesta — non c'è
 * nessun automatismo che generi 270 testi mentre nessuno guarda.
 *
 * COSA ENTRA NEL PROMPT, E PERCHÉ IN QUEST'ORDINE:
 *
 *   IL FATTO      da cui il post deve nascere, scelto dal piano. È l'unica cosa
 *                 che il post può affermare, ed è ciò che rende la revisione
 *                 "è vero?" invece di "è bello?".
 *   LA VOCE       come parla il cliente, le sue parole, quelle da evitare.
 *   I CONFINI     `non_fa` e `mai_dire`: i divieti suoi, che valgono su Google
 *                 come sul sito, più i DIVIETI_BASE che valgono per tutti.
 *   LE REGOLE     quelle di Google, pagate col post rimosso il 20/07/2026.
 *
 * Il testo generato viene RILETTO da `controllaBozza` e gli avvisi si salvano
 * con lui. Non blocca niente: un falso positivo che blocca il lavoro viene
 * disattivato entro una settimana, e allora tanto vale non averlo.
 */

import { query } from './db';
import { controllaBozza } from './controlloTesto';
import { scriviArticolo } from './articolo';
import { genera } from './generatore';
import { leggiMateria, type Materia } from './materia';
import { voceDi } from './materia';
import { DIVIETI_BASE, REGOLE_CRITICHE, SISTEMA_COPYWRITER } from './regolePost';
import { vocePerPrompt } from './voce';

interface BozzaDaScrivere {
  id: number;
  azienda_id: number;
  azienda: string;
  citta: string | null;
  tipo: string;
  stato: string;
  contenuto: Record<string, unknown>;
}

/**
 * Le categorie che il blog di questo cliente usa gia'.
 *
 * Si passano al generatore perche' scelga fra quelle invece di inventarne una
 * nuova a ogni articolo: un blog con quindici categorie da un pezzo ciascuna
 * non raggruppa niente, e le etichette non si possono riordinare a posteriori
 * senza cambiare gli URL che le usano.
 */
async function categorieBlog(aziendaId: number): Promise<string[]> {
  const [riga] = await query<{ categorie: string | null }>(
    `SELECT config->>'categorie' AS categorie
       FROM wesion.servizio WHERE azienda_id = $1 AND tipo = 'blog'`,
    [aziendaId]
  );
  return String(riga?.categorie ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Tutto cio' che il cliente ci ha confermato, in una lista piatta. */
export function fattiVeri(m: Materia): string[] {
  return [
    m.cosa_fa?.valore ?? '',
    ...m.offerta.map((v) => v.valore),
    ...m.materiali.map((v) => v.valore),
    ...m.punti_forza.map((v) => v.valore),
    ...m.apprezzato.map((v) => v.valore),
  ].filter(Boolean);
}

/** Un elenco puntato, o niente: le righe vuote nel prompt sono rumore. */
function elenco(titolo: string, voci: string[]): string {
  const pulite = voci.map((v) => String(v).trim()).filter(Boolean);
  if (!pulite.length) return '';
  return `\n${titolo}\n${pulite.map((v) => `- ${v}`).join('\n')}`;
}

/**
 * Il prompt per uno slot.
 *
 * Le parole del cliente si mettono DOPO i divieti, di proposito: fino al
 * 25/07/2026 in gbp-autoposter stavano tutte insieme sotto un unico "non
 * citare", e il modello obbediva alla lettera — la voce del cliente non
 * arrivava mai al testo, perché era imbavagliata insieme ai divieti. Sono due
 * cose opposte e vanno dette separate.
 */
export function prompt(bozza: BozzaDaScrivere, m: Materia): string {
  const c = bozza.contenuto;
  const dove = bozza.citta ? `, a ${bozza.citta}` : '';

  const pezzi = [
    `ATTIVITÀ: ${bozza.azienda}${dove}.`,
    m.cosa_fa?.valore ? `In concreto: ${m.cosa_fa.valore}.` : '',

    `\n\nIL FATTO da cui deve nascere questo post${c.fonte ? ` (${c.fonte})` : ''}:\n"${c.fatto ?? ''}"`,
    `\nIL COMPITO: ${c.angolo ?? 'Racconta questo fatto in modo concreto.'}`,
    c.titolo ? `(tema di lavorazione: ${c.titolo})` : '',

    elenco('\nALTRE COSE VERE che puoi usare, se servono al discorso:', [
      ...m.offerta.map((v) => v.valore),
      ...m.materiali.map((v) => v.valore),
      ...m.punti_forza.map((v) => v.valore),
    ]),
    elenco('\nCONFINI DI QUESTA ATTIVITÀ — non contraddirli mai:', m.non_fa),
    elenco('\nNON DIRE MAI, per esplicita richiesta del cliente:', m.mai_dire),
    elenco('\nNON AFFERMARE MAI, qualunque sia il cliente:', DIVIETI_BASE),

    /**
     * ⚠️ LA VOCE VA IN FONDO, DOPO I DIVIETI, E NON È UN CAPRICCIO.
     *
     * `vocePerPrompt` separa tre cose che fino al 25/07/2026 in gbp-autoposter
     * stavano insieme sotto un unico «non citare»: lo SFONDO (che davvero non si
     * cita), le RECENSIONI (che si usano, e sono l'unica cosa verificata da
     * terzi), e le ISTRUZIONI su come scrivere (che vanno seguite). Il modello
     * obbediva alla lettera e le spegneva tutte e tre: la voce arrivava al
     * prompt, ma imbavagliata, e i post uscivano corretti e intercambiabili.
     *
     * Anche il blocco delle recensioni è dentro `vocePerPrompt` e non più qui
     * sopra: là si porta dietro l'istruzione che conta — parlarne dal lato del
     * lavoro, mai citando che qualcuno l'ha detto.
     *
     * In fondo perché è l'ultimo posto che un modello guarda prima di
     * rispondere, ed è la parte che decide se il post suona come lui o come
     * un'agenzia.
     */
    `\n\n${vocePerPrompt(voceDi(m))}`,

    `\n\n${REGOLE_CRITICHE}`,
  ];

  return pezzi.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface EsitoScrittura {
  bozzaId: number;
  testo: string;
  modello: string;
  ms: number;
  avvisiGravi: number;
}

/**
 * Scrive il testo di una bozza vuota e la mette in attesa di approvazione.
 *
 * Rifiuta di lavorare su una bozza che non sia `vuota`: rigenerare sopra un
 * testo che qualcuno ha già corretto a mano è il modo migliore per fargli
 * buttare via mezz'ora senza accorgersene.
 */
export async function scriviBozza(bozzaId: number): Promise<EsitoScrittura> {
  const [bozza] = await query<BozzaDaScrivere>(
    `SELECT b.id, b.azienda_id, b.tipo, b.stato, b.contenuto, a.nome AS azienda, a.citta
       FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.id = $1`,
    [bozzaId]
  );
  if (!bozza) throw new Error(`bozza ${bozzaId} inesistente`);
  if (bozza.stato !== 'vuota') {
    throw new Error(`La bozza ${bozzaId} non è vuota (è "${bozza.stato}"): non la riscrivo sopra.`);
  }

  const materia = await leggiMateria(bozza.azienda_id);

  /**
   * Un articolo non è un post lungo: ha una scheda.
   *
   * Titolo, sommario, categoria e slug si generano INSIEME al corpo, in una
   * chiamata sola: chiederli separatamente darebbe pezzi che non si parlano —
   * un titolo che promette una cosa e un corpo che ne racconta un'altra.
   *
   * ⚠️ Lo slug si scrive UNA VOLTA e poi non si tocca: è la chiave con cui il
   * sito riconosce l'articolo. Ricalcolarlo dal titolo a ogni correzione
   * creerebbe un secondo articolo online, lasciando il primo lì per sempre.
   */
  if (bozza.tipo === 'articolo') {
    const c = bozza.contenuto;
    const categorie = await categorieBlog(bozza.azienda_id);
    const art = await scriviArticolo(
      {
        azienda: bozza.azienda,
        citta: bozza.citta,
        angolo: String(c.angolo ?? 'Racconta questo fatto in modo concreto e utile.'),
        titoloLavorazione: c.titolo ? String(c.titolo) : undefined,
        fatto: c.fatto ? String(c.fatto) : undefined,
        categorie,
      },
      materia
    );

    const avvisiArt = controllaBozza(bozza.tipo, art.corpo, fattiVeri(materia));

    await query(
      `UPDATE wesion.bozza
          SET contenuto = contenuto || jsonb_build_object(
                'testo', $2::text, 'titolo', $3::text, 'sommario', $4::text,
                'categoria', $5::text,
                -- COALESCE: se lo slug c'e' gia' si tiene quello. Rigenerare una
                -- bozza non deve poter cambiare l'indirizzo di un articolo.
                'slug', COALESCE(contenuto->>'slug', $6::text)),
              avvisi = $7::jsonb, modello = $8, stato = 'attesa_approvazione'
        WHERE id = $1 AND stato = 'vuota'`,
      [bozzaId, art.corpo, art.titolo, art.sommario, art.categoria, art.slug, JSON.stringify(avvisiArt), art.modello]
    );

    return {
      bozzaId,
      testo: art.corpo,
      modello: art.modello,
      ms: art.ms,
      avvisiGravi: avvisiArt.filter((a) => a.gravita === 'grave').length,
    };
  }

  const esito = await genera(SISTEMA_COPYWRITER, prompt(bozza, materia));

  /**
   * Riletto subito, ma sapendo cosa e' stato verificato.
   *
   * I fatti del cliente si passano al controllo perche' altrimenti segnalerebbe
   * come inventato cio' che il cliente ci ha confermato: "Marco in sala da 12
   * anni" e' un fatto, non un numero uscito dal modello.
   */
  const avvisi = controllaBozza(bozza.tipo, esito.testo, fattiVeri(materia));

  await query(
    `UPDATE wesion.bozza
        SET contenuto = contenuto || jsonb_build_object('testo', $2::text),
            avvisi    = $3::jsonb,
            modello   = $4,
            stato     = 'attesa_approvazione'
      WHERE id = $1 AND stato = 'vuota'`,
    [bozzaId, esito.testo, JSON.stringify(avvisi), esito.modello]
  );

  return {
    bozzaId,
    testo: esito.testo,
    modello: esito.modello,
    ms: esito.ms,
    avvisiGravi: avvisi.filter((a) => a.gravita === 'grave').length,
  };
}

/**
 * Scrive tutte le bozze vuote di un'azienda, una per volta.
 *
 * IN SERIE E NON IN PARALLELO, apposta. Il piano di un mese sono 18 slot:
 * lanciarli insieme è il modo più rapido per farsi rispondere 429 da un piano
 * gratuito e ritrovarsi metà mese generato e metà no, senza sapere quale metà.
 * In serie ci mette mezzo minuto e non lascia buchi.
 */
export async function scriviTutte(aziendaId: number, massimo = 20): Promise<EsitoScrittura[]> {
  const vuote = await query<{ id: number }>(
    `SELECT id FROM wesion.bozza
      WHERE azienda_id = $1 AND stato = 'vuota'
      ORDER BY pubblica_at NULLS LAST, id
      LIMIT $2`,
    [aziendaId, massimo]
  );

  const fatte: EsitoScrittura[] = [];
  for (const { id } of vuote) {
    try {
      fatte.push(await scriviBozza(id));
    } catch (errore: unknown) {
      // Una che fallisce non ferma le altre: resta `vuota` e si riprova dopo.
      console.error(`[scrivi] bozza ${id}:`, errore instanceof Error ? errore.message : errore);
    }
  }
  return fatte;
}
