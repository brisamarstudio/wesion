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
import { scriviBozzaSocial } from './scrivi-social';

interface BozzaDaScrivere {
  id: string | number;
  azienda_id: string | number;
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
async function categorieBlog(aziendaId: string | number): Promise<string[]> {
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
/**
 * La zona di QUESTO post, a giro.
 *
 * ⚠️ UNA SOLA, E SEMPRE LA STESSA PER QUESTA BOZZA (16/09/2026). Il titolare di
 * Artigiano il Conte ha messo diciotto comuni nelle «zone servite» della sua
 * scheda Google: infilarli tutti in un post lo trasforma in un volantino, e
 * sceglierne uno a caso vorrebbe dire che lo stesso post, riscritto, parla di un
 * paese diverso. L'id della bozza è stabile, quindi un piano del mese gira sui
 * comuni invece di ripetere il capoluogo diciotto volte.
 *
 * Le zone vengono dalla scheda del cliente, non da un modello: nominarle è
 * sicuro, è lui che ha detto a Google di lavorare lì.
 */
function zonaDelPost(bozza: BozzaDaScrivere, m: Materia): string {
  if (!m.zone.length) return '';
  const n = Number(bozza.id);
  const i = Number.isFinite(n) ? Math.abs(n) % m.zone.length : 0;
  return m.zone[i]?.valore ?? '';
}

export function prompt(bozza: BozzaDaScrivere, m: Materia): string {
  const c = bozza.contenuto;
  const dove = bozza.citta ? `, a ${bozza.citta}` : '';
  const zona = zonaDelPost(bozza, m);

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
    /**
     * Il posto, quando c'è.
     *
     * ⚠️ «Se serve al discorso» e non «citala»: un post sui materiali che si apre
     * con «a Casarile il legno...» suona come una targa, non come una frase. E il
     * divieto sotto è il solito: la zona è un dato (lavora lì), i tempi e i costi
     * PER quella zona no — quelli non ce li ha detti nessuno.
     */
    zona
      ? `

LA ZONA di questo post: ${zona}. Nominala se serve al discorso, una volta sola e in modo naturale. Non elencare gli altri comuni. Non promettere tempi, costi o disponibilità specifici per quella zona: non li sappiamo.`
      : '',
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
  bozzaId: string | number;
  testo: string;
  modello: string;
  ms: number;
  avvisiGravi: number;
}

/**
 * Gli stati da cui si può (ri)scrivere. Mai `approvata` e mai `pubblicata`:
 * quello che è già partito non si riscrive, si corregge dove è andato.
 */
const RISCRIVIBILI = ['vuota', 'generata', 'attesa_approvazione'];

/**
 * Mette da parte il testo di adesso, prima di coprirlo.
 *
 * ⚠️ SI CHIAMA DOPO CHE IL MODELLO HA RISPOSTO, mai prima: se la generazione
 * fallisce non deve restare in giro un «testo di prima» che non è stato
 * sostituito da niente.
 */
async function metteDaParte(bozzaId: string | number): Promise<void> {
  await query(
    `UPDATE wesion.bozza
        SET contenuto = contenuto || jsonb_build_object(
              'testo_prima', COALESCE(contenuto->>'testo', ''),
              'scritto_prima_da', COALESCE(modello, 'nessuno'))
      WHERE id = $1`,
    [bozzaId]
  );
}

/**
 * Scrive il testo di una bozza vuota e la mette in attesa di approvazione.
 *
 * Rifiuta di lavorare su una bozza che non sia `vuota`: rigenerare sopra un
 * testo che qualcuno ha già corretto a mano è il modo migliore per fargli
 * buttare via mezz'ora senza accorgersene.
 *
 * ⚠️ `riscrivi: true` toglie quella guardia, e lo fa a una condizione: il
 * testo di prima si mette da parte in `contenuto.testo_prima`, con chi l'aveva
 * scritto. Nasce dal buco trovato il 16/09/2026 — su un post già scritto ma
 * non ancora uscito le strade erano due, correggerlo a mano o cancellarlo e
 * rifarlo. Ma la guardia di sopra resta vera: un rigenerato che copre il lavoro
 * di una persona va bene solo se quella persona può tornare indietro.
 */
export async function scriviBozza(
  bozzaId: string | number,
  opzioni: { riscrivi?: boolean } = {}
): Promise<EsitoScrittura> {
  const [bozza] = await query<BozzaDaScrivere>(
    `SELECT b.id, b.azienda_id, b.tipo, b.stato, b.contenuto, a.nome AS azienda, a.citta
       FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.id = $1`,
    [bozzaId]
  );
  if (!bozza) throw new Error(`bozza ${bozzaId} inesistente`);
  const ammessi = opzioni.riscrivi ? RISCRIVIBILI : ['vuota'];
  if (!ammessi.includes(bozza.stato)) {
    throw new Error(
      opzioni.riscrivi
        ? `La bozza ${bozzaId} è "${bozza.stato}": è già partita, e quello che è partito non si riscrive da qui.`
        : `La bozza ${bozzaId} non è vuota (è "${bozza.stato}"): non la riscrivo sopra.`
    );
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
    // (lo stash sta sotto, dopo che il modello ha risposto)
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
    if (opzioni.riscrivi) await metteDaParte(bozzaId);

    await query(
      `UPDATE wesion.bozza
          SET contenuto = contenuto || jsonb_build_object(
                'testo', $2::text, 'titolo', $3::text, 'sommario', $4::text,
                'categoria', $5::text,
                -- COALESCE: se lo slug c'e' gia' si tiene quello. Rigenerare una
                -- bozza non deve poter cambiare l'indirizzo di un articolo.
                'slug', COALESCE(contenuto->>'slug', $6::text)),
              avvisi = $7::jsonb, modello = $8, stato = 'attesa_approvazione'
        WHERE id = $1 AND stato = ANY($9)`,
      [bozzaId, art.corpo, art.titolo, art.sommario, art.categoria, art.slug, JSON.stringify(avvisiArt), art.modello, ammessi]
    );

    return {
      bozzaId,
      testo: art.corpo,
      modello: art.modello,
      ms: art.ms,
      avvisiGravi: avvisiArt.filter((a) => a.gravita === 'grave').length,
    };
  }

  if (bozza.tipo === 'social') {
    const soc = await scriviBozzaSocial(bozza);
    const avvisiSoc = controllaBozza(bozza.tipo, soc.testo, fattiVeri(materia));
    if (opzioni.riscrivi) await metteDaParte(bozzaId);

    await query(
      `UPDATE wesion.bozza
          SET contenuto = contenuto || $2::jsonb,
              avvisi    = $3::jsonb,
              modello   = $4,
              stato     = 'attesa_approvazione'
        WHERE id = $1 AND stato = ANY($5)`,
      [bozzaId, JSON.stringify(soc.contenutoSocial), JSON.stringify(avvisiSoc), soc.modello, ammessi]
    );

    return {
      bozzaId,
      testo: soc.testo,
      modello: soc.modello,
      ms: soc.ms,
      avvisiGravi: avvisiSoc.filter((a) => a.gravita === 'grave').length,
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
  if (opzioni.riscrivi) await metteDaParte(bozzaId);

  await query(
    `UPDATE wesion.bozza
        SET contenuto = contenuto || jsonb_build_object('testo', $2::text),
            avvisi    = $3::jsonb,
            modello   = $4,
            stato     = 'attesa_approvazione'
      WHERE id = $1 AND stato = ANY($5)`,
    [bozzaId, esito.testo, JSON.stringify(avvisi), esito.modello, ammessi]
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
export async function scriviTutte(aziendaId: string | number, massimo = 20): Promise<EsitoScrittura[]> {
  const vuote = await query<{ id: string | number }>(
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
