/**
 * Quando risponde un lead.
 *
 * Un'azienda che non e' ancora cliente scrive al numero del bot: e' successo
 * perche' le abbiamo mandato noi un gancio dopo l'audit. E' il momento piu'
 * prezioso di tutta la catena e anche il piu' facile da rovinare.
 *
 * COSA E' CAMBIATO RISPETTO A `lead_bot.js`. Il bot vecchio rispondeva da solo:
 * generava il testo e lo mandava. Qui l'AI scrive una bozza che finisce nella
 * consolle, e parte solo dopo un'approvazione — vedi il commento lungo in
 * `pubblica.ts`. La differenza in pratica: prima il prospect riceveva la
 * risposta in tre secondi e nessuno sapeva cosa gli fosse stato detto; adesso
 * la riceve quando qualcuno la legge, e resta scritto chi l'ha mandata.
 *
 * L'AVVISO AGLI AMMINISTRATORI INVECE PARTE SUBITO, senza approvazione: e' un
 * messaggio interno fra noi, non esce verso nessun cliente, e il suo valore e'
 * tutto nell'arrivare mentre il prospect ha ancora il telefono in mano.
 */

import { query } from '../src/lib/db.ts';
import { mandaTesto } from '../src/lib/waha.ts';

const MODELLO = process.env.OCR_MODEL || 'google/gemini-2.5-flash';

/** I numeri a cui arrivano gli avvisi di lead caldo. */
const AMMINISTRATORI = String(process.env.NUMERI_AMMINISTRATORI || process.env.MYWEBBY_ADMIN_NUMBERS || '')
  .split(',')
  .map((n) => n.replace(/\D/g, ''))
  .filter(Boolean);

/**
 * Le parole con cui uno dice che gli interessa.
 *
 * Volutamente larga: un falso positivo costa un avviso di troppo su WhatsApp,
 * un falso negativo costa il lead. Non e' un filtro, e' una sveglia.
 */
const INTENZIONE_CALDA = /(s[iì]|ok|interes|cost|prezz|preventiv|chiamat|telefon|info|dettagl|disponib|chiamar)/i;

export interface Lead {
  aziendaId: number;
  nome: string;
  stato: string;
  categoria: string | null;
  citta: string | null;
  telefono: string;
}

/** L'azienda che ha scritto, se è un lead nostro e non un cliente. */
export async function cercaLead(identificativi: string[]): Promise<Lead | null> {
  const [riga] = await query<{
    azienda_id: number;
    nome: string;
    stato: string;
    categoria: string | null;
    citta: string | null;
    valore: string;
  }>(
    `SELECT a.id AS azienda_id, a.nome, a.stato, a.categoria, a.citta, c.valore
       FROM wesion.contatto c
       JOIN wesion.azienda a ON a.id = c.azienda_id
      WHERE c.normalizzato = ANY($1)
        AND c.tipo IN ('telefono', 'whatsapp', 'lid')
        AND a.stato IN ('prospect', 'contattato', 'in_trattativa')
      ORDER BY c.id
      LIMIT 1`,
    [identificativi]
  );
  if (!riga) return null;
  return {
    aziendaId: riga.azienda_id,
    nome: riga.nome,
    stato: riga.stato,
    categoria: riga.categoria,
    citta: riga.citta,
    telefono: identificativi[0] ?? riga.valore,
  };
}

/** Lo scambio recente, per non far ripartire il discorso da capo ogni volta. */
async function storico(aziendaId: number, quanti = 6): Promise<string> {
  const righe = await query<{ direzione: string; testo: string | null }>(
    `SELECT direzione, testo FROM wesion.messaggio
      WHERE azienda_id = $1 AND testo IS NOT NULL
      ORDER BY creato_at DESC LIMIT $2`,
    [aziendaId, quanti]
  );
  return righe
    .reverse()
    .map((m) => `${m.direzione === 'in' ? 'Cliente' : 'MyWebby'}: ${m.testo}`)
    .join('\n');
}

