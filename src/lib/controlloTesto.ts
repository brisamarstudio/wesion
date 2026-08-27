/**
 * Rileggere il testo generato prima che lo legga l'operatore.
 *
 * Arriva da gbp-autoposter senza modifiche alle regole: sono state pagate una
 * volta e non si riscrivono a memoria. L'unica differenza e' che qui il limite
 * di caratteri sta in questo file invece che in `gbp.ts`, perche' Wesion non
 * importa il client di Google per rileggere una stringa.
 *
 * PERCHE' NON BASTA SCRIVERLO NEL PROMPT. Le regole dicono al modello tutto
 * quello che c'e' da dire, e il modello quasi sempre obbedisce. Quasi. Provando
 * dodici generazioni di fila su un cliente vero (25/07/2026), due sono uscite
 * con "Sono vent'anni che lavoro con il legno": un numero inventato di sana
 * pianta, che il prompt vietava gia' esplicitamente. Non e' bastato.
 *
 * Quello che non puoi permetterti di veder pubblicato non lo affidi a
 * un'istruzione, lo controlli. Con una differenza: il preambolo ("Ecco il tuo
 * post:") si CORREGGE da solo, questi no. Non si tagliano frasi a caso da un
 * testo che deve restare sensato — si accende una spia e decide chi legge.
 * L'ultimo bottone resta suo.
 *
 * Cosa NON e': un filtro che blocca. Un avviso qui non impedisce di pubblicare,
 * perche' un falso positivo che blocca il lavoro verrebbe disattivato entro una
 * settimana, e allora tanto vale non averlo.
 */

/** Il limite dell'API di Google per il corpo di un post. */
export const GBP_MAX_CARATTERI = 1500;

export interface AvvisoTesto {
  /** Che classe di problema: serve a decidere il colore, non a fare filtri. */
  gravita: 'grave' | 'attenzione';
  /** Detto all'operatore, non al programmatore. */
  messaggio: string;
  /**
   * Il pezzo di testo che ha fatto scattare l'avviso.
   *
   * Serve a poterlo RITIRARE: se quella stessa cosa sta scritta in un fatto
   * verificato del cliente, non e' un'invenzione del modello ed e' sbagliato
   * segnalarla. Presente solo sugli avvisi che parlano di contenuto; quelli di
   * forma (emoji, markdown, contatti) non hanno prova perche' nessun fatto puo'
   * giustificarli.
   */
  prova?: string;
}

/**
 * Numeri scritti in lettere, che nei post escono piu' spesso delle cifre.
 *
 * ⚠️ Mancavano gli undici-diciannove, e non era una svista innocua: l'elenco
 * aveva `dieci` e `quindici` e saltava tutto il resto. Trovato il 27/08/2026
 * provando un generatore nuovo, che ha scritto "Da DODICI anni Marco sta in
 * sala" — un'anzianita' in lettere che passava il controllo indisturbata
 * mentre "da 12 anni" veniva presa. Lo stesso fatto, scritto in due modi, con
 * due esiti diversi: e' peggio di un controllo che manca, perche' sembra che
 * ci sia.
 */
const DECINE =
  "dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|" +
  "vent[i']|trent[a']|quarant[a']|cinquant[a']|sessant[a']|settant[a']|ottant[a']|novant[a']|cent[o']";

/**
 * Roba che il modello non puo' sapere e che quindi si e' inventato.
 *
 * Vale su qualsiasi piazza — Google, sito, WhatsApp — perche' non dipende da
 * dove finisce il testo ma dal fatto che sono cose che cambiano o che vanno
 * provate.
 */
