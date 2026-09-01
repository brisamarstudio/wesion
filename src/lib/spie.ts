/**
 * Le spie: accorgersi dei guasti prima che se ne accorga il cliente.
 *
 * IL 21/07/2026 SONO EMERSI TRE GUASTI E NESSUNO AVEVA ACCESO NIENTE. Scoperti
 * tutti e tre a mano, per caso, guardando altro. A quindici clienti la fedelta'
 * conta piu' dell'acquisizione, e il momento in cui il canone smette di comprare
 * tranquillita' e' quello in cui **e' il cliente a telefonare per primo**.
 *
 * TRE FAMIGLIE, E LA SECONDA E' QUELLA CHE SI DIMENTICA.
 *
 *  - I GUASTI si vedono: una pubblicazione fallita fa rumore da sola.
 *  - I SILENZI no: il cliente che da tre settimane non ha piu' un post in coda
 *    non produce nessun errore. Non succede niente, ed e' esattamente il
 *    problema. Nessun log al mondo scrive una riga per una cosa che NON e'
 *    successa.
 *  - L'IMPIANTO e' quello che se cade non funziona piu' niente, e in silenzio.
 *
 * COSA CAMBIA ADESSO CHE I TRE STRUMENTI SONO UNO. Due spie qui sotto prima non
 * potevano proprio esistere, perche' pretendono in una query dati che stavano in
 * due database diversi: `bozzeApprovateFerme` (la dashboard ha detto si', il
 * router non ha pubblicato) e `menuNonArrivato` (il cliente ha il servizio
 * attivo ma oggi non ha mandato la foto). Sono esattamente le due cose che il
 * ristoratore scopre per primo — ed erano i due punti ciechi.
 *
 * PERCHE' OGNI CONTROLLO E' AVVOLTO NEL SUO try/catch. Se una query fallisce, il
 * pannello non deve restare vuoto e sereno: sarebbe la stessa identica bugia dei
 * tre guasti muti. Un controllo che non gira accende una spia che lo dice — ed
 * e' il terzo stato, `non_eseguibile`, previsto in tabella apposta.
 */

import { query } from './db';
import { controllaBozza } from './controlloTesto';
import { testoBozza } from './bozze';

/**
 * Un esempio di riga toccata da una spia.
 *
 * `href` esiste perche' una spia che dice cosa e' rotto e non porta a
 * sistemarlo si legge e basta — bisogna poi ricordarsi dove andare a mano.
 * Assente quando non c'e' un posto della dashboard che risolva la cosa (un
 * mittente senza azienda, l'impianto giu'): meglio nessun link che uno finto.
 */
export interface EsempioSpia {
  etichetta: string;
  href?: string;
}

export interface Spia {
  chiave: string;
  famiglia: 'guasto' | 'silenzio' | 'impianto';
  /** Rossa: qualcosa e' rotto adesso. Gialla: si sta preparando a rompersi. */
  colore: 'rossa' | 'gialla';
  /** Cosa succede, detto a chi gestisce i clienti, non a chi ha scritto il codice. */
  titolo: string;
  /** Perche' conta e cosa si fa. */
  dettaglio: string;
  /** Quante volte. 0 significa che la spia parla dell'impianto, non di righe. */
  quanti: number;
  /** Qualche nome, per sapere subito chi guardare, e dove andare a sistemarlo. Al massimo cinque. */
  esempi: EsempioSpia[];
  /** Da quando e' accesa. Arriva dalla tabella, non dal controllo. */
  dal: string | null;
}

type Controllo = () => Promise<Spia | null>;

/** Esegue un controllo isolando i suoi guasti: uno rotto non ne spegne dieci. */
async function esegui(chiave: string, famiglia: Spia['famiglia'], controllo: Controllo): Promise<Spia | null> {
  try {
    return await controllo();
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    console.error(`Controllo "${chiave}" non eseguito:`, motivo);
    return {
      chiave: `${chiave}-rotto`,
      famiglia,
      colore: 'gialla',
      titolo: `Il controllo "${chiave}" non è riuscito a girare`,
      dettaglio:
        'Non vuol dire che va tutto bene: vuol dire che di questa cosa non sappiamo niente. ' +
        `Motivo tecnico: ${motivo}`,
      quanti: 0,
      esempi: [],
      dal: null,
    };
  }
}

