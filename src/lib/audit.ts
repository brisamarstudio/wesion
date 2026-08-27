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

export interface EsitoAudit {
  score: number | null;
  note: string;
  hook: string | null;
  esito: 'ok' | 'errore';
  errore: string | null;
  /** Chi l'ha scritto: i punteggi di modelli diversi non sono confrontabili. */
  modello: string;
}

/**
 * Cosa si vede del sito senza chiedere niente a nessuno.
 *
 * Questa parte e' vera anche quando l'AI e' giu', ed e' quella che risponde
 * alla domanda che conta davvero per una chiamata a freddo: il sito c'e'?
 * risponde? si vede da telefono?
 */
async function scansione(sito: string | null): Promise<string> {
  if (!sito || !sito.trim()) return 'Attività priva di un sito web ufficiale.';

  const url = sito.startsWith('http') ? sito : `https://${sito}`;
  try {
    const risposta = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!risposta.ok) return `Sito risponde con errore HTTP ${risposta.status}.`;

    const html = (await risposta.text()).toLowerCase();
    const viewport = html.includes('name="viewport"');
    const prenotazioni = html.includes('prenot') || html.includes('book');
    return (
      `Sito esistente (HTTP ${risposta.status}). ` +
      `Viewport mobile: ${viewport ? 'PRESENTE' : 'MANCANTE'}. ` +
      `Form prenotazioni: ${prenotazioni ? 'PRESENTE' : 'MANCANTE'}.`
    );
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return `Sito non raggiungibile o offline (${motivo}).`;
  }
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

async function chiediGiudizio(dati: DatiAzienda, note: string): Promise<EsitoAudit> {
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
2. "note": due righe sui punti deboli rilevati, concrete, senza gergo.
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
`.trim();

  try {
    const esito = await generaJson(sistema, utente, eGiudizio);
    const score = Number(esito.dato.score);
    return {
      // Uno score fuori scala è un modello che ha sbagliato, non un giudizio
      // basso: si scarta invece di salvarlo storto.
      score: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
      note: String(esito.dato.note ?? note).trim() || note,
      hook: String(esito.dato.hook ?? '').trim() || null,
      esito: 'ok',
      errore: null,
      modello: esito.modello,
    };
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return { score: null, note, hook: null, esito: 'errore', errore: motivo, modello: 'nessuno' };
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

  const note = await scansione(azienda.sito);
  const esito = await chiediGiudizio(azienda, note);

  await query(
    `INSERT INTO wesion.audit (azienda_id, modello, sito_letto, score, note, hook, esito, errore)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [aziendaId, esito.modello, azienda.sito, esito.score, esito.note, esito.hook, esito.esito, esito.errore]
  );

  return esito;
}
