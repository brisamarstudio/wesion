/**
 * Chi scrive i testi — e in che ordine si chiede.
 *
 * LA CATENA, DAL GRATIS AL CARO. Groq regala inferenza velocissima; OpenRouter
 * si paga. Con 15 clienti e 4 post a settimana sono circa 270 generazioni al
 * mese: la differenza fra le due strade non è teorica.
 *
 * Ma il gratis ha limiti di frequenza e può rispondere 429 nel mezzo di un
 * pomeriggio di lavoro. Per questo è una catena e non una scelta: si prova il
 * primo, e se non risponde si passa al successivo. Chi ha scritto il testo
 * finisce in `bozza.modello`, perché fra sei mesi "questo post fa schifo" è una
 * frase inutile se non si sa chi l'ha scritto.
 *
 * ⚠️ QUELLO CHE NON PUOI PERMETTERTI DI VEDER PUBBLICATO NON LO AFFIDI A
 * UN'ISTRUZIONE. Il prompt dice al modello di non mostrare il ragionamento.
 * Provato il 27/08/2026: `qwen/qwen3.6-27b` lo ha sputato lo stesso, in inglese,
 * dentro tag `<think>`. Quindi si toglie anche col codice — è la stessa lezione
 * del preambolo "Ecco il tuo post:", che si taglia invece di sperare.
 */

export interface Modello {
  /** Come si chiama in `bozza.modello`: fornitore/modello. */
  nome: string;
  url: string;
  chiaveEnv: string;
  modello: string;
  /** Gratis o a consumo: serve a saperlo, non cambia il comportamento. */
  costa: boolean;
  /**
   * Quanto deve pensare prima di scrivere, col nome che usa QUESTO fornitore.
   *
   * ⚠️ Non e' un booleano perche' i valori ammessi cambiano da modello a
   * modello, e sbagliarli non degrada: rifiuta la richiesta con un 400. Il
   * 27/08/2026 la catena sembrava avere due anelli gratuiti e ne aveva uno solo
   * — `qwen` rispondeva 400 a ogni chiamata perche' gli passavamo 'low', che
   * per lui non esiste: accetta 'none' o 'default'. Sei post su diciotto sono
   * finiti sul fornitore a pagamento per questo, non per mancanza di capacita'.
   */
  ragiona?: string;
}

/**
 * L'ordine conta: si scende solo quando quello sopra non risponde.
 *
 * `gpt-oss-120b` è primo per merito, non per prezzo: provato il 27/08/2026 su
 * uno slot vero, ha scritto l'italiano migliore dei tre in 1,4 secondi.
 */