export function controllaFattiInventati(testo: string): AvvisoTesto[] {
  const t = testo || '';
  const avvisi: AvvisoTesto[] = [];
  const grave = (messaggio: string, prova?: string) => avvisi.push({ gravita: 'grave', messaggio, prova });
  const attenzione = (messaggio: string, prova?: string) =>
    avvisi.push({ gravita: 'attenzione', messaggio, prova });

  // Anni di attivita': "da 20 anni", "vent'anni", "30 anni di esperienza".
  const anni = new RegExp(`\\b(?:\\d{1,3}|${DECINE})\\s*anni\\b`, 'i').exec(t);
  if (anni) {
    grave(
      "Cita un numero di anni di attività: il modello non lo sa, se l'è inventato. Toglilo o verificalo.",
      anni[0]
    );
  }
  // "dal 1985", "fin dal 1970".
  const fondazione = /\b(?:dal|sin dal|fin dal|since)\s+(?:18|19|20)\d{2}\b/i.exec(t);
  if (fondazione) {
    grave("Cita l'anno di fondazione: va verificato prima di pubblicarlo.", fondazione[0]);
  }
  // "da anni", "da generazioni", "da sempre". Nessun numero, quindi i controlli
  // qui sopra non le vedono — e sono uscite davvero (25/07/2026, primo articolo
  // generato: "da anni mi occupo di questo tipo di interventi"). Solo
  // 'attenzione': spesso sono vere, ma nessuno le ha mai confermate, e sono la
  // frase di riempimento con cui un pezzo comincia quando non ha niente da dire.
  if (/\bda\s+(?:anni|sempre|generazioni|decenni|tempo immemore|oltre un decennio)\b/i.test(t)) {
    attenzione(
      'Dice "da anni / da sempre / da generazioni": è un\'anzianità che nessuno ha verificato. Se è vera va bene, ma controllala.'
    );
  }
  // "oltre 500 clienti", "piu' di 1000 lavori". Niente "circa": e' un'esitazione,
  // non un vanto, e "circa venti minuti" e' una descrizione onesta del lavoro.
  const quantita = /\b(?:oltre|più di|piu' di)\s+\d{2,}\b/i.exec(t);
  if (quantita) {
    grave('Cita una quantità ("oltre N…"): è un numero che nessuno ha verificato.', quantita[0]);
  }
  const premio = /\b(?:premio|premiat[oi]|riconoscimento|classific)\w*/i.exec(t);
  if (premio) {
    grave('Sembra citare un premio o una classifica: sono cose che vanno provate.', premio[0]);
  }
  // Superlativo di piazza — "i migliori della zona". Con l'articolo davanti,
  // altrimenti prende anche "il legno vecchio e' migliore di quello nuovo", che
  // e' un confronto fra materiali e non con i concorrenti.
  if (/\b(?:il|i|la|le)\s+miglior[ei]\s+(?:del|della|dei|delle|di|in)\b/i.test(t)) {
    attenzione('Suona come "i migliori della zona": è un confronto che va provato.');
  }
  const certificazione =
    /\b(?:certificat[oi]|certificazione|DOP|IGP|biologic[oi]|km\s*0|a chilometro zero|FSC)\b/i.exec(t);
  if (certificazione) {
    grave('Cita una certificazione o una denominazione: va confermata dal cliente.', certificazione[0]);
  }
  // ⚠️ La prima versione cercava la parola "prezzo" secca, e su un articolo vero
  // ha suonato per "Non è una questione di prezzo, è una questione di risultato"
  // — una frase che il prezzo lo NEGA. Il divieto è dire QUANTO costa, non
  // nominare l'esistenza del denaro: serve una cifra vicino, o una parola che è
  // già di per sé un'offerta.
  const prezzi = [
    /€\s*\d|\d\s*€/,
    /\b\d+(?:[.,]\d+)?\s*euro\b/i,
    /\ba partire da\s*€?\s*\d/i,
    /\bprezz[oi]\s+(?:di\s+\d|scontat|special|bloccat)/i,
    /\bscont[oi]\b|\bpromozion[ei]\b|\bsaldi\b|\bofferte? special[ei]\b/i,
  ];
  if (prezzi.some((r) => r.test(t))) {
    grave('Parla di prezzi o promozioni: cambiano, e un post resta.');
  }
  // ⚠️ La prima versione cercava "apertura" e "chiusura" secche. Per un falegname
  // sono i pezzi di una finestra: "la chiusura della persiana" è il mestiere, non
  // un orario. Serve il contesto di tempo, o l'avviso suona a ogni post e nel
  // giro di una settimana nessuno lo guarda più.
  const orari = [
    /\borari?\s+(?:di\s+)?(?:apertura|chiusura|continuato)\b/i,
    /\bsiamo\s+(?:aperti|chiusi)\b/i,
    /\bchius[oi]\s+(?:il|la|per\s+ferie|dal|ogni)\b/i,
    /\bapert[oi]\s+(?:dal|dalle|tutti i giorni|anche (?:il|la|di))\b/i,
    /\b(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\b[^.]{0,40}\b(?:dalle|alle|ore)\b/i,
  ];
  if (orari.some((r) => r.test(t))) {
    grave('Parla di orari o giorni di apertura: cambiano, e chi ci crede trova la porta chiusa.');
  }

  return avvisi;
}

/**
 * I controlli in piu' che valgono solo su Google Business Profile.
 *
 * Sono le regole che il 20/07/2026 sono costate la sospensione della scheda di
 * Artigiano il Conte: contatti nel testo ed emoji a raffica. Quelle due sono
 * 'grave' non per gusto, ma perche' il prezzo lo conosciamo.
 */
export function controllaPostGoogle(testo: string): AvvisoTesto[] {
  const t = testo || '';
  const avvisi: AvvisoTesto[] = [...controllaFattiInventati(t)];
  const grave = (messaggio: string) => avvisi.push({ gravita: 'grave', messaggio });
  const attenzione = (messaggio: string) => avvisi.push({ gravita: 'attenzione', messaggio });

  // ── Niente contatti nel testo ──────────────────────────────────────────────
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t)) {
    grave("C'è un indirizzo email nel testo. È uno dei motivi per cui Google ha rimosso un post il 20/07/2026.");
  }
  if (/(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:it|com|net|org|eu)\b/i.test(t)) {
    grave("C'è un indirizzo web nel testo. Il link ha già il suo pulsante sotto il post.");
  }
  // Telefono: nove cifre o piu', anche spezzate da spazi, punti o trattini.
  if (/(?:\+?\s*39[\s.-]*)?(?:\d[\s.-]*){9,}/.test(t.replace(/\d{1,3}\s*anni/gi, ''))) {
    grave("C'è quello che sembra un numero di telefono. La scheda ha già il pulsante Chiama.");
  }

  // ── Al massimo due emoji ───────────────────────────────────────────────────
  const emoji = t.match(/\p{Extended_Pictographic}/gu) || [];
  if (emoji.length > 2) {
    grave(
      `Ci sono ${emoji.length} emoji: il massimo è due. Tre fanno sembrare il post un volantino, ed è la faccia che Google guarda.`
    );
  }

  // ── Niente hashtag ─────────────────────────────────────────────────────────
  if (/(?:^|\s)#\w+/.test(t)) {
    attenzione('Ci sono degli hashtag: su Google non servono a niente.');
  }

  // ── Niente inviti generici ─────────────────────────────────────────────────
  // "Chiamaci per un preventivo" è testualmente l'esempio della regola, e la
  // prima versione di questa riga lo lasciava passare perché pretendeva
  // "chiamaci ORA". L'imperativo di contatto è sbagliato in sé, non per l'avverbio.
  if (
    /\b(?:contattaci|contattateci|chiamaci|chiamateci|scrivici|scriveteci|chiama (?:ora|subito)|visita il (?:nostro )?sito|scopri di più|prenota (?:ora|subito)|vieni a trovarci|venite a trovarci)\b/i.test(
      t
    )
  ) {
    attenzione('C\'è un invito generico ("Contattaci", "Chiama ora"…): i pulsanti della scheda lo fanno meglio.');
  }

  // ── Niente Markdown ────────────────────────────────────────────────────────
  if (/\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|^#{1,6}\s/m.test(t)) {
    attenzione('È rimasto del Markdown: su Google comparirebbero gli asterischi in chiaro.');
  }

  // ── Vincolo dell'API ───────────────────────────────────────────────────────
  if (t.length > GBP_MAX_CARATTERI) {
    grave(`Il testo è di ${t.length} caratteri: Google ne accetta ${GBP_MAX_CARATTERI}, la pubblicazione fallirebbe.`);
  }
  if (t.trim().length === 0) {
    grave('Il testo è vuoto.');
  }

  return avvisi;
}

