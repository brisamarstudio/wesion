/**
 * Leggere quello che il modello propone per il sito di un cliente.
 *
 * ⚠️ DUE LEZIONI PAGATE IN PRODUZIONE, TUTTE E DUE SUL FORMATO DELLA RICHIESTA.
 *
 * 1. NON SI CHIEDE UN JSON (02/09/2026, mattina). La prima versione chiedeva
 *    `{"modifiche":[{"contenuto_nuovo": "<il file>"}]}` e si è rotta con DUE
 *    modelli diversi (`gpt-oss-120b`, `gemini-2.5-flash`), tutti e due con
 *    "Unterminated string" quasi allo stesso punto: per stare dentro un campo
 *    JSON un file va escapato riga per riga, e su qualche migliaio di
 *    caratteri sbagliano tutti. Con i delimitatori non c'è niente da escapare.
 *
 * 2. NON SI FA RISCRIVERE UN FILE CHE ESISTE GIÀ (02/09/2026, poco dopo — la
 *    PR #1 su `trattorialafenice`). Chiesto di restituire `Layout.astro`
 *    intero, il modello non l'ha modificato: l'ha RIGENERATO a memoria. Nel
 *    farlo ha cancellato lo schema BlogPosting, lo skip-link, `og:site_name`,
 *    lo script del cambio lingua, e ha lasciato un riferimento a una variabile
 *    che non esiste (`jsonLd` invece di `graph`) — cioè un sito che non
 *    compila. 85 righe tolte per aggiungerne tre di schema.
 *
 *    Quindi: un file che esiste si tocca SOLO con una sostituzione mirata, che
 *    fallisce da sola se il punto d'aggancio non combacia. Riscrivere per
 *    intero è concesso solo a chi nasce adesso, o ai file piccoli e
 *    autocontenuti (`llms.txt`, `robots.txt`), dove non c'è nulla da perdere.
 *
 * Sta in `lib/` e non nel route perché è logica, e perché così si prova senza
 * accendere mezzo mondo — vedi `db/prova-seo-proposta.ts`.
 */

/** Un file che, anche se esiste, si può riscrivere per intero senza rischi. */
export const RISCRIVIBILI_INTERI = ['llms.txt', 'robots.txt', 'llm.txt'];

export interface ModificaProposta {
  /** Relativo alla radice del repo. */
  percorso: string;
  motivo: string;
  /** `scrivi`: il file intero. `sostituisci`: solo il pezzo che cambia. */
  azione: 'scrivi' | 'sostituisci';
  /** Solo per `scrivi`. */
  contenuto_nuovo?: string;
  /** Solo per `sostituisci`: il testo esatto da trovare nel file. */
  cerca?: string;
  /** Solo per `sostituisci`: quello che prende il suo posto. */
  con?: string;
}

export interface Proposta {
  modifiche: ModificaProposta[];
  riepilogo: string;
  /**
   * I blocchi buttati via e perché.
   *
   * ⚠️ Non è un dettaglio da log. Nella PR #1 il modello aveva ANNUNCIATO tre
   * file e ne era arrivato uno solo: gli altri due erano blocchi malformati,
   * scartati senza dire niente. Una macchina che promette tre cose e ne fa una
   * sola in silenzio è peggio di una che fallisce.
   */
  scartati: string[];
}

export const MARCA = {
  riepilogo: 'WESION:RIEPILOGO',
  file: 'WESION:FILE',
  motivo: 'WESION:MOTIVO',
  scrivi: 'WESION:SCRIVI',
  cerca: 'WESION:CERCA',
  con: 'WESION:CON',
  fine: 'WESION:FINE',
} as const;

/** Un percorso che scriverebbe fuori dalla copia clonata del repo. */
function percorsoPericoloso(percorso: string): boolean {
  return (
    !percorso ||
    percorso.startsWith('/') ||
    percorso.includes('..') ||
    /^[a-zA-Z]:/.test(percorso) ||
    percorso.startsWith('.git/')
  );
}

export function riscrivibileIntero(percorso: string): boolean {
  const nome = percorso.split('/').pop()?.toLowerCase() ?? '';
  return RISCRIVIBILI_INTERI.includes(nome);
}

