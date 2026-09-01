/**
 * L'audit del sito di un lead: una volta sola, qui.
 *
 * Fino a oggi esisteva DUE VOLTE — in Python dentro leadgen-italia e in
 * JavaScript dentro mywebby-automations. Non era un doppione innocuo: le due
 * copie davano a un lead due punteggi che potevano discordare, e nessuno dei
 * due era quello vero. Quando due numeri litigano, il tempo non si spende a
 * decidere chi ha ragione: si spende a scoprire che erano due programmi diversi.
 *
 * DUE SCELTE CHE CAMBIANO IL COMPORTAMENTO RISPETTO ALLE COPIE VECCHIE.
 *
 * 1. Si scrive uno STORICO, non una colonna. `updateLeadAudit` sovrascriveva:
 *    un audit fallito cancellava quello buono di ieri, e non si poteva vedere
 *    se un sito era migliorato. Qui ogni giro e' una riga.
 *
 * 2. Un audit fallito NON inventa un punteggio. Le due copie vecchie, quando
 *    l'AI non rispondeva, restituivano 75 se c'era un sito e 95 se non c'era —
 *    numeri finti indistinguibili da quelli veri. In una colonna che si
 *    sovrascrive era brutto; in uno storico e' veleno, perche' quel 95 finto
 *    resta li' per sempre a sembrare un giudizio. Qui un fallimento si scrive
 *    come fallimento: `esito='errore'`, punteggio NULL. La scansione tecnica,
 *    che e' vera anche senza AI, si salva lo stesso nelle note.
 */

import { query } from './db';
import { generaJson } from './generatore';
import { estraiRecapiti, paginaContatti } from './leggiSito';
import { normalizzaTelefono } from './normalizza';

export interface EsitoAudit {
  score: number | null;
  /** Cosa ne PENSA il modello. È un'opinione, e va mostrata come tale. */
  note: string;
  /**
   * Cosa si è VISTO: risponde? ha il viewport? ha un form?
   *
   * Separato da `note` apposta — vedi la migrazione in fondo a `db/schema.sql`.
   * Questo è vero anche quando l'AI è giù, e non cambia se cambia il modello.
   */
  scansione: string;
  hook: string | null;
  esito: 'ok' | 'errore';
  errore: string | null;
  /** Chi l'ha scritto: i punteggi di modelli diversi non sono confrontabili. */
  modello: string;
}

/**
 * I testi che un tema web si porta dietro dall'installazione, e che nessuno ha
 * mai sostituito. Trovarne uno vuol dire che il sito e' stato montato e lasciato
 * li': e' il rilievo piu' forte che sappiamo raccogliere senza guardare la
 * grafica, perche' e' un FATTO CITABILE — al telefono si legge la riga.
 *
 * ⚠️ NIENTE PAROLE GENERICHE. "demo", "test", "esempio" da soli fanno falsi
 * positivi a valanga (una pagina che dice "richiedi una demo" non e' un sito
 * abbandonato). Ogni voce qui dentro e' una stringa che compare SOLO se nessuno
 * l'ha tolta.
 */
const SEGNAPOSTO: Array<[RegExp, string]> = [
  [/12345\s+North\s+Main\s+Street/i, 'indirizzo di esempio del tema'],
  [/1\.888\.678\.9876|1-888-678-9876/i, 'numero verde di esempio del tema'],
  [/info@your-domain\.com|email@example\.com|you@example\.com/i, 'email di esempio del tema'],
  [/your-domain\.com|yourdomain\.com|www\.example\.com/i, 'dominio di esempio del tema'],
  [/lorem\s+ipsum\s+dolor/i, 'testo Lorem Ipsum mai sostituito'],
  [/Just\s+another\s+WordPress\s+site/i, 'sottotitolo WordPress mai cambiato'],
  [/\bYour\s+(Company|Business|Store)\s+Name\b/i, 'nome azienda segnaposto'],
  [/123[-\s]?456[-\s]?7890/i, 'numero di telefono di esempio'],
];