/**
 * Ritira gli avvisi che un fatto verificato giustifica.
 *
 * ⚠️ NASCE DA UN FALSO POSITIVO VERO. Il 27/08/2026, generando il piano di un
 * mese, quattro post su diciotto sono stati segnati come "cita un numero di
 * anni di attività: se l'è inventato". Ma il fatto da cui nascevano diceva
 * testualmente "Marco in sala da 12 anni" — verificato, detto dal cliente. Il
 * modello aveva fatto esattamente il suo lavoro.
 *
 * Perché conta più di quanto sembri: un avviso che suona su una cosa vera
 * insegna a ignorare gli avvisi. Con quattro rossi su diciotto per lo stesso
 * motivo sbagliato, entro una settimana nessuno li guarda più — e il giorno che
 * ne scatta uno giusto passa insieme agli altri.
 *
 * Vale solo per gli avvisi di CONTENUTO, quelli che portano una `prova`. Un
 * fatto verificato non può giustificare tre emoji o un numero di telefono nel
 * testo: quelle sono regole di forma, e nessun cliente le rende lecite.
 */
export function ritiraGiustificati(avvisi: AvvisoTesto[], fattiVeri: string[]): AvvisoTesto[] {
  if (!fattiVeri.length) return avvisi;
  const materia = perConfronto(fattiVeri.join(' \n '));
  return avvisi.filter((a) => !a.prova || !materia.includes(perConfronto(a.prova)));
}