/** Scrive la risposta. Non la manda: la manda l'approvazione. */
async function scriviRisposta(lead: Lead, ultimo: string): Promise<string | null> {
  const chiave = process.env.OPENROUTER_API_KEY;

  // Senza AI si usa comunque una risposta scritta a mano: meglio una frase
  // onesta e generica approvata da una persona che nessuna bozza e un lead
  // che aspetta.
  if (!chiave) {
    return `Ciao! Siamo MyWebby (www.mywebby.it). Realizziamo siti web veloci, moderni e completi di prenotazioni online. Vi farebbe piacere ricevere una proposta indicativa, senza impegno?`;
  }

  const conversazione = await storico(lead.aziendaId);
  const prompt = `
Sei l'assistente dell'agenzia MyWebby (www.mywebby.it).
Stai scrivendo su WhatsApp al referente di "${lead.nome}" (${lead.categoria || 'attività commerciale'} a ${lead.citta || 'Italia'}).

Obiettivo: rispondere in modo cordiale, sintetico e professionale (massimo 3-4 frasi).
Spiega che MyWebby realizza siti web veloci, con prenotazioni online e grafica su misura.
Chiedi se desiderano maggiori informazioni o una breve chiamata conoscitiva.
Niente toni da marketer aggressivo, niente promesse di risultati, nessun prezzo.

Storico della conversazione:
${conversazione}

Ultimo messaggio ricevuto: "${ultimo}"

Genera SOLO il testo del messaggio da inviare, senza virgolette e senza JSON.
`.trim();

  try {
    const risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELLO,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!risposta.ok) throw new Error(`OpenRouter HTTP ${risposta.status}`);
    const dati = await risposta.json();
    return String(dati?.choices?.[0]?.message?.content || '').trim() || null;
  } catch (errore: unknown) {
    console.error('[lead] risposta non generata:', errore instanceof Error ? errore.message : errore);
    return null;
  }
}

/** L'avviso interno, che parte subito perché non esce verso nessun cliente. */
async function avvisaAmministratori(lead: Lead, ultimo: string): Promise<void> {
  if (!AMMINISTRATORI.length) {
    console.warn('[lead] nessun numero amministratore configurato: il lead caldo non viene segnalato');
    return;
  }

  const [audit] = await query<{ note: string | null }>(
    `SELECT note FROM wesion.audit
      WHERE azienda_id = $1 AND esito = 'ok'
      ORDER BY eseguito_at DESC LIMIT 1`,
    [lead.aziendaId]
  );

  const messaggio = [
    'LEAD CALDO',
    '',
    `Azienda: ${lead.nome}${lead.categoria ? ` (${lead.categoria})` : ''}`,
    `Città: ${lead.citta || 'non specificata'}`,
    `Telefono: +${lead.telefono}`,
    '',
    'Ha scritto:',
    `"${ultimo}"`,
    '',
    audit?.note ? `Dall'audit: ${audit.note}` : null,
    '',
    `Chat: https://wa.me/${lead.telefono}`,
    '',
    'La risposta è in attesa di approvazione nella consolle bozze.',
  ]
    .filter((r) => r !== null)
    .join('\n');

  for (const numero of AMMINISTRATORI) {
    await mandaTesto(numero, messaggio);
  }
}

/**
 * Gestisce un messaggio arrivato da un lead.
 *
 * Restituisce cosa è successo, per il log del router.
 */
export async function gestisciLead(lead: Lead, testo: string, contattoId: number | null): Promise<string> {
  await query(
    `INSERT INTO wesion.messaggio (azienda_id, contatto_id, direzione, canale, autore, testo, payload)
     VALUES ($1, $2, 'in', 'whatsapp', 'azienda', $3, $4)`,
    [lead.aziendaId, contattoId, testo, JSON.stringify({ mittente: lead.telefono })]
  );

  // Un lead che risponde e' un lead contattato: lo stato si muove da solo,
  // perche' aspettare che qualcuno lo aggiorni a mano vuol dire non aggiornarlo.
  if (lead.stato === 'prospect') {
    await query(`UPDATE wesion.azienda SET stato = 'contattato', aggiornata_at = now() WHERE id = $1`, [
      lead.aziendaId,
    ]);
  }

  const caldo = INTENZIONE_CALDA.test(testo);
  if (caldo) await avvisaAmministratori(lead, testo);

  const risposta = await scriviRisposta(lead, testo);
  if (!risposta) return caldo ? 'lead_caldo_senza_bozza' : 'lead_senza_bozza';

  /**
   * La bozza scade dopo sei ore.
   *
   * Non quindici minuti come il menù: li' il ritardo pubblica il piatto
   * sbagliato, qui pubblica solo una risposta un po' tarda. Ma un limite serve
   * lo stesso — mandare due giorni dopo una risposta che dice "certo, quando
   * vuoi" e' peggio che non mandarla.
   */
  await query(
    `INSERT INTO wesion.bozza (azienda_id, tipo, origine, contenuto, stato, modello, scade_at)
     VALUES ($1, 'messaggio_lead', 'audit', $2, 'attesa_approvazione', $3, now() + INTERVAL '6 hours')`,
    [
      lead.aziendaId,
      JSON.stringify({ testo: risposta, destinatario: lead.telefono, in_risposta_a: testo }),
      MODELLO,
    ]
  );

  return caldo ? 'lead_caldo' : 'lead_bozza_creata';
}
