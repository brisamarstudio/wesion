/**
 * Le bozze: il punto dove i tre strumenti diventano uno.
 *
 * Una bozza del menu letto da una foto, un post di Google nato dal piano del
 * mese e un messaggio a un lead scritto dopo l'audit sono LA STESSA RIGA con
 * `tipo` diverso. E' tutto il motivo per cui Wesion esiste: prima erano tre
 * tabelle in tre database, e per sapere "cosa esce oggi" bisognava aprire tre
 * finestre.
 *
 * Qui dentro non si pubblica niente. Si prepara quello che l'operatore leggera'
 * e si scrive cosa ha deciso. La pubblicazione la fa chi sa parlare con la
 * destinazione — il router su Oracle, il worker sul sito — leggendo lo stato.
 */

import type { AvvisoTesto } from './controlloTesto';

/** Una bozza come la vede la consolle: gia' unita all'azienda che la riguarda. */
export interface Bozza {
  id: number;
  azienda_id: number;
  azienda: string;
  citta: string | null;
  tipo: string;
  origine: string;
  stato: string;
  contenuto: Record<string, unknown>;
  avvisi: AvvisoTesto[];
  modello: string | null;
  scade_at: string | null;
  /** Quando deve USCIRE (il piano). `scade_at` è l'opposto: entro quando. */
  pubblica_at: string | null;
  approvata_da: string | null;
  approvata_via: string | null;
  approvata_at: string | null;
  creata_at: string;
  /** Il fatto su cui la bozza si reggeva, se ne aveva uno. */
  fatto_chiave: string | null;
  fatto_valore: string | null;
  /**
   * I fatti verificati dell'azienda.
   *
   * Servono alla consolle per ricalcolare gli avvisi mentre si corregge senza
   * segnalare come inventato cio' che e' stato confermato dal cliente.
   */
  fatti_veri: string[];
  /** Esiti di pubblicazione gia' registrati, per non riproporre un lavoro fatto. */
  pubblicazioni: Array<{ destinazione: string; esito: string; errore: string | null }>;
  /** I servizi dell'azienda configurati abbastanza da funzionare davvero. */
  servizi_pronti: string[];
}

/** Dove finisce una bozza quando qualcuno preme «Approva». */
export interface Destinazione {
  /** Detto a chi approva, non a chi ha scritto il codice. */
  dove: string;
  /** Falso se premere «Approva» non puo' portare da nessuna parte. */
  pronta: boolean;
  /** Cosa manca, quando manca. */
  perche?: string;
  /** Dove si va a sistemarlo. */
  rimedio?: string;
}

/** Il servizio che serve perche' un tipo di bozza possa uscire. */
const SERVIZIO_PER_TIPO: Record<string, string> = {
  post_gbp: 'post_gbp',
  articolo: 'blog',
  menu: 'menu_del_giorno',
};

/**
 * Dove va a finire questa bozza, e se ci puo' andare davvero.
 *
 * ⚠️ NASCE DA UNA DOMANDA DI CHI LA USA (01/09/2026): «ma per pubblicare su
 * Google sono nel posto giusto? e se volessi pubblicare sul mio blog?». La
 * consolle non lo diceva da nessuna parte: c'era scritto "Post Google" in
 * piccolo accanto al nome, e nient'altro. Chi approva sta per far uscire una
 * cosa nel mondo e ha il diritto di sapere DOVE, con la stessa chiarezza con
 * cui vede il testo.
 *
 * E soprattutto: se quella destinazione non e' configurata, va detto PRIMA.
 * Lasciar premere «Approva» per poi rispondere con un errore rosso mezz'ora
 * dopo, quando ci passa il router, e' il guasto muto che questo progetto esiste
 * per non avere.
 */
export function destinazioneBozza(b: Bozza): Destinazione {
  if (b.tipo === 'messaggio_lead') {
    return {
      dove: 'un messaggio WhatsApp al lead',
      pronta: true,
    };
  }

  const richiesto = SERVIZIO_PER_TIPO[b.tipo];
  const pronta = richiesto ? b.servizi_pronti.includes(richiesto) : true;

  if (b.tipo === 'post_gbp') {
    return pronta
      ? { dove: `la scheda Google di ${b.azienda}`, pronta: true }
      : {
          dove: `la scheda Google di ${b.azienda}`,
          pronta: false,
          perche: 'la scheda Google non è collegata, o è spenta.',
          rimedio: 'Aziende → questo cliente → Servizi → «Leggi le schede da Google».',
        };
  }

  if (b.tipo === 'articolo') {
    return pronta
      ? { dove: `il blog di ${b.azienda}`, pronta: true }
      : {
          dove: `il blog di ${b.azienda}`,
          pronta: false,
          perche:
            'il blog non è configurato: manca l’indirizzo a cui mandare gli articoli, o è ancora quello delle prove in locale.',
          rimedio: 'Aziende → questo cliente → Servizi → Blog.',
        };
  }

  if (b.tipo === 'menu') {
    return pronta
      ? { dove: `il sito di ${b.azienda}, e la sua scheda Google se collegata`, pronta: true }
      : {
          dove: `il sito di ${b.azienda}`,
          pronta: false,
          perche: 'il menù del giorno non è configurato: manca l’indirizzo del sito.',
          rimedio: 'Aziende → questo cliente → Servizi → Menù del giorno.',
        };
  }

  return { dove: 'la destinazione prevista per questo tipo', pronta: true };
}