const nomi = (
  righe: Array<Record<string, unknown>>,
  opzioni: { campo?: string; href?: (r: Record<string, unknown>) => string } = {}
): EsempioSpia[] =>
  righe
    .slice(0, 5)
    .map((r) => ({ etichetta: String(r[opzioni.campo ?? 'azienda'] ?? ''), href: opzioni.href?.(r) }))
    .filter((e) => e.etichetta);

// ─────────────────────────────────────────────────────────────────────────────
// I GUASTI — qualcosa è andato storto e si vede
// ─────────────────────────────────────────────────────────────────────────────

/** Pubblicazioni fallite: la bozza era approvata e alla destinazione non è arrivata. */
async function pubblicazioniFallite(): Promise<Spia | null> {
  const righe = await query<{ azienda_id: number; azienda: string; destinazione: string; errore: string | null }>(
    `SELECT a.id AS azienda_id, a.nome AS azienda, p.destinazione, p.errore
       FROM wesion.pubblicazione p
       JOIN wesion.bozza b   ON b.id = p.bozza_id
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE p.esito = 'errore'
        AND p.eseguita_at > now() - INTERVAL '7 days'
      ORDER BY p.eseguita_at DESC`
  );
  if (!righe.length) return null;
  const primo = String(righe[0].errore ?? '').slice(0, 160);
  return {
    chiave: 'pubblicazioni-fallite',
    famiglia: 'guasto',
    colore: 'rossa',
    titolo: `${righe.length} pubblicazioni fallite negli ultimi 7 giorni`,
    dettaglio:
      'Il contenuto era approvato e alla destinazione non è mai arrivato: sulla scheda o sul sito ' +
      `del cliente non c'è. Primo errore: ${primo}`,
    quanti: righe.length,
    esempi: righe
      .slice(0, 5)
      .map((r) => ({ etichetta: `${r.azienda} → ${r.destinazione}`, href: `/aziende/${r.azienda_id}` })),
    dal: null,
  };
}

/**
 * ⚠️ LA SPIA CHE PRIMA NON POTEVA ESISTERE.
 *
 * `bozza.stato='approvata'` e' IL PONTE fra Contabo e Oracle: la dashboard
 * scrive, il router legge con l'indice parziale `idx_bozza_approvate`. E' un
 * ponte a senso unico e senza ricevuta — nessuno risponde "ricevuto".
 *
 * Quindi se il router e' fermo, spento, o ha perso la sessione di WhatsApp,
 * qui non succede NIENTE: nessun errore, nessuna riga in `pubblicazione`, e le
 * approvazioni si accumulano. Un umano ha detto si' e non se n'e' accorto
 * nessuno. E' il guasto piu' caro che questo impianto possa avere, ed e' muto
 * per costruzione.
 *
 * Dieci minuti di soglia: il router fa il giro spesso, oltre quel tempo non e'
 * lento, e' fermo.
 */
async function bozzeApprovateFerme(): Promise<Spia | null> {
  const righe = await query<{ azienda_id: number; azienda: string; tipo: string; minuti: number }>(
    `SELECT a.id AS azienda_id, a.nome AS azienda, b.tipo,
            EXTRACT(EPOCH FROM (now() - b.approvata_at))::int / 60 AS minuti
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.stato = 'approvata'
        AND b.approvata_at < now() - INTERVAL '10 minutes'
        AND NOT EXISTS (SELECT 1 FROM wesion.pubblicazione p WHERE p.bozza_id = b.id)
        -- ⚠️ ANCHE pubblica_at, COME FA IL ROUTER (01/09/2026). Senza questa
        -- riga la spia si accendeva rossa su un post del piano approvato in
        -- anticipo e programmato fra tre settimane, dicendo "il router e'
        -- fermo o ha perso la sessione di WhatsApp". Il router non era fermo:
        -- stava aspettando il giorno suo, che e' la cosa giusta
        -- (giroPubblicazioni ha lo stesso vincolo). Successo davvero il primo
        -- giorno online, e ci ha fatti cercare un guasto che non c'era.
        -- Una spia deve avere ESATTAMENTE le condizioni di chi lavora: se le
        -- due query divergono, la spia non sorveglia il router, sorveglia
        -- un'idea del router che nessuno aggiorna.
        AND (b.pubblica_at IS NULL OR b.pubblica_at <= now())
      ORDER BY b.approvata_at ASC`
  );
  if (!righe.length) return null;
  const piuVecchia = righe[0]?.minuti ?? 0;
  return {
    chiave: 'bozze-approvate-ferme',
    famiglia: 'guasto',
    colore: 'rossa',
    titolo: `${righe.length} approvazioni non sono mai state pubblicate`,
    dettaglio:
      'Qualcuno ha detto sì e non è uscito niente: chi doveva pubblicare non ha letto. ' +
      `La più vecchia aspetta da ${piuVecchia} minuti. Di solito vuol dire che il router è fermo ` +
      'o ha perso la sessione di WhatsApp — va guardato lì, non in dashboard.',
    quanti: righe.length,
    // "Servizi": e' li' che si scopre se la causa e' un servizio spento o mal
    // configurato — l'unica meta' del guasto che si sistema DA QUI, l'altra
    // (il router fermo) non e' una pagina della dashboard.
    esempi: righe
      .slice(0, 5)
      .map((r) => ({
        etichetta: `${r.azienda} (${r.tipo}, da ${r.minuti} min)`,
        href: `/aziende/${r.azienda_id}?tab=servizi`,
      })),
    dal: null,
  };
}

