/**
 * Il piano del mese — deterministico, senza AI.
 *
 * Decide QUANDO si pubblica e DI COSA si parla. Non scrive niente: il testo
 * arriva dopo, e solo sugli slot che qualcuno ha guardato.
 *
 * PERCHÉ SEPARARE. Se il piano è sbagliato — tre post di fila sullo stesso
 * tema, una ricorrenza che col cliente non c'entra — lo si vede in dieci secondi
 * guardando una griglia. Accorgersene leggendo trenta testi già generati costa
 * molto di più, e a quel punto si è tentati di tenerli buoni perché sono lì.
 *
 * È anche il motivo per cui `bozza.stato` ha il valore `'vuota'` e per cui
 * `bozza.fatto_id` esiste: erano stati previsti per questo.
 *
 * Deterministico anche in un altro senso: stesso cliente e stesso mese danno
 * sempre lo stesso piano. Niente casualità che renda impossibile capire perché
 * oggi è uscito diverso da ieri.
 */

import { query } from './db';
import { daFonte, type Materia } from './materia';
import { ricorrenzeDelMese, type TagAttivita } from './ricorrenze';
import { pilastriDisponibili, type Pilastro } from './pilastri';

export interface SlotPiano {
  /** L'istante di pubblicazione, ISO completo di fuso. */
  data: string;
  origine: 'ricorrenza' | 'pilastro';
  /** Titolo di lavorazione, non il testo del post. */
  titolo: string;
  /** Cosa deve fare il post. */
  angolo: string;
  /** Il fatto su cui si regge: è ciò che rende la revisione "è vero?". */
  fatto: string;
  /** Da quale fonte viene. */
  fonte: string;
  /** La riga di `fatto`, quando ce n'è una: finisce in `bozza.fatto_id`. */
  fattoId: number | null;
}

export interface EsitoPiano {
  slot: SlotPiano[];
  /** Problemi che rendono il piano più povero di quanto dovrebbe. */
  avvisi: string[];
}

export interface OpzioniPiano {
  anno: number;
  /** 1-12. */
  mese: number;
  /** Quanti post nel mese. Il bundle ne vende 4 a settimana. */
  quantita?: number;
  /** Ora di pubblicazione, per non affastellare tutto a mezzanotte. */
  ora?: number;
}

/**
 * Quanti post in un mese per tenere il ritmo di N a settimana.
 *
 * Il bundle vende "4 post a settimana", che non è un numero mensile: a
 * seconda del mese sono 16, 17 o 18. Contarli sui giorni veri invece di
 * scrivere 16 fisso evita il mese in cui il cliente ne riceve meno di quelli
 * che ha pagato — e nessuno se ne accorge, perché mancano solo in fondo.
 */
export function postPerMese(anno: number, mese: number, aSettimana = 4): number {
  const giorni = new Date(anno, mese, 0).getDate();
  return Math.round((giorni / 7) * aSettimana);
}

/**
 * Tutti i giorni del mese.
 *
 * Qui gbp-autoposter prima escludeva le domeniche, per l'idea che di domenica
 * legga meno gente. Era sbagliato per due motivi: Pasqua cade di domenica per
 * definizione e finiva spostata al sabato, e per un ristorante la domenica è il
 * giorno che conta di più. Una scheda Google non è un feed social: non c'è un
 * orario furbo, c'è la data giusta.
 */
function giorniUtili(anno: number, mese: number): number[] {
  const ultimo = new Date(anno, mese, 0).getDate();
  return Array.from({ length: ultimo }, (_, i) => i + 1);
}

/**
 * L'istante in cui il post deve uscire, come stringa ISO completa di fuso.
 *
 * ⚠️ In gbp-autoposter qui si restituiva "2026-08-05T10:00", senza fuso. Quella
 * stringa finiva dritta in un INSERT su una colonna timestamptz senza passare da
 * un oggetto Date: a interpretarla era quindi Postgres, che su Neon lavora in
 * UTC. Le 10:00 pensate come ora italiana venivano salvate come 10:00 UTC, cioè
 * pubblicate alle 12:00 d'estate e alle 11:00 d'inverno — in silenzio, e con
 * uno scarto diverso a seconda dell'ora legale.
 */
function iso(anno: number, mese: number, giorno: number, ora: number): string {
  return new Date(anno, mese - 1, giorno, ora, 0, 0).toISOString();
}