/**
 * In che punto della pagina sta quel testo — e se un visitatore ce lo trova
 * davanti o deve aprire qualcosa.
 *
 * ⚠️ PERCHE' ESISTE QUESTA FUNZIONE (01/09/2026). L'audit di La Peña diceva
 * «guscio vuoto che mostra i dati dimostrativi». I segnaposto c'erano davvero,
 * ma dentro il pannello scorrevole di Avada: chiusi finche' non ci clicchi
 * sopra. Chi ha aperto la home per verificare non ha visto niente e ha concluso
 * che il tool si inventasse le cose — giustamente, perche' «mostra» non era
 * vero.
 *
 * La differenza fra «in home, sotto gli occhi» e «nel pannello che si apre col
 * click» e' tutta la differenza fra un gancio che regge al telefono e uno che
 * fa fare la figura. Quindi si dice dove, sempre.
 */
function posizione(html: string, indice: number): string {
  const prima = html.slice(Math.max(0, indice - 4000), indice);
  const contenitori = [...prima.matchAll(/<(\w+)[^>]*\b(?:id|class)="([^"]{0,120})"/gi)]
    .slice(-8)
    .map((m) => `${m[1]} ${m[2]}`.toLowerCase());
  const contesto = contenitori.join(' ');

  if (/slidingbar|off-?canvas|modal|popup|drawer|overlay|display:\s*none|hidden/.test(contesto)) {
    return 'in un pannello che si apre col click (non si vede ad apertura pagina)';
  }
  if (/<footer|footer|copyright|colophon/.test(contesto)) return 'nel piede della pagina';
  if (/<header|header|topbar|masthead|navbar|menu/.test(contesto)) return 'nella testata';
  if (/<head\b/i.test(html.slice(0, indice)) && indice < html.toLowerCase().indexOf('<body')) {
    return 'nel codice della pagina, non a schermo';
  }
  return 'nel corpo della pagina';
}

/** I segnaposto trovati, ognuno con la sua riga e il suo posto. */
function segnaposto(html: string): string[] {
  const trovati: string[] = [];
  for (const [regola, cosa] of SEGNAPOSTO) {
    const m = regola.exec(html);
    if (!m || m.index === undefined) continue;
    trovati.push(`"${m[0].trim()}" (${cosa}), ${posizione(html, m.index)}`);
    if (trovati.length === 3) break; // Tre bastano per una telefonata.
  }
  return trovati;
}

/**
 * Cosa si vede del sito senza chiedere niente a nessuno.
 *
 * Questa parte e' vera anche quando l'AI e' giu', ed e' quella che risponde
 * alla domanda che conta davvero per una chiamata a freddo: il sito c'e'?
 * risponde? si vede da telefono?
 */
async function scansione(sito: string | null): Promise<{ nota: string; html: string; url: string | null }> {
  if (!sito || !sito.trim()) return { nota: 'Attività priva di un sito web ufficiale.', html: '', url: null };

  const url = sito.startsWith('http') ? sito : `https://${sito}`;
  try {
    const risposta = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!risposta.ok) return { nota: `Sito risponde con errore HTTP ${risposta.status}.`, html: '', url };

    /**
     * L'HTML torna indietro INTERO, e prima non era così: veniva ridotto a
     * minuscolo per due `includes` e poi buttato. Ma è la stessa pagina dove il
     * cliente ha scritto il proprio numero — vedi `estraiRecapiti`. Il
     * minuscolo serve solo ai due controlli qui sotto.
     */
    const html = await risposta.text();
    const minuscolo = html.toLowerCase();
    const viewport = minuscolo.includes('name="viewport"');
    const prenotazioni = minuscolo.includes('prenot') || minuscolo.includes('book');
    const resti = segnaposto(html);
    return {
      nota:
        `Sito esistente (HTTP ${risposta.status}). ` +
        `Viewport mobile: ${viewport ? 'PRESENTE' : 'MANCANTE'}. ` +
        `Form prenotazioni: ${prenotazioni ? 'PRESENTE' : 'MANCANTE'}. ` +
        (resti.length
          ? `Testi di esempio del tema ancora presenti: ${resti.join(' · ')}.`
          : 'Nessun testo di esempio del tema rimasto in home.'),
      html,
      url,
    };
  } catch (errore: unknown) {
    return { nota: perche(errore, url), html: '', url };
  }
}

