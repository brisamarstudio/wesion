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

const MODELLO = process.env.OCR_MODEL || 'google/gemini-2.5-flash';

export interface EsitoAudit {
  score: number | null;
  note: string;
  hook: string | null;
  esito: 'ok' | 'errore';
  errore: string | null;
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
 * Il giudizio, chiesto al modello.
 *
 * `response_format: json_object` non basta da solo — i modelli lo rispettano
 * quasi sempre e ogni tanto imbustano il JSON in un blocco di codice. Da qui la
 * ripulitura prima di JSON.parse, che e' rimasta identica alle copie vecchie
 * perche' li' era stata gia' pagata.
 */
async function chiediGiudizio(dati: DatiAzienda, note: string): Promise<EsitoAudit> {
  const chiave = process.env.OPENROUTER_API_KEY;
  if (!chiave) {
    return {
      score: null,
      note,
      hook: null,
      esito: 'errore',
      errore: 'OPENROUTER_API_KEY mancante: la scansione tecnica è stata fatta, il giudizio no.',
    };
  }

  const prompt = `
Sei l'esperto di consulenza web di MyWebby (www.mywebby.it).
Devi analizzare una potenziale azienda cliente e generare un breve messaggio d'impatto (hook)
per proporre la creazione di un nuovo sito web moderno, veloce e completo.

Dati dell'azienda:
- Nome: "${dati.nome}"
- Categoria: "${dati.categoria || 'Attività commerciale'}"
- Città: "${dati.citta || 'Italia'}"
- Sito attuale: "${dati.sito || 'Nessuno'}"
- Esito della scansione tecnica: "${note}"

Compiti:
1. Assegna uno score da 1 a 100 che indica l'urgenza di un nuovo sito web
   (es. 95 per chi non ha il sito o ha errori, 80 per chi ha un sito datato o non responsive).
2. Fornisci 2 brevi righe di "note" sui punti deboli rilevati.
3. Scrivi un "hook" (massimo 3 righe) in tono professionale, cordiale ed empatico, per aprire
   una conversazione su WhatsApp o via email. Personalizzato, con una soluzione concreta
   (sito responsive, menù o prenotazioni online, velocità). Niente spam, niente toni da
   marketer aggressivo.

Rispondi SOLO con un oggetto JSON valido:
{"score": 90, "note": "…", "hook": "…"}
`.trim();

  try {
    const risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!risposta.ok) throw new Error(`OpenRouter HTTP ${risposta.status}`);

    const dato = await risposta.json();
    const grezzo = dato?.choices?.[0]?.message?.content || '{}';
    const letto = JSON.parse(String(grezzo).replace(/```json/g, '').replace(/```/g, '').trim());

    const score = Number(letto.score);
    return {
      // Uno score fuori scala e' un modello che ha sbagliato, non un giudizio
      // basso: si scarta invece di salvarlo storto.
      score: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
      note: String(letto.note || note).trim(),
      hook: String(letto.hook || '').trim() || null,
      esito: 'ok',
      errore: null,
    };
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return { score: null, note, hook: null, esito: 'errore', errore: motivo };
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
    [aziendaId, MODELLO, azienda.sito, esito.score, esito.note, esito.hook, esito.esito, esito.errore]
  );

  return esito;
}