export const CATENA: Modello[] = [
  {
    nome: 'groq/openai/gpt-oss-120b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    chiaveEnv: 'GROQ_API_KEY',
    modello: 'openai/gpt-oss-120b',
    costa: false,
    // gpt-oss accetta low/medium/high.
    ragiona: 'low',
  },
  {
    nome: 'groq/qwen/qwen3.6-27b',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    chiaveEnv: 'GROQ_API_KEY',
    modello: 'qwen/qwen3.6-27b',
    costa: false,
    // qwen accetta solo 'none' o 'default'. 'none' e' anche il modo giusto di
    // zittire i tag <think> che altrimenti finiscono nel testo.
    ragiona: 'none',
  },
  /**
   * Nara, secondo. Gratis, e scrive bene.
   *
   * ⚠️ SOLO I MODELLI COL SUFFISSO `-free` SONO DAVVERO GRATIS. Il listino ne
   * mostra 54, compresi nomi di punta, ma provati il 27/08/2026 quelli senza
   * suffisso rispondono `429 Insufficient credits`: la quota giornaliera copre
   * un sottoinsieme. Cambiare questo modello con uno più altisonante vuol dire
   * spegnere l'anello senza accorgersene, perché la catena scivola al
   * successivo in silenzio.
   *
   * `minimax-m3-free` è stato il migliore della giornata come testo — legge
   * come una persona invece che come un'agenzia — a 8,5 secondi. Scartati:
   * `tencent-hy3-free` (risposta vuota), `qwen-3.8-max-free` (41 secondi),
   * `mimo-v2.5-free` (402 payment_required).
   *
   * ⚠️ DIPENDE DA UN CANALE TELEGRAM. L'accesso richiede di essere iscritti a
   * un canale e di aver ricollegato l'account: se un giorno esci, o loro lo
   * chiudono, la chiave smette di funzionare. Non lo sapresti da un avviso, lo
   * vedresti dai post che non escono — per questo sta secondo e non primo, e
   * per questo sotto c'è ancora chi lo sostituisce.
   */
  {
    nome: 'nara/minimax-m3-free',
    url: 'https://router.bynara.id/v1/chat/completions',
    chiaveEnv: 'NARA_API_KEY',
    modello: 'minimax-m3-free',
    costa: false,
  },
  /**
   * Nara a pagamento, quarto — messo qui apposta, PRIMA di Z.AI.
   *
   * Il 03/09/2026, lo stesso pomeriggio in cui `minimax-m3-free` sopra dava
   * 502 su 7 richieste su 10 (e pure `minimax-m3` A PAGAMENTO, stesso
   * fornitore: 6 su 8), tre modelli a pagamento sono stati messi alla prova
   * sullo stesso prompt con un tetto di 20s:
   *   - `deepseek-v4-pro`: 5 tentativi, 5 timeout. Scartato, non risponde.
   *   - `glm-5.3-flash`: 5/5 riuscite ma 8,3-17s, ballerino.
   *   - `qwen3.7-flash`: 5/5 riuscite, 9,0-12,3s, mai un'impennata. Vince.
   *
   * Sta prima di Z.AI (15s fisso) perché è più veloce e più stabile di lui,
   * anche se quello è a forfait e questo consuma credito vero (Rp372/Rp1680
   * per milione di token, spiccioli sul volume di Wesion). Non ha bisogno di
   * `reasoning_effort`: testato senza, ha sempre risposto pulito.
   */
  {
    nome: 'nara/qwen3.7-flash',
    url: 'https://router.bynara.id/v1/chat/completions',
    chiaveEnv: 'NARA_API_KEY',
    modello: 'qwen3.7-flash',
    costa: true,
  },
  /**
   * Z.AI, quinto — per velocità, non per qualità.
   *
   * Il piano è già pagato a forfait, quindi qui non si consuma a token: sulla
   * carta dovrebbe stare più in alto. Ma misurato il 27/08/2026 sullo stesso
   * prompt: Groq risponde in 1,4 secondi, `glm-4.5-air` in 15. Su diciotto post
   * di un mese sono quattro minuti di attesa invece di trenta secondi.
   *
   * Quindi è la rete che si tende quando Groq è a tetto: allora quei 15 secondi
   * sono ottimi, perché l'alternativa è pagare a consumo.
   *
   * `glm-4.6` è deliberatamente ESCLUSO: 100 secondi per restituire una
   * risposta VUOTA, perché spende tutto il budget di token a ragionare. Se un
   * domani lo si volesse, va prima capito dove finisce il testo.
   */
  {
    nome: 'zai/glm-4.5-air',
    url: 'https://api.z.ai/api/paas/v4/chat/completions',
    chiaveEnv: 'ZAI_API_KEY',
    modello: 'glm-4.5-air',
    costa: false,
  },
  {
    nome: 'openrouter/google/gemini-2.5-flash',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    chiaveEnv: 'OPENROUTER_API_KEY',
    modello: process.env.OCR_MODEL || 'google/gemini-2.5-flash',
    costa: true,
  },
];

export interface EsitoGenerazione {
  testo: string;
  /** Chi l'ha scritto davvero: finisce in `bozza.modello`. */
  modello: string;
  /** Quanto è costato in attesa, per capire se la catena sta scendendo. */
  ms: number;
  /** I fornitori che non hanno risposto, in ordine. Utile solo quando serve. */
  saltati: string[];
}

/**
 * Toglie quello che il modello non doveva scrivere.
 *
 * Tre cose, tutte viste succedere davvero:
 *   - i blocchi `<think>` dei modelli che ragionano ad alta voce;
 *   - il preambolo ("Ecco il post:", "Certo! Ecco…"), che è la prima riga e si
 *     riconosce dai due punti finali;
 *   - le virgolette che avvolgono tutto il testo, che il modello mette perché
 *     gli abbiamo chiesto "il testo del post" e lui te lo cita.
 */