/**
 * I dati che dicono COS'È il cliente, non come è indicizzato.
 *
 * ⚠️ NASCE DALLA PR #2 SU `trattorialafenice` (02/09/2026). Quella proposta era
 * buona — `containedInPlace` e `knowsAbout`, roba da playbook — e in mezzo,
 * dentro lo stesso blocco, aveva cambiato `"priceRange": "$$"` in `"$"`. Cioè
 * aveva riclassificato la fascia di prezzo di un ristorante vero, che finisce
 * nei risultati di Google, senza avere il minimo modo di saperla.
 *
 * Il prompt dice già di non toccare i contenuti; questo lo rende impossibile
 * invece che sconsigliato. Una sostituzione che cambia uno di questi valori
 * viene scartata INTERA, anche se il resto era buono: perdere una proposta
 * giusta costa un giro, cambiare un fatto sul cliente in silenzio costa la
 * fiducia di chi legge la PR — e a quel punto le legge una per una.
 */
const CHIAVI_DI_FATTO = [
  'priceRange',
  'telephone',
  'email',
  'streetAddress',
  'postalCode',
  'addressLocality',
  'addressRegion',
  'latitude',
  'longitude',
  'openingHours',
  'openingHoursSpecification',
  'servesCuisine',
  'starRating',
  'ratingValue',
  'reviewCount',
  'foundingDate',
];

/** Le chiavi di fatto il cui VALORE cambia fra il testo cercato e quello nuovo. */
export function fattiAlterati(cerca: string, con: string): string[] {
  const alterate: string[] = [];

  for (const chiave of CHIAVI_DI_FATTO) {
    // Il valore fino alla fine della riga: basta a confrontare, e non prova a
    // capire il JSON (che qui dentro è un pezzo di file, non un documento).
    const dove = new RegExp(`["']${chiave}["']\\s*:\\s*([^\\n]*)`, 'g');
    const prima = [...cerca.matchAll(dove)].map((m) => m[1].trim());
    if (!prima.length) continue; // non c'era: non è una modifica di un fatto
    const dopo = [...con.matchAll(dove)].map((m) => m[1].trim());
    if (prima.join('\n') !== dopo.join('\n')) alterate.push(chiave);
  }

  return alterate;
}

export function leggiProposta(risposta: string): Proposta {
  const testo = String(risposta ?? '').replace(/\r\n/g, '\n');

  const riepilogo = testo.match(new RegExp(`^${MARCA.riepilogo}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';

  const modifiche: ModificaProposta[] = [];
  const scartati: string[] = [];

  /**
   * Si taglia la risposta sui `WESION:FILE` e si guarda un blocco per volta.
   *
   * ⚠️ Un blocco malformato deve rimanere un problema SUO: con una regex sola
   * che attraversa gli a capo, un blocco a cui manca l'apertura si allunga
   * fino al blocco dopo e ne ruba il contenuto — scrivendo il file giusto
   * sotto il percorso sbagliato, senza un errore da nessuna parte. Preso dalla
   * prova, non da una revisione fortunata.
   */
  const pezzi = testo.split(new RegExp(`^${MARCA.file}:`, 'm')).slice(1);

  for (const pezzo of pezzi) {
    const percorso = pezzo.split('\n', 1)[0].trim();
    const motivo = pezzo.match(new RegExp(`^${MARCA.motivo}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';

    if (percorsoPericoloso(percorso)) {
      scartati.push(`${percorso || '(senza percorso)'}: percorso non ammesso`);
      continue;
    }

    // Riscrittura intera.
    const scrivi = pezzo.match(
      new RegExp(`^${MARCA.scrivi}[ \\t]*\\n([\\s\\S]*?)\\n${MARCA.fine}[ \\t]*$`, 'm')
    );
    if (scrivi) {
      modifiche.push({ percorso, motivo, azione: 'scrivi', contenuto_nuovo: scrivi[1] });
      continue;
    }

    // Sostituzione mirata: CERCA ... CON ... FINE.
    const sostituisci = pezzo.match(
      new RegExp(
        `^${MARCA.cerca}[ \\t]*\\n([\\s\\S]*?)\\n${MARCA.con}[ \\t]*\\n([\\s\\S]*?)\\n${MARCA.fine}[ \\t]*$`,
        'm'
      )
    );
    if (sostituisci) {
      if (!sostituisci[1].trim()) {
        scartati.push(`${percorso}: il testo da cercare è vuoto`);
        continue;
      }
      modifiche.push({ percorso, motivo, azione: 'sostituisci', cerca: sostituisci[1], con: sostituisci[2] });
      continue;
    }

    scartati.push(`${percorso}: blocco incompleto (manca ${MARCA.scrivi} o ${MARCA.cerca}/${MARCA.con}/${MARCA.fine})`);
  }

  return { modifiche, riepilogo, scartati };
}
