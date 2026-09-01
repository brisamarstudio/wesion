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
  pubblicata: 'Pubblicata',
  rifiutata: 'Rifiutata',
  scaduta: 'Scaduta',
};

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
    ), '[]'::json) AS pubblicazioni
  FROM wesion.bozza b
  JOIN wesion.azienda a ON a.id = b.azienda_id
  LEFT JOIN wesion.fatto f ON f.id = b.fatto_id
  ORDER BY
    -- Quello che aspetta una persona sta in cima: e' l'unica coda che si ferma
    -- se nessuno la guarda. Il resto e' storia e puo' scorrere sotto.
    (b.stato = 'attesa_approvazione') DESC,
    b.creata_at DESC
  LIMIT 300
`;
