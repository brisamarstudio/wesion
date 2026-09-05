/**
 * Lettura del menù — foto di lavagna, foglio, cartello, PDF o testo.
 *
 * Scritto una volta sola qui: i siti dei clienti girano su Cloudflare e non
 * devono avere la chiave di OpenRouter, quindi non va copiata in N progetti.
 *
 * Nessun import relativo, apposta: vedi la nota in cima a `waha.ts`.
 */

const MODELLO = process.env.OCR_MODEL || 'google/gemini-2.5-flash';

export interface PiattoLetto {
  name: string;
  price?: string;
  description?: string;
}

export interface MenuLetto {
  summary: string;
  items: PiattoLetto[];
  /**
   * In quale sezione va, se il modello ha saputo dirlo: lo slug di una delle
   * sezioni che gli abbiamo passato, oppure `null`. `null` non e' un fallimento
   * ed e' importante che resti possibile: e' il caso in cui si CHIEDE, che e'
   * meglio di un'ipotesi che pubblica la cena dentro al pranzo.
   */
  sezione: string | null;
  /** Quale modello l'ha letto: finisce in `bozza.modello` e serve fra sei mesi. */
  modello: string;
}

export interface RichiestaMenu {
  nomeLocale: string;
  testo?: string;
  immagineDataUrl?: string | null;
  /**
   * Le sezioni di QUESTO cliente. Vuoto = cliente con un menu' solo: al modello
   * non si chiede niente, e non c'e' niente da sbagliare.
   */
  sezioni?: Array<{ slug: string; titolo: string; quando?: string }>;
}