/**
 * Id di Google che non hanno la forma di un id di Google.
 *
 * ⚠️ E' la spia del guasto del 21/07/2026: una copia dimenticata della funzione
 * leggeva `split('/')[3]` invece di `[1]` e scriveva pezzi di stringa o
 * `undefined`. Un id sbagliato non da' fastidio a nessuno finche' non si
 * pubblica — e allora Google risponde 404 settimane dopo l'errore vero, su un
 * cliente a caso. Gli id veri sono numerici: qualunque altra cosa e' un residuo.
 */
async function idGoogleMalformati(): Promise<Spia | null> {
  const righe = await query<{ azienda_id: number; azienda: string; account: string; scheda: string }>(
    `SELECT a.id AS azienda_id, a.nome AS azienda,
            COALESCE(s.config->>'gbp_account_id', '')  AS account,
            COALESCE(s.config->>'gbp_location_id', '') AS scheda
       FROM wesion.servizio s
       JOIN wesion.azienda a ON a.id = s.azienda_id
      WHERE s.tipo = 'post_gbp' AND s.attivo
        AND (COALESCE(s.config->>'gbp_account_id', '')  !~ '^[0-9]+$'
          OR COALESCE(s.config->>'gbp_location_id', '') !~ '^[0-9]+$')`
  );
  if (!righe.length) return null;
  return {
    chiave: 'id-google-malformati',
    famiglia: 'guasto',
    colore: 'rossa',
    titolo: `${righe.length} schede hanno id Google non validi`,
    dettaglio:
      'Gli id di account e scheda devono essere numerici. Qui non lo sono, quindi la pubblicazione ' +
      'fallirà con 404 al primo tentativo. Si correggono solo rileggendoli da Google: non si ' +
      'deducono e non si scrivono a mano.',
    quanti: righe.length,
    // Dritti sul bottone "Leggi le schede da Google" della linguetta Servizi:
    // e' l'unico modo corretto di sistemarli (mai a mano, regola del 21/07/2026).
    esempi: righe.slice(0, 5).map((r) => ({
      etichetta: `${r.azienda} (account: "${r.account}", scheda: "${r.scheda}")`,
      href: `/aziende/${r.azienda_id}?tab=servizi`,
    })),
    dal: null,
  };
}