/**
 * Solo il ragionamento ad alta voce, via. Niente altro.
 *
 * ⚠️ Separata da `ripulisci` apposta (02/09/2026). Chi chiede CODICE non può
 * permettersi il resto di quella funzione — collassa gli spazi, e in un file
 * l'indentazione non è rumore, è il file. Vedi `genera(..., {grezzo: true})`.
 */
export function togliRagionamento(grezzo: string): string {
  return String(grezzo || '')
    // Anche non chiusi: se il testo è stato troncato a metà di un <think>,
    // quello che resta è tutto ragionamento e va via.
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/<\/?(?:thinking|reasoning|analysis)>/gi, '');
}

export function ripulisci(grezzo: string): string {
  let t = togliRagionamento(grezzo);

  t = t.trim();

  // Il preambolo: prima riga corta che finisce in due punti e annuncia il resto.
  const righe = t.split('\n');
  if (righe.length > 1 && /^[^.!?]{0,60}:\s*$/.test(righe[0]) && /post|testo|ecco/i.test(righe[0])) {
    righe.shift();
    t = righe.join('\n').trim();
  }

  // Virgolette che avvolgono tutto.
  if (/^["«“](.|\n)*["»”]$/.test(t)) t = t.slice(1, -1).trim();

  /**
   * ⚠️ Gli spazi esotici diventano spazi normali.
   *
   * I modelli scrivono volentieri U+202F (spazio unificatore stretto) o U+00A0
   * (no-break) dove noi vediamo uno spazio qualunque. Sono invisibili e rompono
   * ogni confronto fra stringhe: il 27/08/2026 un avviso ha continuato a
   * scattare su "12 anni" perche' lo spazio nel testo generato non era lo
   * stesso carattere di quello nel fatto verificato.
   *
   * Si toglie qui, all'ingresso, cosi' il testo che salviamo e' fatto di
   * caratteri normali e nessuno piu' a valle deve saperlo. Gli a capo restano:
   * sono struttura, non rumore.
   */
  t = t.replace(/[^\S\n]+/gu, ' ');

  return t;
}

/**
 * Chiede a un modello solo. Restituisce null se non se ne fa niente, invece di
 * lanciare: chi chiama deve poter passare al successivo senza try/catch annidati.
 */
export interface OpzioniGenerazione {
  /** Il default (1600) basta per un post. Chi restituisce file interi chiede il suo. */
  maxTokens?: number;
  /**
   * Non passare da `ripulisci`: toglie solo il ragionamento e lascia il testo
   * com'è. Per il codice, dove gli spazi contano.
   */
  grezzo?: boolean;
}

async function chiedi(
  m: Modello,
  sistema: string,
  utente: string,
  secondoGiro = false,
  opzioni: OpzioniGenerazione = {}
): Promise<string | null> {
  const { maxTokens = 1600, grezzo = false } = opzioni;
  const chiave = process.env[m.chiaveEnv];
  if (!chiave) return null;

  try {
    const corpo: Record<string, unknown> = {
      model: m.modello,
      // Bassa apposta. Non serve inventiva: serve raccontare un fatto scritto
      // senza aggiungerci sopra. Con 0.7 il modello riempiva i vuoti da solo.
      temperature: 0.4,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: utente },
      ],
      // ⚠️ Largo apposta. I modelli che ragionano spendono la maggior parte dei
      // token a pensare PRIMA di scrivere: misurato il 27/08/2026, un post da
      // tre righe è costato 839 token in tutto. Con un tetto stretto la
      // risposta arriva troncata a metà frase — ed è successo davvero, con
      // `gpt-oss-20b` a 400. Il default (1600) basta per un post; l'audit SEO,
      // che restituisce file interi dentro il JSON, chiede il suo (02/09/2026,
      // visto in produzione: "JSON rotto" era una stringa tagliata a metà per
      // il tetto, non un modello che sbaglia la sintassi).
      max_tokens: maxTokens,
    };
    // Il compito è scrivere tre righe seguendo regole scritte, non risolvere un
    // problema: pensarci a lungo non migliora il testo, allunga solo l'attesa.
    if (m.ragiona) corpo.reasoning_effort = m.ragiona;

    const risposta = await fetch(m.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60000),
    });

    if (!risposta.ok) {
      /**
       * 429 non e' un guasto: e' il piano gratuito che dice "aspetta".
       *
       * Passare subito al fornitore a pagamento sarebbe la cosa comoda e la
       * piu' cara: su diciotto post di un mese vuol dire pagarne un terzo per
       * non aver aspettato due secondi. Groq dice anche QUANTO aspettare, e la
       * si ascolta — ma con un tetto, o un `retry-after` di due minuti
       * bloccherebbe la generazione dell'intero mese.
       */
      if (risposta.status === 429 && !secondoGiro) {
        const attesa = Math.min(Number(risposta.headers.get('retry-after')) || 3, 12);
        console.warn(`[generatore] ${m.nome} a tetto: aspetto ${attesa}s e riprovo`);
        await new Promise((r) => setTimeout(r, attesa * 1000));
        return chiedi(m, sistema, utente, true, opzioni);
      }
      const dettaglio = (await risposta.text()).slice(0, 200);
      console.warn(`[generatore] ${m.nome} ha risposto ${risposta.status}: ${dettaglio}`);
      return null;
    }

    const dati = await risposta.json();
    const contenuto = dati?.choices?.[0]?.message?.content || '';
    const testo = grezzo ? togliRagionamento(contenuto).trim() : ripulisci(contenuto);
    // Un testo vuoto dopo la ripulitura vuol dire che era tutto ragionamento:
    // è un fallimento come un 500, e si passa al prossimo.
    return testo.length > 20 ? testo : null;
  } catch (errore: unknown) {
    console.warn(`[generatore] ${m.nome}:`, errore instanceof Error ? errore.message : errore);
    return null;
  }
}

