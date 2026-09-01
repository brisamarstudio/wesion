/**
 * Ricavare la voce di un cliente da quello che abbiamo già sotto il naso.
 *
 * ⚠️ TRE DOMANDE SEPARATE, NON UNA. È la cosa più importante di questo file.
 *
 * La prima versione in gbp-autoposter metteva descrizione, recensioni e sito in
 * un prompt solo e chiedeva tutto insieme. Sulla prova vera (21/07/2026) è
 * andata male in modo istruttivo: il sito pesava 18.000 caratteri e la
 * descrizione del cliente cinquecento, così il gergo da vetrina ha coperto la
 * voce vera. Fra le «parole sue» sono usciti «prodotti impeccabili», «altissimo
 * livello qualitativo», «soddisfazione totale» — cioè proprio il tono da
 * volantino da cui stiamo scappando. Dato in pasto al generatore, quel
 * materiale avrebbe PEGGIORATO i post invece di migliorarli.
 *
 * Si poteva scrivere nel prompt «non prendere la voce dal sito». Ma se il sito
 * non entra nella domanda sulla voce, il problema non può proprio succedere —
 * è la stessa logica per cui il preambolo si toglie col codice invece di
 * chiedere al modello di non scriverlo. Ogni domanda vede SOLO la sua fonte:
 *
 *   voce       ← descrizione della scheda + materiale incollato   (parla lui)
 *   apprezzato ← solo recensioni                                  (parlano i clienti)
 *   fatti      ← sito + descrizione                               (cosa vende, da confermare)
 *
 * E ANALIZZA NON SALVA. Restituisce e basta: alcune conclusioni saranno giuste,
 * altre no, e chi conosce il cliente è dall'altra parte dello schermo. Come per
 * i post, l'ultimo bottone non è del modello.
 */

import { generaJson } from './generatore';
import { leggiProfiloGoogle, leggiRecensioni } from './gbp';
import { leggiSitoIntero } from './leggiSito';
import { query } from './db';
import type { VoceCliente } from './voce';

const SISTEMA_ANALISTA =
  "Sei un analista che legge del materiale su un'attività commerciale e ne ricava conclusioni " +
  'sobrie. Rispondi sempre e solo con un oggetto JSON valido, senza ragionamenti né testo extra. ' +
  'Non inventare: quello che non trovi nel materiale resta vuoto. Un campo vuoto è una risposta ' +
  'corretta.';

const eOggetto = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object';

export interface Materiale {
  descrizioneGoogle: string;
  categoria: string;
  recensioni: string[];
  testoSito: string;
  incollato: string;
  fonti: string[];
  avvisi: string[];
}