export async function leggiMenu(richiesta: RichiestaMenu): Promise<MenuLetto> {
  const chiave = process.env.OPENROUTER_API_KEY;
  if (!chiave) throw new Error('OPENROUTER_API_KEY mancante');

  /**
   * ⚠️ LA SEZIONE LA DICE GIÀ LA FOTO, e il modello la sta già leggendo.
   *
   * Il titolare non deve imparare niente: continua a fotografare e mandare come
   * fa già. Sulla lavagna c'è scritto «Sabato a Cena», «Domenica a Pranzo» — è
   * l'intestazione, la prima riga in grande. Si chiede al modello di scegliere
   * fra le sezioni DI QUESTO CLIENTE, non di inventarne una.
   *
   * E gli si dice esplicitamente di lasciare `null` quando non è sicuro: è
   * l'unico modo perché il ramo «allora chiedo» funzioni davvero, invece di
   * essere codice morto sotto un modello che indovina sempre qualcosa.
   */
  const sezioni = richiesta.sezioni ?? [];
  const bloccoSezioni = sezioni.length
    ? [
        "",
        "Questo locale ha piu' menu diversi. Devi anche dire IN QUALE va questo:",
        ...sezioni.map((s) => `- "${s.slug}" = ${s.titolo}${s.quando ? ` (${s.quando})` : ''}`),
        "",
        "Guarda l'INTESTAZIONE del menu (il titolo scritto in alto: \"Sabato a Cena\",",
        '"Domenica a Pranzo", "Menu del giorno"...) e scegli lo slug corrispondente.',
        "Se l'intestazione non c'e' o non corrisponde a nessuna, metti null: NON tirare a",
        "indovinare, chiedere e' meglio che pubblicare nel posto sbagliato.",
        'Aggiungi al JSON il campo "section" con lo slug scelto, oppure null.',
      ].join('\n')
    : '';

  const prompt = `
Sei l'assistente di ${richiesta.nomeLocale}.
Il titolare ti ha mandato il menù (del giorno o carta), come testo o come foto/immagine
(lavagna, foglio, cartello, menù stampato, PDF).

Compiti:
1. Estrai TUTTI i piatti, panini, burger, pizze, contorni e dolci presenti nel menù con i
   relativi prezzi ed eventuali descrizioni degli ingredienti.
2. Scrivi un riassunto pulito per il post: niente emoji esagerate, niente markdown pesante.
   Raggruppa per categorie reali presenti nel menù (es. Burgers, Primi, Secondi, Contorni, Dolci).
3. Se un piatto non ha un prezzo suo perché rientra in un menù fisso, lascia il prezzo vuoto.

Rispondi SOLO con un oggetto JSON valido, senza blocchi di codice:

{
  "summary": "${richiesta.nomeLocale} - Menù\\n\\nPrimi:\\n- Risotto alla zucca (12€)",
  "items": [
    { "name": "Risotto alla zucca", "price": "12€", "description": "zucca mantovana, taleggio" }
  ]
}

Se nell'immagine non c'è assolutamente un menù leggibile, restituisci {"summary": "", "items": []}.
${bloccoSezioni}
`.trim();

  /**
   * Un messaggio corto e senza foto che dice solo "rileva il menu" e' un
   * comando, non un menu: mandarlo al modello costa una chiamata per farsi
   * restituire un'anteprima inventata su niente.
   */
  if (!richiesta.immagineDataUrl && richiesta.testo) {
    const t = richiesta.testo.trim();
    if (t.length < 35 && !/\d+/.test(t) && /^(rileva|leggi|scansiona|ecco|analizza|foto)/i.test(t)) {
      return { summary: '', items: [], sezione: null, modello: MODELLO };
    }
  }

  let contenuto: unknown;
  if (richiesta.immagineDataUrl) {
    const nota = richiesta.testo ? `\n\nNota del titolare: "${richiesta.testo}"` : '';
    if (richiesta.immagineDataUrl.startsWith('data:application/pdf')) {
      contenuto = [
        { type: 'text', text: prompt + nota },
        {
          type: 'file',
          file: { filename: 'menu.pdf', content: richiesta.immagineDataUrl.split(',')[1] || '' },
        },
      ];
    } else {
      // Il mime deve dire "immagine" o OpenRouter rifiuta l'allegato: se WAHA
      // ha restituito un octet-stream lo si dichiara jpeg, che è quello che è.
      let immagine = richiesta.immagineDataUrl;
      if (!immagine.startsWith('data:image/')) {
        immagine = 'data:image/jpeg;base64,' + immagine.split(',')[1];
      }
      contenuto = [
        { type: 'text', text: prompt + nota },
        { type: 'image_url', image_url: { url: immagine } },
      ];
    }
  } else {
    contenuto = `${prompt}\n\nTesto del menù:\n"""\n${richiesta.testo || ''}\n"""`;
  }

  const risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELLO,
      messages: [{ role: 'user', content: contenuto }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!risposta.ok) {
    throw new Error(`OpenRouter ${risposta.status}: ${(await risposta.text()).slice(0, 300)}`);
  }

  const dati = await risposta.json();
  const grezzo = dati?.choices?.[0]?.message?.content || '{}';

  try {
    const letto = JSON.parse(String(grezzo).replace(/```json/g, '').replace(/```/g, '').trim());
    /**
     * Si accetta solo uno slug che esiste DAVVERO fra i suoi.
     *
     * Un modello che si inventa un nome plausibile («cena-sabato» invece di
     * «sabato-a-cena») manderebbe la richiesta a una sezione inesistente: il
     * sito risponderebbe 400 dopo che il titolare ha gia' detto SI. Uno slug
     * che non conosciamo vale quanto nessuno slug — si chiede.
     */
    const proposta = letto.section == null ? null : String(letto.section).trim();
    const sezione = proposta && sezioni.some((s) => s.slug === proposta) ? proposta : null;
    if (proposta && !sezione) console.warn(`[ocr] sezione inventata dal modello: "${proposta}"`);

    return {
      summary: String(letto.summary || '').trim(),
      items: Array.isArray(letto.items) ? letto.items : [],
      sezione,
      modello: MODELLO,
    };
  } catch {
    console.error('[ocr] risposta non JSON:', String(grezzo).slice(0, 300));
    return { summary: '', items: [], sezione: null, modello: MODELLO };
  }
}