/** Scende la catena finché qualcuno risponde. */
export async function genera(
  sistema: string,
  utente: string,
  opzioni: OpzioniGenerazione = {}
): Promise<EsitoGenerazione> {
  const inizio = Date.now();
  const saltati: string[] = [];

  for (const m of CATENA) {
    const testo = await chiedi(m, sistema, utente, false, opzioni);
    if (testo) return { testo, modello: m.nome, ms: Date.now() - inizio, saltati };
    saltati.push(m.nome);
  }

  throw new Error(
    `Nessun modello ha risposto. Provati: ${saltati.join(', ')}. ` +
      'Controlla le chiavi in .env e la spia "generatore".'
  );
}

/**
 * Come `genera`, ma pretende un oggetto JSON.
 *
 * Serve per gli articoli, che non sono solo un corpo: hanno titolo, sommario e
 * categoria, e chiederli in tre chiamate separate costerebbe tre volte tanto e
 * darebbe tre pezzi che non si parlano — un titolo che promette una cosa e un
 * corpo che ne racconta un'altra.
 *
 * ⚠️ NON SI USA `response_format: json_object`. Lo accettano quasi tutti, ma non
 * tutti allo stesso modo, e un anello che lo rifiuta cadrebbe con un 400 —
 * esattamente il guasto silenzioso che ci è già costato sei post su diciotto il
 * 27/08/2026. Meglio chiederlo nel prompt e ripulire qui: funziona su tutti.
 */
export async function generaJson<T>(
  sistema: string,
  utente: string,
  valido: (x: unknown) => x is T,
  opzioni: OpzioniGenerazione = {}
): Promise<{ dato: T; modello: string; ms: number }> {
  const esito = await genera(sistema, utente, opzioni);

  // I modelli imbustano volentieri il JSON in un blocco di codice, e a volte ci
  // mettono una frase davanti. Si prende dalla prima graffa all'ultima.
  const grezzo = esito.testo.replace(/```json/gi, '').replace(/```/g, '');
  const inizio = grezzo.indexOf('{');
  const fine = grezzo.lastIndexOf('}');
  if (inizio === -1 || fine <= inizio) {
    throw new Error(`${esito.modello} non ha restituito un oggetto JSON: ${esito.testo.slice(0, 160)}`);
  }

  let dato: unknown;
  try {
    dato = JSON.parse(grezzo.slice(inizio, fine + 1));
  } catch (errore: unknown) {
    throw new Error(`${esito.modello} ha restituito JSON rotto: ${errore instanceof Error ? errore.message : errore}`);
  }

  if (!valido(dato)) {
    throw new Error(`${esito.modello} ha restituito un JSON con i campi sbagliati.`);
  }

  return { dato, modello: esito.modello, ms: esito.ms };
}