/**
 * Perche' non l'abbiamo letto — detto come un fatto su DI NOI, non su di loro.
 *
 * ⚠️ IL CASO CHE HA INSEGNATO LA REGOLA (31/08/2026). Bludental e' un network
 * con 81 centri e un sito bellissimo. Il nostro `fetch` falliva in 60
 * millisecondi e la nota diceva «Sito non raggiungibile o offline»; il modello
 * ne ha ricavato «ho notato che il vostro sito non e' attivo» e una proposta
 * per rifarglielo. Se quel messaggio parte, la chiamata e' finita prima di
 * cominciare.
 *
 * La causa vera era UNABLE_TO_VERIFY_LEAF_SIGNATURE: il loro server manda una
 * catena di certificati incompleta. Browser e curl la riparano da soli
 * scaricando l'intermedio (AIA fetching), Node no. Il sito e' perfetto: cieco
 * era il nostro lettore.
 *
 * Quindi ogni fallimento dice cosa e' successo A NOI, e per il certificato dice
 * pure che il sito con ogni probabilita' funziona. Chi legge il gancio deve
 * sapere cosa puo' affermare al telefono.
 */
function perche(errore: unknown, url: string): string {
  const codice = String(
    (errore as { cause?: { code?: string } })?.cause?.code ??
      (errore as { code?: string })?.code ??
      ''
  );
  const messaggio = errore instanceof Error ? errore.message : String(errore);

  if (/CERT|SIGNATURE|SELF_SIGNED/i.test(codice)) {
    return (
      `Il sito risponde ma NOI non l'abbiamo letto: catena di certificati incompleta (${codice}). ` +
      'I browser la riparano da soli, quindi per i visitatori funziona. Non è un sito assente.'
    );
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(codice)) {
    return `Il dominio ${new URL(url).hostname} non esiste nei DNS: il sito non c'è davvero.`;
  }
  if (/TimeoutError|ABORT/i.test(codice) || /timeout/i.test(messaggio)) {
    return 'Il sito non ha risposto entro sei secondi: o è molto lento, o era giù in quel momento.';
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH/i.test(codice)) {
    return `Il server ha rifiutato la connessione (${codice}): il sito risulta spento adesso.`;
  }
  return `Non siamo riusciti a leggere il sito (${codice || messaggio}). Non vuol dire che non esista.`;
}

/**
 * I recapiti trovati sul sito finiscono in tabella.
 *
 * ⚠️ MAI `e_titolare`. Un numero letto da una pagina web dice «questa attività
 * si fa chiamare qui», non «questa persona può pubblicare sul sito e sulla
 * scheda Google di qualcuno». Quel permesso lo dà una persona, dalla scheda, e
 * resta l'unica cosa che si fa a mano — perché è l'unica che dà dei poteri.
 *
 * `ON CONFLICT DO NOTHING` come fa lo scraper: se il numero c'è già, quello
 * scritto da un umano vince e non viene ritoccato.
 */