/** Bozze scadute senza che nessuno le abbia decise: il sì non è mai arrivato. */
async function bozzeScadute(): Promise<Spia | null> {
  const righe = await query<{ azienda: string; tipo: string }>(
    `SELECT a.nome AS azienda, b.tipo
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.stato IN ('generata', 'attesa_approvazione')
        AND b.scade_at IS NOT NULL AND b.scade_at <= now()
        AND b.scade_at > now() - INTERVAL '7 days'
      ORDER BY b.scade_at DESC`
  );
  if (!righe.length) return null;
  return {
    chiave: 'bozze-scadute',
    famiglia: 'guasto',
    colore: 'gialla',
    titolo: `${righe.length} bozze sono scadute senza risposta`,
    dettaglio:
      'Erano pronte e nessuno ha detto né sì né no finché il tempo è passato. Per il menù del ' +
      'giorno vuol dire che quel giorno sul sito è rimasto quello vecchio. Se càpita spesso, ' +
      'il problema non è la fretta: è che la richiesta non arriva dove la persona la vede.',
    quanti: righe.length,
    // La decisione si prende nella consolle, non qui: la spia porta alla coda,
    // non alla scheda del cliente (che non ha un bottone "approva questa").
    esempi: righe.slice(0, 5).map((r) => ({ etichetta: `${r.azienda} (${r.tipo})`, href: '/bozze' })),
    dal: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// I SILENZI — non succede niente, ed è quello il problema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ L'ALTRA SPIA CHE PRIMA NON POTEVA ESISTERE.
 *
 * Il servizio "menu del giorno" e' attivo, quindi il cliente lo sta pagando, ma
 * oggi da lui non e' arrivato niente. Prima serviva incrociare i servizi attivi
 * (che stavano nel router) con le bozze del giorno (che stavano di la'): due
 * database, nessuna query possibile.
 *
 * Non e' per forza un guasto nostro — puo' essere il ristoratore che si e'
 * dimenticato. Ma e' proprio quello il punto: se si e' dimenticato lui e ce ne
 * accorgiamo noi, il canone ha appena comprato qualcosa.
 *
 * Dopo le 11: prima di quell'ora e' presto, la lavagna spesso si scrive tardi.
 */
async function menuNonArrivato(): Promise<Spia | null> {
  const righe = await query<{ id: number; azienda: string }>(
    `SELECT a.id, a.nome AS azienda
       FROM wesion.servizio s
       JOIN wesion.azienda a ON a.id = s.azienda_id
      WHERE s.tipo = 'menu_del_giorno' AND s.attivo
        AND EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Rome') >= 11
        AND NOT EXISTS (
          SELECT 1 FROM wesion.bozza b
           WHERE b.azienda_id = a.id AND b.tipo = 'menu'
             AND b.creata_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
        )
      ORDER BY a.nome`
  );
  if (!righe.length) return null;
  return {
    chiave: 'menu-non-arrivato',
    famiglia: 'silenzio',
    colore: 'rossa',
    titolo: `${righe.length} clienti non hanno mandato il menù di oggi`,
    dettaglio:
      'Pagano il menù del giorno e stamattina da loro non è arrivata nessuna foto, quindi sul ' +
      'sito e su Google è rimasto quello di ieri. Può essere una dimenticanza loro o il router ' +
      'che non riceve più: si distingue guardando se è successo a uno solo o a tutti insieme.',
    quanti: righe.length,
    esempi: nomi(righe, { href: (r) => `/aziende/${r.id}` }),
    dal: null,
  };
}

/** Clienti attivi senza niente in coda: da qui in poi da loro non esce più nulla. */
async function codaVuota(): Promise<Spia | null> {
  const righe = await query<{ id: number; azienda: string }>(
    `SELECT a.id, a.nome AS azienda
       FROM wesion.azienda a
      WHERE a.stato = 'cliente'
        AND EXISTS (SELECT 1 FROM wesion.servizio s
                     WHERE s.azienda_id = a.id AND s.attivo AND s.tipo IN ('post_gbp','blog'))
        AND NOT EXISTS (
          SELECT 1 FROM wesion.bozza b
           WHERE b.azienda_id = a.id
             AND b.stato IN ('vuota','generata','attesa_approvazione','approvata')
        )
      ORDER BY a.nome`
  );
  if (!righe.length) return null;
  return {
    chiave: 'coda-vuota',
    famiglia: 'silenzio',
    colore: 'rossa',
    titolo: `${righe.length} clienti non hanno niente in arrivo`,
    dettaglio:
      'Nessun errore, nessun avviso: semplicemente da qui in poi sulle loro schede non esce più ' +
      'niente. È il guasto che il cliente scopre da solo, guardando la sua pagina, e nel mese in ' +
      'cui succede il canone non ha comprato niente. Costruisci il piano.',
    quanti: righe.length,
    // "Il mese": e' la linguetta dove sta il bottone "Costruisci il piano del
    // mese" che il dettaglio qui sopra sta letteralmente consigliando di premere.
    esempi: nomi(righe, { href: (r) => `/aziende/${r.id}?tab=mese` }),
    dal: null,
  };
}

/** Clienti senza voce: i loro testi escono corretti e intercambiabili. */
async function voceMancante(): Promise<Spia | null> {
  const righe = await query<{ id: number; azienda: string }>(
    `SELECT a.id, a.nome AS azienda
       FROM wesion.azienda a
       LEFT JOIN wesion.voce v ON v.azienda_id = a.id
      WHERE a.stato = 'cliente'
        AND (v.azienda_id IS NULL
             OR (COALESCE(v.voce, '') = '' AND cardinality(v.parole_sue) = 0))
      ORDER BY a.nome`
  );
  if (!righe.length) return null;
  return {
    chiave: 'voce-mancante',
    famiglia: 'silenzio',
    colore: 'gialla',
    titolo: `${righe.length} clienti non hanno una voce`,
    dettaglio:
      'I loro testi saranno corretti e scrivibili da chiunque per chiunque: senza voce e senza ' +
      'parole sue il generatore ricade sul registro da agenzia. È il difetto che si nota anche ' +
      'quando non è un errore.',
    quanti: righe.length,
    esempi: nomi(righe, { href: (r) => `/aziende/${r.id}?tab=voce` }),
    dal: null,
  };
}

/** Clienti senza nessun fatto attivo: non c'è materia prima da cui partire. */
async function fattiMancanti(): Promise<Spia | null> {
  const righe = await query<{ id: number; azienda: string }>(
    `SELECT a.id, a.nome AS azienda
       FROM wesion.azienda a
      WHERE a.stato = 'cliente'
        AND NOT EXISTS (SELECT 1 FROM wesion.fatto f WHERE f.azienda_id = a.id AND f.attivo)
      ORDER BY a.nome`
  );
  if (!righe.length) return null;
  return {
    chiave: 'fatti-mancanti',
    famiglia: 'silenzio',
    colore: 'gialla',
    titolo: `${righe.length} clienti non hanno nessun fatto`,
    dettaglio:
      'Senza fatti il piano non ha da cosa nascere: esce corto o non esce. E un testo senza un ' +
      'fatto sotto è un testo che parla senza dire niente.',
    quanti: righe.length,
    esempi: nomi(righe, { href: (r) => `/aziende/${r.id}?tab=fatti` }),
    dal: null,
  };
}

/**
 * Testi in coda che accenderebbero un avviso grave.
 *
 * Non e' un doppione del controllo nella consolle: quello lo vede solo chi apre
 * quella bozza. Questa guarda tutta la coda insieme, comprese le bozze generate
 * un mese fa e mai piu' riaperte — che sono esattamente quelle che si approvano
 * di fretta.
 */
async function testiARischio(): Promise<Spia | null> {
  const righe = await query<{ azienda: string; tipo: string; contenuto: Record<string, unknown>; fatti: string[] }>(
    `SELECT a.nome AS azienda, b.tipo, b.contenuto,
            COALESCE((SELECT array_agg(x.valore) FROM wesion.fatto x
                       WHERE x.azienda_id = a.id AND x.attivo), '{}') AS fatti
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.stato IN ('generata','attesa_approvazione','approvata')`
  );

  const sospetti = righe
    .map((r) => ({ ...r, gravi: controllaBozza(r.tipo, testoBozza(r.contenuto), r.fatti).filter((a) => a.gravita === 'grave') }))
    .filter((r) => r.gravi.length > 0);

  if (!sospetti.length) return null;
  return {
    chiave: 'testi-a-rischio',
    famiglia: 'silenzio',
    colore: 'rossa',
    titolo: `${sospetti.length} testi in coda hanno qualcosa da controllare`,
    dettaglio:
      'Contengono roba che a Google non piace o che nessuno ha verificato — contatti, numeri ' +
      'inventati, orari. Aprili prima di approvarli: nella consolle trovi scritto cosa.',
    quanti: sospetti.length,
    esempi: sospetti
      .slice(0, 5)
      .map((r) => ({ etichetta: `${r.azienda}: ${r.gravi[0].messaggio}`, href: '/bozze' })),
    dal: null,
  };
}

/**
 * Testi GIA' PUBBLICATI che oggi non passerebbero il controllo.
 *
 * Non e' archeologia. Il 20/07/2026 Google ha rimosso un post e ha disattivato
 * la pubblicazione sulla scheda di Artigiano il Conte. Quel post e' stato
 * riscritto, gli altri con lo stesso difetto sono rimasti online a fare la
 * stessa figura. Una sospensione non arriva per un post: arriva per un profilo
 * che ne accumula.
 */
async function pubblicatiDaRivedere(): Promise<Spia | null> {
  const righe = await query<{ azienda: string; tipo: string; contenuto: Record<string, unknown>; fatti: string[] }>(
    `SELECT a.nome AS azienda, b.tipo, b.contenuto,
            COALESCE((SELECT array_agg(x.valore) FROM wesion.fatto x
                       WHERE x.azienda_id = a.id AND x.attivo), '{}') AS fatti
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.stato = 'pubblicata' AND b.tipo IN ('post_gbp','articolo')`
  );

  const sospetti = righe
    .map((r) => ({ ...r, gravi: controllaBozza(r.tipo, testoBozza(r.contenuto), r.fatti).filter((a) => a.gravita === 'grave') }))
    .filter((r) => r.gravi.length > 0);

  if (!sospetti.length) return null;
  return {
    chiave: 'pubblicati-da-rivedere',
    famiglia: 'guasto',
    colore: 'rossa',
    titolo: `${sospetti.length} testi già online avrebbero qualcosa da correggere`,
    dettaglio:
      'Sono pubblicati adesso sulle schede dei clienti e contengono roba che Google punisce. ' +
      'Non è un rischio teorico: il 20/07/2026 una scheda è stata sospesa per questo. Conviene ' +
      'riscriverli o rimuoverli.',
    quanti: sospetti.length,
    esempi: sospetti
      .slice(0, 5)
      .map((r) => ({ etichetta: `${r.azienda}: ${r.gravi[0].messaggio}`, href: '/bozze' })),
    dal: null,
  };
}

/**
 * Messaggi arrivati da un mittente che non sappiamo a chi appartiene.
 *
 * `messaggio.azienda_id` e' NULLO di proposito — un messaggio da uno sconosciuto
 * e' un dato, non uno scarto. Di solito e' il titolare che scrive dal LID o da
 * un secondo numero: cioe' un cliente vero a cui il bot non sta rispondendo, e
 * che pensa che il servizio non funzioni. L'indice `idx_msg_orfani` esiste per
 * questa domanda.
 */
async function messaggiOrfani(): Promise<Spia | null> {
  const righe = await query<{ mittente: string; quanti: number }>(
    `SELECT COALESCE(payload->>'mittente', 'sconosciuto') AS mittente, count(*)::int AS quanti
       FROM wesion.messaggio
      WHERE azienda_id IS NULL
        AND direzione = 'in'
        AND creato_at > now() - INTERVAL '7 days'
      GROUP BY 1 ORDER BY quanti DESC`
  );
  if (!righe.length) return null;
  const totale = righe.reduce((s, r) => s + r.quanti, 0);
  return {
    chiave: 'messaggi-orfani',
    famiglia: 'silenzio',
    colore: 'gialla',
    titolo: `${totale} messaggi da mittenti che non riconosciamo`,
    dettaglio:
      'Qualcuno ha scritto e non sappiamo di che azienda sia, quindi il bot non gli ha risposto ' +
      'e lui pensa che il servizio non funzioni. Quasi sempre è un titolare che scrive da un ' +
      'secondo numero o dal LID: basta aggiungere quel contatto alla sua azienda.',
    quanti: totale,
    esempi: righe.slice(0, 5).map((r) => ({ etichetta: `${r.mittente} (${r.quanti})` })),
    dal: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// L'IMPIANTO — se è giù non funziona niente, e in silenzio
// ─────────────────────────────────────────────────────────────────────────────

/** Il generatore risponde? Se è giù non si genera un testo, su nessun cliente. */
async function generatoreRaggiungibile(): Promise<Spia | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    return {
      chiave: 'generatore-senza-chiave',
      famiglia: 'impianto',
      colore: 'rossa',
      titolo: 'Manca la chiave del generatore',
      dettaglio:
        'OPENROUTER_API_KEY non è configurata: la lettura dei menù dalle foto e la scrittura dei ' +
        'testi sono ferme, su tutti i clienti insieme.',
      quanti: 0,
      esempi: [],
      dal: null,
    };
  }
  try {
    const risposta = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!risposta.ok) throw new Error(`ha risposto ${risposta.status}`);
    return null;
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return {
      chiave: 'generatore-irraggiungibile',
      famiglia: 'impianto',
      colore: 'rossa',
      titolo: 'Il generatore non risponde',
      dettaglio: `OpenRouter non è raggiungibile (${motivo}): niente OCR dei menù, niente testi nuovi.`,
      quanti: 0,
      esempi: [],
      dal: null,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const CONTROLLI: Array<[string, Spia['famiglia'], Controllo]> = [
  ['pubblicazioni-fallite', 'guasto', pubblicazioniFallite],
  ['bozze-approvate-ferme', 'guasto', bozzeApprovateFerme],
  ['id-google-malformati', 'guasto', idGoogleMalformati],
  ['bozze-scadute', 'guasto', bozzeScadute],
  ['pubblicati-da-rivedere', 'guasto', pubblicatiDaRivedere],
  ['menu-non-arrivato', 'silenzio', menuNonArrivato],
  ['coda-vuota', 'silenzio', codaVuota],
  ['voce-mancante', 'silenzio', voceMancante],
  ['fatti-mancanti', 'silenzio', fattiMancanti],
  ['testi-a-rischio', 'silenzio', testiARischio],
  ['messaggi-orfani', 'silenzio', messaggiOrfani],
  ['generatore', 'impianto', generatoreRaggiungibile],
];

/**
 * Scrive in tabella lo stato di questo giro e restituisce da quando ogni spia
 * e' accesa.
 *
 * `dal` e' l'unica cosa che un controllo non puo' sapere da solo: guardando il
 * database in questo istante si vede CHE una spia e' accesa, non DA QUANDO. E
 * "accesa da tre giorni" e "accesa adesso" sono due urgenze diverse — la prima
 * dice anche che per tre giorni nessuno ha guardato.
 */
async function registra(accese: Spia[]): Promise<Map<string, string | null>> {
  const chiaviAccese = accese.map((s) => s.chiave);

  // Prima si spegne quello che non e' piu' acceso: una spia che smette di
  // suonare deve perdere il suo `dal`, o al prossimo guasto direbbe una data
  // vecchia di settimane.
  await query(
    `UPDATE wesion.spia SET stato = 'ok', dal = NULL, vista_at = now()
      WHERE stato <> 'ok' AND NOT (chiave = ANY($1))`,
    [chiaviAccese]
  );

  const dal = new Map<string, string | null>();
  for (const s of accese) {
    const [riga] = await query<{ dal: string | null }>(
      `INSERT INTO wesion.spia (chiave, famiglia, stato, messaggio, dal, vista_at)
       VALUES ($1, $2, 'accesa', $3, now(), now())
       ON CONFLICT (chiave) DO UPDATE
         SET famiglia  = EXCLUDED.famiglia,
             messaggio = EXCLUDED.messaggio,
             -- Restava accesa: la data e' quella di allora, non di adesso.
             dal       = CASE WHEN wesion.spia.stato = 'accesa'
                              THEN wesion.spia.dal ELSE now() END,
             stato     = 'accesa',
             vista_at  = now()
       RETURNING dal`,
      [s.chiave, s.famiglia, s.titolo]
    );
    dal.set(s.chiave, riga?.dal ?? null);
  }
  return dal;
}

/**
 * Tutte le spie, in ordine di quanto scottano.
 *
 * Le rosse prima, e dentro le rosse quelle con piu' righe: chi apre la pagina
 * deve trovare in cima la cosa che gli costa di piu' se la ignora.
 */
export async function leggiSpie(): Promise<Spia[]> {
  const esiti = await Promise.all(CONTROLLI.map(([c, f, fn]) => esegui(c, f, fn)));
  const accese = esiti.filter((s): s is Spia => s !== null);

  // La registrazione non deve poter spegnere il pannello: se scrivere in
  // tabella fallisce, le spie si mostrano lo stesso, solo senza il "da quando".
  let dal = new Map<string, string | null>();
  try {
    dal = await registra(accese);
  } catch (errore: unknown) {
    console.error('Spie non registrate:', errore instanceof Error ? errore.message : errore);
  }

  return accese
    .map((s) => ({ ...s, dal: dal.get(s.chiave) ?? null }))
    .sort((a, b) => {
      if (a.colore !== b.colore) return a.colore === 'rossa' ? -1 : 1;
      return b.quanti - a.quanti;
    });
}