/** Raccoglie tutto, dicendo cosa non è riuscito a leggere invece di tacere. */
export async function raccogliMateriale(aziendaId: number, incollato = ''): Promise<Materiale> {
  const m: Materiale = {
    descrizioneGoogle: '',
    categoria: '',
    recensioni: [],
    testoSito: '',
    incollato: incollato.trim(),
    fonti: [],
    avvisi: [],
  };

  const [a] = await query<{ sito: string | null; gbp_account: string | null; gbp_location: string | null }>(
    `SELECT (SELECT c.valore FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.tipo = 'sito' ORDER BY c.id LIMIT 1) AS sito,
            (SELECT s.config->>'gbp_account_id' FROM wesion.servizio s
              WHERE s.azienda_id = a.id AND s.tipo = 'post_gbp')  AS gbp_account,
            (SELECT s.config->>'gbp_location_id' FROM wesion.servizio s
              WHERE s.azienda_id = a.id AND s.tipo = 'post_gbp')  AS gbp_location
       FROM wesion.azienda a WHERE a.id = $1`,
    [aziendaId]
  );
  if (!a) throw new Error(`azienda ${aziendaId} inesistente`);

  // 1. La descrizione che il cliente ha scritto di sé sulla propria scheda.
  if (a.gbp_location) {
    try {
      const profilo = await leggiProfiloGoogle(a.gbp_location);
      m.descrizioneGoogle = profilo.descrizione;
      m.categoria = profilo.categoria;
      if (profilo.descrizione) m.fonti.push('descrizione della scheda Google');
      else
        m.avvisi.push(
          'La scheda Google non ha una descrizione compilata: è la fonte migliore che c’è per la voce, varrebbe la pena scriverla.'
        );
    } catch (e: unknown) {
      m.avvisi.push(`Descrizione della scheda non letta: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    m.avvisi.push('Nessuna scheda Google collegata: manca la fonte migliore per la voce e l’unica per le recensioni.');
  }

  // 2. Le recensioni: l'unica fonte che non ha scritto il cliente.
  if (a.gbp_account && a.gbp_location) {
    try {
      const recensioni = await leggiRecensioni(a.gbp_account, a.gbp_location);
      m.recensioni = recensioni.map((r) => r.testo);
      if (m.recensioni.length) m.fonti.push(`${m.recensioni.length} recensioni con testo`);
      else m.avvisi.push('Nessuna recensione con del testo dentro: mancano i punti di forza verificati da terzi.');
    } catch (e: unknown) {
      m.avvisi.push(`Recensioni non lette: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * 3. Il sito, su più pagine.
   *
   * Fino al 31/08/2026 si leggeva solo la home, tagliata a 10.000 caratteri.
   * Su un sito magro bastava; su uno corposo la home è la vetrina — dice il
   * mestiere in una riga e rimanda a «Servizi» per tutto il resto. Il risultato
   * era un `cosa_fa` giusto e poi tre elenchi vuoti, cioè una scheda che resta
   * sotto i quattro fatti minimi e un piano che esce generico.
   *
   * Il testo in più NON tocca la voce: `estraiVoce` il sito non lo vede
   * proprio, ed è la difesa strutturale spiegata in cima al file. Qui alimenta
   * solo la domanda sui fatti, dove più materiale vero è meglio.
   */
  if (a.sito) {
    const sito = await leggiSitoIntero(a.sito, { pagine: 6, perPagina: 6000 });
    m.testoSito = sito.testo;
    if (sito.testo) {
      m.fonti.push(sito.lette.length > 1 ? `sito web (${sito.lette.length} pagine)` : 'sito web');
    } else {
      m.avvisi.push('Sito non raggiungibile o vuoto.');
    }
  }

  // 4. Quello che ha incollato una persona: didascalie, appunti, la telefonata.
  if (m.incollato) m.fonti.push('materiale incollato a mano');

  return m;
}

/**
 * Domanda 1 — la voce. Vede SOLO ciò che ha scritto il cliente di suo pugno.
 *
 * Il sito qui non entra: quasi sempre l'ha scritto un'agenzia, e la sua voce
 * non è la sua.
 */
async function estraiVoce(m: Materiale): Promise<Partial<VoceCliente>> {
  if (!m.descrizioneGoogle && !m.incollato) return {};

  const materiale = [
    m.descrizioneGoogle && `DESCRIZIONE CHE HA SCRITTO SULLA SUA SCHEDA GOOGLE:\n"${m.descrizioneGoogle}"`,
    m.incollato && `ALTRO MATERIALE SCRITTO DA LUI (didascalie social, appunti):\n"${m.incollato}"`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const esito = await generaJson(
    SISTEMA_ANALISTA,
    `Qui sotto c'è del testo scritto di suo pugno dal titolare di un'attività.

${materiale}

Restituisci un JSON con questa struttura:
{ "origine": "", "come_ragiona": "", "voce": "", "parole_sue": [] }

- "origine": come è nata l'attività, da dove viene chi ci lavora, cosa faceva prima. Una o due
  frasi in terza persona. Se il testo racconta un percorso personale, è quello che devi mettere
  qui: è la cosa più preziosa che c'è. Se non c'è nessun racconto, lascia "".
- "come_ragiona": come sceglie di lavorare, cosa gli sta a cuore, cosa rifiuta. UNA FRASE DI SENSO
  COMPIUTO, non un elenco di aggettivi. "Qualità, professionalità, serietà" NON è una risposta
  valida: sono parole che userebbe chiunque. Se non emerge un modo di ragionare riconoscibile,
  lascia "".
- "voce": COME PARLA, non cosa dice. Parla in prima persona ("io", "noi") o in terza come
  un'azienda? Dà del tu o del lei? Frasi corte o lunghe? Racconta o elenca? Usa termini tecnici o
  parole di tutti i giorni? Una o due frasi concrete. NON rispondere "formale e professionale":
  è vero per chiunque e non serve a niente.
- "parole_sue": parole ed espressioni CONCRETE che usa davvero, da riusare nei post per farlo
  suonare come lui. Massimo 8.
  ESCLUDI TASSATIVAMENTE i superlativi e il gergo pubblicitario: "impeccabile", "altissimo
  livello", "soddisfazione totale", "eccellenza", "all'avanguardia", "leader del settore",
  "passione", "professionalità" e simili. Non sono parole sue, sono parole di chiunque venda
  qualcosa, e nei post suonano da volantino.
  Tieni invece i termini del mestiere, i nomi delle cose che fa, i modi di dire personali.

Restituisci SOLO il JSON.`,
    eOggetto
  );

  const d = esito.dato;
  const testo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);

  return {
    origine: testo(d.origine),
    come_ragiona: testo(d.come_ragiona),
    voce: testo(d.voce),
    parole_sue: lista(d.parole_sue),
  };
}

/** Domanda 2 — cosa apprezzano i clienti. Vede SOLO le recensioni. */
async function estraiApprezzato(m: Materiale): Promise<string[]> {
  if (!m.recensioni.length) return [];

  const esito = await generaJson(
    SISTEMA_ANALISTA,
    `Qui sotto ci sono le recensioni lasciate dai clienti di un'attività. Le hanno scritte loro,
non l'azienda: quello che dicono è testimonianza, non pubblicità.

${m.recensioni.map((t) => `- "${t}"`).join('\n')}

Restituisci un JSON: { "apprezzato": [] }

Metti nella lista le cose che i clienti apprezzano davvero, con queste regole:
- Una voce entra SOLO se il concetto torna in almeno DUE recensioni diverse. Una persona sola è
  un'opinione, due sono un fatto.
- Scrivi ogni voce in modo CONCRETO. Se il concetto ricorrente è generico, non scartarlo:
  riformulalo. "professionalità" -> "spiega le cose e mantiene quello che promette";
  "qualità" -> "i lavori reggono nel tempo"; "puntualità" -> "rispetta le date concordate".
- Non lasciare la lista vuota se ci sono concetti ricorrenti: il tuo compito è trovarli e dirli
  bene, non alzare l'asticella finché non passa più niente.
- Massimo 6 voci, dalla più citata alla meno citata.

Restituisci SOLO il JSON.`,
    eOggetto
  );

  const v = esito.dato.apprezzato;
  return Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 6) : [];
}

/** I cinque tag ammessi da `ricorrenze.ts`. Il modello sceglie fra questi, non inventa. */
const SETTORI = ['ristorazione', 'artigianato', 'casa', 'servizi', 'locale'] as const;

/** Domanda 3 — cosa vende. Vede sito e descrizione: sono fatti, non voce. */
async function estraiFatti(m: Materiale): Promise<{
  cosa_fa: string;
  offerta: string[];
  materiali: string[];
  punti_forza: string[];
  settore: string[];
}> {
  const materiale = [
    m.descrizioneGoogle && `DESCRIZIONE DELLA SCHEDA:\n"${m.descrizioneGoogle}"`,
    m.categoria && `CATEGORIA GOOGLE: ${m.categoria}`,
    m.testoSito && `TESTO DEL SITO:\n"${m.testoSito}"`,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!materiale) return { cosa_fa: '', offerta: [], materiali: [], punti_forza: [], settore: [] };

  const esito = await generaJson(
    SISTEMA_ANALISTA,
    `Qui sotto c'è del materiale su un'attività — può essere più di una pagina del suo sito, e in
quel caso ogni pezzo inizia con "PAGINA:". Serve a capire COSA FA e COSA VENDE.

${materiale}

Restituisci un JSON:
{ "cosa_fa": "", "offerta": [], "materiali": [], "punti_forza": [], "settore": [] }

- "cosa_fa": l'attività in concreto, in una riga. "trattoria con cucina pavese e pasta fatta in
  casa", non "eccellenza della ristorazione".
- "offerta": prodotti o servizi principali, massimo 8, chiamati col loro nome.
- "materiali": ingredienti, materiali, metodi di lavorazione, strumenti o tecnologie nominati
  esplicitamente. Massimo 8.
- "punti_forza": cosa lo distingue DAVVERO da chi fa lo stesso mestiere. Massimo 6.
  Vale solo ciò che è verificabile e specifico: un numero ("vent'anni di lavoro", "consegna in
  48 ore"), una competenza rara, un modo di lavorare che gli altri non hanno, una garanzia
  precisa. NON valgono i superlativi ("massima qualità", "grande esperienza", "attenzione al
  cliente"): li scrive chiunque, e in un post non dicono niente. Se dal materiale non emerge
  niente di distintivo, lascia la lista vuota: è una risposta corretta.
- "settore": zero o più valori SCELTI SOLO fra questi cinque, nessun altro:
  "ristorazione" (bar, ristoranti, pizzerie, gastronomie),
  "artigianato" (chi produce o ripara con le mani),
  "casa" (edilizia, impianti, arredo, giardini, pulizie),
  "servizi" (professionisti, agenzie, consulenza, informatica, marketing),
  "locale" (attività di quartiere che vive del passaggio e del paese).
  Servono a scegliere quali ricorrenze del calendario hanno senso per lui, quindi mettine uno o
  due, quelli giusti — non tutti per sicurezza.

⚠️ Solo cose SCRITTE nel materiale. Questa roba finirà nei post come se fosse verificata: se
deduci o abbellisci, il cliente si ritrova ad affermare pubblicamente cose che non ha mai detto.
Nel dubbio, lascia fuori.

Restituisci SOLO il JSON.`,
    eOggetto
  );

  const d = esito.dato;
  const lista = (v: unknown, quante = 8) =>
    Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean).slice(0, quante) : [];

  return {
    cosa_fa: typeof d.cosa_fa === 'string' ? d.cosa_fa.trim() : '',
    offerta: lista(d.offerta),
    materiali: lista(d.materiali),
    punti_forza: lista(d.punti_forza, 6),
    // Il modello propone, la lista chiusa decide: un tag inventato non
    // corrisponderebbe a nessuna ricorrenza e sparirebbe in silenzio.
    settore: lista(d.settore, 5)
      .map((x) => x.toLowerCase())
      .filter((x): x is (typeof SETTORI)[number] => (SETTORI as readonly string[]).includes(x)),
  };
}

export interface EsitoAnalisi {
  voce: Partial<VoceCliente>;
  fatti: { cosa_fa: string; offerta: string[]; materiali: string[]; punti_forza: string[] };
  /** Proposto, non applicato: sceglie quali ricorrenze del calendario hanno senso. */
  settore: string[];
  fonti: string[];
  avvisi: string[];
}

/**
 * L'analisi completa. NON salva niente.
 *
 * Le tre domande vanno in parallelo perché sono indipendenti — nessuna usa la
 * risposta dell'altra — ed è l'unico punto di tutto il progetto dove il
 * parallelo è sicuro: sono tre chiamate per un cliente solo, non 270.
 */
export async function analizzaVoce(aziendaId: number, incollato = ''): Promise<EsitoAnalisi> {
  const m = await raccogliMateriale(aziendaId, incollato);

  const [voce, apprezzato, fatti] = await Promise.all([
    estraiVoce(m).catch((e) => {
      m.avvisi.push(`Voce non ricavata: ${e instanceof Error ? e.message : e}`);
      return {} as Partial<VoceCliente>;
    }),
    estraiApprezzato(m).catch((e) => {
      m.avvisi.push(`Recensioni non analizzate: ${e instanceof Error ? e.message : e}`);
      return [] as string[];
    }),
    estraiFatti(m).catch((e) => {
      m.avvisi.push(`Fatti non ricavati: ${e instanceof Error ? e.message : e}`);
      return { cosa_fa: '', offerta: [], materiali: [], punti_forza: [], settore: [] };
    }),
  ]);

  if (!m.fonti.length) {
    m.avvisi.push(
      'Non c’è stato niente da leggere: senza scheda Google, senza sito e senza materiale incollato, non si può ricavare nessuna voce.'
    );
  }

  const { settore, ...soloFatti } = fatti;
  return { voce: { ...voce, apprezzato }, fatti: soloFatti, settore, fonti: m.fonti, avvisi: m.avvisi };
}