/**
 * Costruisce il piano di un mese.
 *
 * Le ricorrenze pertinenti prendono il loro giorno; il resto si riempie con i
 * pilastri distribuiti a distanza regolare. I pilastri sono la spina dorsale e
 * le ricorrenze il condimento: il peso delle ricorrenze è limitato a metà del
 * mese, altrimenti un dicembre diventa una fila di cartoline di auguri.
 */
export function costruisciPiano(materia: Materia, opzioni: OpzioniPiano): EsitoPiano {
  const { anno, mese, quantita = postPerMese(anno, mese), ora = 10 } = opzioni;
  const avvisi: string[] = [];

  const settori: TagAttivita[] = materia.settore.length ? materia.settore : [];
  if (!settori.length) {
    avvisi.push(
      'Settore non indicato: si usano solo i temi validi per tutti, e il piano esce generico. Si imposta su `azienda.settore`.'
    );
  }

  const pilastri = pilastriDisponibili(materia, settori);
  if (!pilastri.length) {
    avvisi.push(
      'Nessun tema disponibile: la materia prima è troppo vuota per generare contenuti non generici. Servono dei fatti.'
    );
    return { slot: [], avvisi };
  }

  const suoi = new Set<TagAttivita>([...settori, 'tutti']);
  const ricorrenze = ricorrenzeDelMese(anno, mese).filter((r) => r.tag.some((t) => suoi.has(t)));

  const utili = giorniUtili(anno, mese);
  const massimoRicorrenze = Math.floor(quantita / 2);

  const presi = new Set<number>();
  const slot: SlotPiano[] = [];

  // 1. Le ricorrenze pertinenti, ciascuna al suo giorno.
  let giroRicorrenza = 0;
  for (const r of ricorrenze.slice(0, massimoRicorrenze)) {
    // La ricorrenza tiene la sua data, sempre: spostare un post di Ferragosto
    // al 14 o al 16 lo rende una cosa diversa.
    //
    // ⚠️ Ma due ricorrenze possono cadere lo stesso giorno: il 21 marzo ci sono
    // sia "Giornata delle foreste" sia "Inizio primavera", coi tag che si
    // sovrappongono. Senza questo controllo un cliente di quei settori si
    // ritrovava due post alla stessa ora dello stesso giorno, ogni anno.
    const giorno = r.giorno[1];
    if (presi.has(giorno)) continue;
    presi.add(giorno);
    slot.push({
      data: iso(anno, mese, giorno, ora),
      origine: 'ricorrenza',
      titolo: r.nome,
      angolo: r.angolo,
      ...materiaPerRicorrenza(materia, giroRicorrenza++),
    });
  }

  // 2. Il resto con i pilastri, a distanza regolare sui giorni ancora liberi.
  const mancanti = Math.max(0, quantita - slot.length);
  const liberi = utili.filter((g) => !presi.has(g));

  if (mancanti > liberi.length) {
    avvisi.push(
      `Richiesti ${quantita} post ma il mese offre ${slot.length + liberi.length} giorni: ne verranno pianificati meno.`
    );
  }

  const passo = mancanti > 0 ? liberi.length / mancanti : 0;
  for (let i = 0; i < Math.min(mancanti, liberi.length); i++) {
    const giorno = liberi[Math.floor(i * passo)];
    // Rotazione: si scorrono i pilastri in ordine, così due post vicini non
    // parlano mai della stessa cosa e il mese copre temi diversi.
    const pilastro = pilastri[i % pilastri.length];
    slot.push({
      data: iso(anno, mese, giorno, ora),
      origine: 'pilastro',
      titolo: pilastro.nome,
      angolo: pilastro.angolo,
      ...materiaPerPilastro(materia, pilastro, Math.floor(i / pilastri.length)),
    });
  }

  if (pilastri.length < 4) {
    avvisi.push(`Solo ${pilastri.length} temi disponibili: aggiungi fatti, o i post si somiglieranno.`);
  }

  slot.sort((a, b) => a.data.localeCompare(b.data));
  return { slot, avvisi };
}