export const ETICHETTA_TIPO: Record<string, string> = {
  menu: 'Menù del giorno',
  post_gbp: 'Post Google',
  articolo: 'Articolo',
  messaggio_lead: 'Messaggio a un lead',
};

/**
 * Da dove e' entrato il fatto. E' l'unica traccia di quale dei tre vecchi
 * strumenti avrebbe fatto questo lavoro, e serve a leggere la coda: se le bozze
 * da foto smettono di arrivare, il router e' fermo.
 */
export const ETICHETTA_ORIGINE: Record<string, string> = {
  foto_whatsapp: 'Foto su WhatsApp',
  piano: 'Piano del mese',
  manuale: 'Scritta a mano',
  audit: 'Dopo l’audit',
};

export const ETICHETTA_STATO: Record<string, string> = {
  vuota: 'Da generare',
  generata: 'Generata',
  attesa_approvazione: 'Da approvare',
  approvata: 'Approvata',
  // Dura secondi: e' la bozza che il router ha in mano proprio adesso. Si
  // chiama cosi' e non "approvata" perche' chi la vede ferma da un quarto d'ora
  // deve capire che qualcosa non e' tornato indietro.
  pubblicando: 'In pubblicazione',
  pubblicata: 'Pubblicata',
  rifiutata: 'Rifiutata',
  scaduta: 'Scaduta',
};

/**
 * Come si chiama una bozza in un elenco.
 *
 * ⚠️ NASCE DA UNA LISTA ILLEGGIBILE (01/09/2026). La consolle mostrava per ogni
 * riga il nome del cliente, il tipo e la data di CREAZIONE: su un piano del
 * mese, che nasce tutto in un colpo su un cliente solo, vuol dire diciassette
 * righe identiche al pixel. Per trovarne una bisognava aprirle tutte.
 *
 * Il titolo c'era da sempre dentro `contenuto`, semplicemente non lo guardava
 * nessuno. Il menù del giorno un titolo non ce l'ha — li' la prima riga del
 * testo E' il titolo — quindi si ripiega su quella invece di scrivere
 * "Menù del giorno" diciassette volte.
 */
export function titoloBozza(contenuto: Record<string, unknown>, tipo: string): string {
  const t = contenuto?.titolo;
  if (typeof t === 'string' && t.trim()) return t.trim();

  const testo = testoBozza(contenuto).trim();
  if (testo) {
    const primaRiga = testo.split('\n')[0].trim();
    return primaRiga.length > 70 ? primaRiga.slice(0, 70) + '…' : primaRiga;
  }
  return ETICHETTA_TIPO[tipo] ?? tipo;
}

/** Dove può finire una pubblicazione — `wesion.pubblicazione.destinazione`. */
export const ETICHETTA_DESTINAZIONE: Record<string, string> = {
  sito: 'Sito',
  gbp: 'Google',
  blog: 'Blog',
  whatsapp: 'WhatsApp',
};

/**
 * Il testo leggibile dentro `contenuto`, che ha una forma per tipo.
 *
 * Il menu arriva da OCR come {summary, items}: `summary` e' gia' il testo
 * pronto per il post, `items` e' il dettaglio con i prezzi. Gli altri tipi
 * hanno un `testo` secco. Il fallback non e' un JSON.stringify per pigrizia: se
 * un tipo nuovo arriva con una forma che non conosciamo, l'operatore deve
 * comunque poter leggere cosa sta approvando invece di trovare un pannello vuoto.
 */
export function testoBozza(contenuto: Record<string, unknown>): string {
  if (!contenuto || typeof contenuto !== 'object') return '';
  for (const chiave of ['testo', 'summary', 'riassunto', 'corpo']) {
    const v = contenuto[chiave];
    if (typeof v === 'string' && v.trim()) return v;
  }

  /**
   * Uno slot del piano, che il testo non ce l'ha ancora.
   *
   * Si mostra il COMPITO invece del JSON: cosa deve fare il post e su quale
   * fatto si regge. È esattamente quello che serve per rivedere un piano —
   * la domanda qui è "questo slot ha senso?", non "questo testo è bello?",
   * e il testo non esiste ancora.
   */
  if (typeof contenuto.angolo === 'string') {
    return [
      contenuto.titolo ? `${contenuto.titolo}` : null,
      '',
      `Cosa deve fare: ${contenuto.angolo}`,
      contenuto.fatto ? `Si regge su (${contenuto.fonte ?? '—'}): ${contenuto.fatto}` : null,
      '',
      'Il testo non è ancora stato scritto.',
    ]
      .filter((r) => r !== null)
      .join('\n');
  }

  return JSON.stringify(contenuto, null, 2);
}

/** Le voci del menu, quando ci sono: si mostrano come righe, non come JSON. */
export interface VoceMenu {
  nome: string;
  prezzo: string;
  descrizione: string;
}