/**
 * Due stringhe che si leggono uguali devono confrontarsi uguali.
 *
 * ⚠️ NASCE DA UN CARATTERE INVISIBILE. Il 27/08/2026 un avviso continuava a
 * scattare su "12 anni" nonostante quelle stesse parole fossero in un fatto
 * verificato. Guardando i codici dei caratteri: il modello aveva scritto lo
 * spazio come U+202F (spazio unificatore stretto, codice 8239) invece del
 * normale U+0020 (32). Sullo schermo sono identici; per `includes` sono due
 * stringhe diverse.
 *
 * È il tipo di guasto che non si trova leggendo, e che fa tornare i falsi
 * positivi proprio nel sistema che serviva a toglierli — cioè fa smettere di
 * fidarsi degli avvisi, che è il danno vero.
 *
 * Si normalizza qualunque spazio unicode (`\s` in modalità unicode li prende
 * tutti: no-break, stretti, em, tabulazioni) e si schiaccia il minuscolo.
 */
function perConfronto(s: string): string {
  return s.replace(/\s+/gu, ' ').trim().toLowerCase();
}

/**
 * Il controllo giusto per il tipo di bozza.
 *
 * Il menu del giorno finisce sul sito del cliente, dove un orario o un prezzo
 * non solo sono leciti, sono IL contenuto. Applicargli le regole di Google
 * accenderebbe una spia grave su ogni singolo menu — e una spia che suona
 * sempre e' una spia spenta.
 *
 * `fattiVeri` sono le cose che il cliente ci ha confermato. Passarle è
 * facoltativo ma quasi sempre giusto: senza, si segnala come inventato anche
 * ciò che è stato verificato.
 */
export function controllaBozza(tipo: string, testo: string, fattiVeri: string[] = []): AvvisoTesto[] {
  if (tipo === 'menu') return [];
  const avvisi = tipo === 'post_gbp' ? controllaPostGoogle(testo) : controllaFattiInventati(testo);
  return ritiraGiustificati(avvisi, fattiVeri);
}