async function raccogliRecapiti(aziendaId: number, html: string, url: string | null): Promise<number> {
  if (!html || !url) return 0;

  const recapiti = estraiRecapiti(html);

  /**
   * Se ne manca UNO DEI DUE si guarda anche la pagina «Contatti».
   *
   * ⚠️ Prima la condizione era «solo se non ho trovato niente», e sbagliava un
   * caso frequentissimo, visto sulla Fenice il 31/08/2026: in home c'è il
   * numero di telefono (nel piede, come su mezzo web), l'email no. Trovato il
   * telefono, non si cercava oltre e l'email restava sul sito. Costava una
   * richiesta risparmiata e un indirizzo perso.
   */
  if (!recapiti.telefoni.length || !recapiti.email.length) {
    const contatti = paginaContatti(html, url);
    if (contatti) {
      try {
        const risposta = await fetch(contatti, {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (risposta.ok) {
          // Si UNISCE, non si sostituisce: quello che c'era in home vale
          // quanto quello che c'è qui, e uno dei due potrebbe mancare di là.
          const altri = estraiRecapiti(await risposta.text());
          recapiti.telefoni = [...new Set([...recapiti.telefoni, ...altri.telefoni])].slice(0, 5);
          recapiti.email = [...new Set([...recapiti.email, ...altri.email])].slice(0, 5);
        }
      } catch {
        /* Il sito c'è ma la pagina contatti no: si va avanti con quello che si ha. */
      }
    }
  }

  const righe: Array<{ tipo: string; valore: string; normalizzato: string | null }> = [
    ...recapiti.telefoni.map((t) => ({ tipo: 'telefono', valore: t, normalizzato: normalizzaTelefono(t) })),
    ...recapiti.email.map((e) => ({ tipo: 'email', valore: e, normalizzato: e.toLowerCase() })),
  ];

  let scritti = 0;
  for (const r of righe) {
    if (!r.normalizzato) continue;
    const esito = await query<{ id: number }>(
      `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato, note, verificato_at)
       VALUES ($1, $2, $3, $4, 'trovato sul sito', now())
       ON CONFLICT (azienda_id, tipo, normalizzato) DO NOTHING
       RETURNING id`,
      [aziendaId, r.tipo, r.valore, r.normalizzato]
    );
    scritti += esito.length;
  }
  return scritti;
}

export interface DatiAzienda {
  nome: string;
  categoria: string | null;
  citta: string | null;
  sito: string | null;
}

/**
 * Il giudizio, chiesto alla CATENA.
 *
 * ⚠️ PRIMA ANDAVA DRITTO SU OPENROUTER, cioè sul fornitore a pagamento,
 * saltando i tre gratuiti che stanno sopra. Con 46 lead da analizzare erano 46
 * chiamate pagate per un lavoro che Groq fa gratis in un secondo e mezzo — e
 * nessuno se ne sarebbe accorto finché non arrivava la fattura, perché
 * funzionava benissimo.
 *
 * Era rimasto così perché l'audit è stato scritto prima della catena e nessuno
 * l'ha ricollegato dopo. È la stessa malattia dei due punteggi discordanti che
 * questo progetto cura: due strade per fare la stessa cosa, e quella vecchia
 * che continua a girare da sola.
 */
function eGiudizio(x: unknown): x is { score?: unknown; note?: unknown; hook?: unknown } {
  return Boolean(x) && typeof x === 'object';
}

async function chiediGiudizio(dati: DatiAzienda, note: string, letto: boolean): Promise<EsitoAudit> {
  /**
   * ⚠️ SE NON L'ABBIAMO VISTO, NON SE NE PARLA. E' il secondo giro della stessa
   * lezione, il 31/08/2026: reso onesto il messaggio d'errore, il modello ha
   * smesso di dire «il sito non e' attivo» e ha cominciato a dire «il
   * certificato genera un avviso di sicurezza nei browser» — mentre la
   * scansione diceva l'opposto, cioe' che i browser lo riparano da soli.
   *
   * Chiedergli di essere prudente non basta: finche' il compito e' «scrivi un
   * gancio sui punti deboli del sito», un modello un punto debole lo trova
   * comunque. Quindi quando il sito non e' stato letto GLI SI CAMBIA IL
   * COMPITO: niente diagnosi, si chiede il permesso di guardare.
   */
  const alBuio = letto
    ? ''
    : `
⚠️ IL SITO NON L'ABBIAMO VISTO. Non hai NESSUNA informazione su com'è fatto: non sai se è
lento, se è vecchio, se si vede da telefono, e non sai se i visitatori hanno problemi.
Quindi:
- "note": riporta solo cosa è successo a noi, senza dedurne conseguenze per i loro clienti.
- "score": basso (40 o meno). Un sito che non abbiamo letto non è un bisogno dimostrato.
- "hook": NON deve affermare niente sul loro sito, nemmeno sul certificato. Si presenta,
  dice che stavamo dando un'occhiata ai siti della zona e che il loro non siamo riusciti a
  caricarlo, e CHIEDE se va tutto bene. Una domanda, non una diagnosi.
`;

  const sistema =
    "Sei l'esperto di consulenza web di MyWebby (www.mywebby.it). Valuti quanto urgentemente " +
    "un'attività ha bisogno di un sito nuovo, e scrivi il messaggio con cui aprire il discorso. " +
    'Rispondi solo con l’oggetto JSON richiesto, senza niente attorno.';

  const utente = `
Dati dell'azienda:
- Nome: "${dati.nome}"
- Categoria: "${dati.categoria || 'Attività commerciale'}"
- Città: "${dati.citta || 'Italia'}"
- Sito attuale: "${dati.sito || 'Nessuno'}"
- Esito della scansione tecnica: "${note}"

Compiti:
1. "score" da 1 a 100: quanto urge un sito nuovo. 95 per chi non ce l'ha o ha errori,
   80 per chi ha un sito datato o non leggibile da telefono, 40 per chi sta già bene.
2. "note": due righe sui punti deboli, concrete, senza gergo.

   ⚠️ SE LA SCANSIONE DICE CHE NON SIAMO RIUSCITI A LEGGERE IL SITO, NON
   CONCLUDERE CHE IL SITO NON ESISTE O NON FUNZIONA. Sono due cose diverse: un
   certificato che il nostro lettore non verifica, o un server lento, non sono
   un'attività senza presenza online. In quel caso lo "score" resta basso e il
   "hook" NON deve proporre di rifare un sito che nessuno ha visto: al massimo
   chiede conferma. Il 31/08/2026 e' andata cosi' con un network di 81 centri
   odontoiatrici dal sito impeccabile.

   ⚠️ NON CONTRADDIRE LA SCANSIONE, E NON AGGIUNGERCI NIENTE. Quella riga è
   l'unica cosa che qualcuno ha davvero guardato. Del sito NON hai visto la
   grafica, non hai misurato la velocità, non sai se è "datato" o "poco
   accattivante": se lo scrivi te lo stai inventando, e questo testo finisce
   letto al telefono a chi quel sito ce l'ha davanti. Il 31/08/2026 è successo
   con un sito responsive, di cui la scansione diceva "viewport PRESENTE": ne è
   uscito "non ottimizzato per i dispositivi recenti".
   ⚠️ DI' SEMPRE DOVE. Ogni cosa che affermi deve dire in che punto del sito si
   vede, con le stesse parole della scansione. "Nel piede della pagina c'è ancora
   l'indirizzo di esempio del tema" si verifica in dieci secondi; "il sito mostra
   dati dimostrativi" no, e chi la legge va a controllare, non trova niente e
   smette di fidarsi del programma. Se la scansione dice che una cosa sta in un
   pannello che si apre col click, NON scrivere che il sito la "mostra": scrivi
   che c'è, e dove. Il 01/09/2026 è successo esattamente questo con un
   ristorante: i segnaposto c'erano, ma dentro la barra scorrevole di Avada.

   ⚠️ NIENTE AGGETTIVI CHE NON PUOI MOSTRARE. "Datato", "poco professionale",
   "anonimo", "non accattivante" non sono nella scansione e non li hai visti:
   sono giudizi sulla grafica, e la grafica è l'unica cosa che il cliente
   conosce meglio di te. Descrivi il fatto e fermati.

   Se la scansione non rileva problemi, la risposta giusta è dirlo — e allora
   anche lo "score" deve essere basso, perché un'attività che sta bene non ha
   bisogno di niente con urgenza. Un punteggio alto con una scansione pulita è
   una contraddizione, non una vendita.
3. "hook": massimo 3 righe per aprire una conversazione su WhatsApp o via email. Tono
   professionale, cordiale, mai da marketer aggressivo. Personalizzato, con una soluzione
   concreta (sito leggibile da telefono, menù o prenotazioni online, velocità).
   Niente prezzi, niente promesse di risultati, niente superlativi.

   ⚠️ MAI SEGNAPOSTO. Niente [Nome], [Città], [inserire qui] o simili: questo testo viene
   letto al telefono o incollato in una chat così com'è, e "sono parentesi quadra Nome"
   è esattamente la figura che fa chiudere la chiamata. Se non sai una cosa, non nominarla:
   si firma "MyWebby" e basta, senza nome proprio.

Rispondi SOLO con:
{"score": 90, "note": "…", "hook": "…"}
${alBuio}
`.trim();

  try {
    const esito = await generaJson(sistema, utente, eGiudizio);
    const score = Number(esito.dato.score);
    return {
      // Uno score fuori scala è un modello che ha sbagliato, non un giudizio
      // basso: si scarta invece di salvarlo storto.
      score: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
      note: String(esito.dato.note ?? note).trim() || note,
      scansione: note,
      hook: String(esito.dato.hook ?? '').trim() || null,
      esito: 'ok',
      errore: null,
      modello: esito.modello,
    };
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    // Anche col modello giu' la scansione resta: e' quella che vale.
    return { score: null, note, scansione: note, hook: null, esito: 'errore', errore: motivo, modello: 'nessuno' };
  }
}

/**
 * Analizza un'azienda e SCRIVE una riga di storico.
 *
 * Il modello si registra sempre, anche quando il giro fallisce: i punteggi di
 * modelli diversi non sono confrontabili fra loro, e fra sei mesi "questo lead
 * fa 90" senza sapere chi l'ha detto non vuol dire niente.
 */
export async function analizzaAzienda(aziendaId: number): Promise<EsitoAudit> {
  const [azienda] = await query<DatiAzienda>(
    `SELECT a.nome, a.categoria, a.citta,
            (SELECT c.valore FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.tipo = 'sito'
              ORDER BY c.id LIMIT 1) AS sito
       FROM wesion.azienda a WHERE a.id = $1`,
    [aziendaId]
  );
  if (!azienda) throw new Error(`azienda ${aziendaId} inesistente`);

  const scansionato = await scansione(azienda.sito);

  /**
   * I recapiti PRIMA del giudizio, e non è indifferente: se il modello è giù o
   * la catena è satura, l'audit fallisce ma il telefono resta preso. È la parte
   * che non ha bisogno di nessuna AI, e non deve dipenderne.
   */
  const recapiti = await raccogliRecapiti(aziendaId, scansionato.html, scansionato.url);
  if (recapiti) console.log(`[audit] azienda ${aziendaId}: ${recapiti} recapiti presi dal sito`);

  // `html` vuoto = non l'abbiamo letto, per qualunque ragione.
  const esito = await chiediGiudizio(azienda, scansionato.nota, Boolean(scansionato.html));

  await query(
    `INSERT INTO wesion.audit (azienda_id, modello, sito_letto, score, note, scansione, hook, esito, errore)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [aziendaId, esito.modello, azienda.sito, esito.score, esito.note, esito.scansione,
     esito.hook, esito.esito, esito.errore]
  );

  return esito;
}