export function vociMenu(contenuto: Record<string, unknown>): VoceMenu[] {
  const items = contenuto?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    .map((v) => ({
      nome: String(v.name ?? v.nome ?? '').trim(),
      prezzo: String(v.price ?? v.prezzo ?? '').trim(),
      descrizione: String(v.description ?? v.descrizione ?? '').trim(),
    }))
    .filter((v) => v.nome);
}

/**
 * La query della consolle.
 *
 * `avvisi` si rilegge qui invece di fidarsi della colonna: la colonna e' stata
 * scritta quando la bozza e' nata, ma le regole di controllo cambiano — se ne
 * aggiungiamo una oggi, deve valere anche sulle bozze di ieri che sono ancora
 * in coda. E' lo stesso motivo per cui in gbp-autoposter esiste la spia sui
 * post gia' pubblicati.
 */
export const SQL_BOZZE = `
  SELECT
    b.id, b.azienda_id, b.tipo, b.origine, b.stato, b.contenuto,
    b.modello, b.scade_at, b.pubblica_at, b.approvata_da, b.approvata_via, b.approvata_at,
    b.creata_at,
    a.nome  AS azienda,
    a.citta AS citta,
    f.chiave AS fatto_chiave,
    f.valore AS fatto_valore,
    COALESCE((
      SELECT array_agg(x.valore)
        FROM wesion.fatto x
       WHERE x.azienda_id = a.id AND x.attivo
         AND (x.scade_at IS NULL OR x.scade_at > now())
    ), '{}') AS fatti_veri,
    COALESCE((
      SELECT json_agg(json_build_object(
               'destinazione', p.destinazione,
               'esito',        p.esito,
               'errore',       p.errore
             ) ORDER BY p.eseguita_at DESC)
      FROM wesion.pubblicazione p WHERE p.bozza_id = b.id
    ), '[]'::json) AS pubblicazioni,
    -- Quali destinazioni sono DAVVERO utilizzabili per questa azienda.
    --
    -- ⚠️ SOLO I NOMI, MAI LA CONFIG. Questa riga finisce in un componente
    -- client, cioe' nell'HTML: mandare s.config vorrebbe dire spedire al
    -- browser il segreto del blog e le chiavi di Google.
    --
    -- "Attivo" non basta: un servizio acceso con l'indirizzo vuoto non
    -- pubblica niente, e localhost e' peggio ancora — da un server non porta
    -- da nessuna parte, ma sembra configurato. E' il caso vero trovato il
    -- 01/09/2026 su MyWebby: site_blog_url era rimasto a localhost:3001 dopo
    -- le prove, e la consolle lasciava approvare un articolo che non poteva
    -- uscire, dicendolo solo dopo come errore rosso.
    COALESCE((
      SELECT array_agg(s.tipo)
        FROM wesion.servizio s
       WHERE s.azienda_id = a.id AND s.attivo
         AND CASE s.tipo
               WHEN 'post_gbp' THEN COALESCE(s.config->>'gbp_account_id', '') <> ''
                                AND COALESCE(s.config->>'gbp_location_id', '') <> ''
               WHEN 'blog' THEN
                 CASE WHEN s.config->>'tipo' = 'wordpress'
                      THEN COALESCE(s.config->>'wp_base', '') <> ''
                      ELSE COALESCE(s.config->>'site_blog_url', '') <> ''
                           AND s.config->>'site_blog_url' NOT LIKE '%localhost%'
                           AND s.config->>'site_blog_url' NOT LIKE '%127.0.0.1%'
                 END
               WHEN 'menu_del_giorno' THEN COALESCE(s.config->>'site_menu_url', '') <> ''
                                       AND s.config->>'site_menu_url' NOT LIKE '%localhost%'
               ELSE true
             END
    ), '{}') AS servizi_pronti
  FROM wesion.bozza b
  JOIN wesion.azienda a ON a.id = b.azienda_id
  LEFT JOIN wesion.fatto f ON f.id = b.fatto_id
  ORDER BY
    -- Quello che aspetta una persona sta in cima: e' l'unica coda che si ferma
    -- se nessuno la guarda. Il resto e' storia e puo' scorrere sotto.
    (b.stato = 'attesa_approvazione') DESC,
    -- ⚠️ E FRA QUELLE, PRIMA QUELLE IL CUI TURNO E' GIA' ARRIVATO (01/09/2026).
    -- Con il solo ordine di creazione, un piano del mese metteva in cima i post
    -- del 29 settembre e in FONDO l'unico che andava deciso oggi: sedici righe
    -- da scorrere per arrivare all'unica che chiedeva qualcosa. Chi apre questa
    -- pagina ha poco tempo e la prima riga dev'essere quella che costa di piu'
    -- ignorare — la stessa regola gia' applicata alle spie.
    CASE WHEN b.stato = 'attesa_approvazione'
         THEN COALESCE(b.pubblica_at, '-infinity'::timestamptz) END ASC NULLS LAST,
    b.creata_at DESC
  LIMIT 300
`;