/**
 * Per una ricorrenza si aggancia un fatto pertinente, RUOTANDO.
 *
 * ⚠️ gbp-autoposter prendeva sempre `voci[0]`. Su un dicembre con quattro
 * ricorrenze — Immacolata, Vigilia, Natale, San Silvestro — usciva quattro
 * volte lo stesso fatto: quattro post di fila sul medesimo piatto, nel mese in
 * cui il cliente e' piu' guardato. Visto succedere il 27/08/2026 costruendo il
 * primo piano di prova qui dentro.
 *
 * Si mettono in fila tutte le fonti buone e si scorre: due ricorrenze vicine
 * non si reggono mai sulla stessa cosa finche' c'e' materia.
 */
function materiaPerRicorrenza(m: Materia, giro: number): { fatto: string; fonte: string; fattoId: number | null } {
  const disponibili: Array<{ fonte: string; voce: { id: number | null; valore: string } }> = [];
  for (const fonte of ['offerta', 'punti_forza', 'materiali', 'apprezzato'] as const) {
    for (const voce of daFonte(m, fonte)) disponibili.push({ fonte, voce });
  }
  if (!disponibili.length) {
    return { fatto: m.cosa_fa?.valore ?? '', fonte: 'cosa_fa', fattoId: m.cosa_fa?.id ?? null };
  }
  const scelta = disponibili[giro % disponibili.length];
  return { fatto: scelta.voce.valore, fonte: scelta.fonte, fattoId: scelta.voce.id };
}

/** Il fatto specifico del pilastro, ruotando dentro la lista di origine. */
function materiaPerPilastro(
  m: Materia,
  p: Pilastro,
  giro: number
): { fatto: string; fonte: string; fattoId: number | null } {
  const voci = daFonte(m, p.fonte);
  const scelta = voci[giro % voci.length] ?? voci[0];
  return { fatto: scelta?.valore ?? '', fonte: p.fonte, fattoId: scelta?.id ?? null };
}

/**
 * Scrive il piano come bozze VUOTE.
 *
 * Vuote apposta: `stato='vuota'` vuol dire "questo slot esiste, il testo no".
 * La griglia si guarda e si corregge prima che si spenda una sola chiamata al
 * modello — che è tutto il punto della separazione.
 *
 * Idempotente sul mese: rilanciarlo cancella gli slot ancora vuoti e li
 * riscrive. NON tocca quello che è già stato generato, approvato o pubblicato:
 * rifare il piano di un mese in corso non deve poter far sparire un post che
 * il cliente ha già visto.
 */
export async function salvaPiano(
  aziendaId: number,
  slot: SlotPiano[],
  anno: number,
  mese: number
): Promise<{ creati: number; rimossi: number }> {
  const inizio = new Date(anno, mese - 1, 1).toISOString();
  const fine = new Date(anno, mese, 1).toISOString();

  const rimossi = await query<{ id: number }>(
    `DELETE FROM wesion.bozza
      WHERE azienda_id = $1 AND tipo = 'post_gbp' AND origine = 'piano' AND stato = 'vuota'
        AND pubblica_at >= $2 AND pubblica_at < $3
      RETURNING id`,
    [aziendaId, inizio, fine]
  );

  let creati = 0;
  for (const s of slot) {
    /**
     * `pubblica_at` e non `scade_at`.
     *
     * ⚠️ La prima versione di questo file usava `scade_at`, ed era un errore
     * che sarebbe stato silenzioso: quella colonna vuol dire "dopo questo
     * istante NON pubblicare", e il giro del router pubblica tutto cio' che e'
     * approvato e non ancora scaduto. Un post programmato per Natale e
     * approvato a settembre sarebbe uscito a settembre, senza nessun errore.
     *
     * Due colonne, due significati opposti: `pubblica_at` non prima,
     * `scade_at` non dopo. Uno slot del piano non scade — se nessuno lo approva
     * resta li' da approvare.
     */
    await query(
      `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato, pubblica_at)
       VALUES ($1, 'post_gbp', 'piano', $2, $3, 'vuota', $4)`,
      [
        aziendaId,
        s.fattoId,
        JSON.stringify({ titolo: s.titolo, angolo: s.angolo, fatto: s.fatto, fonte: s.fonte, origine_slot: s.origine }),
        s.data,
      ]
    );
    creati++;
  }

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'piano_costruito', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ anno, mese, creati, rimossi: rimossi.length })]
  );

  return { creati, rimossi: rimossi.length };
}
