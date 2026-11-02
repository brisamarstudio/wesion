/**
 * L'immagine di un post, fatta con l'AI.
 *
 * ⚠️ PERCHE' (02/11/2026). Il piano del mese deve diventare UN click: «una
 * volta letto e approvato non ci penso più». L'unica cosa che il cliente
 * dovrebbe dare e' l'immagine, e Mariano la genera comunque con l'AI. Farla a
 * mano per diciotto post al mese era il pezzo che teneva il mese aperto.
 *
 * ⚠️ PERCHE' OPENROUTER E NON GEMINI DIRETTO. La GEMINI_API_KEY e' sul piano
 * gratuito, e li' i modelli che fanno immagini hanno quota ZERO (429
 * «limit: 0», provato il 02/11/2026). Via OpenRouter lo stesso modello costa
 * circa 4 centesimi a immagine e risponde in ~7 secondi: un mese da 18 post
 * sono 70 centesimi a cliente.
 *
 * ⚠️ IMMAGINI D'ATMOSFERA, NON FINTE FOTO DEL LOCALE. Un'immagine generata
 * non e' la camera di quel B&B ne' il piatto di quella trattoria, e non deve
 * sembrarlo: chi arriva aspettandosi quella stanza e ne trova un'altra si
 * sente preso in giro, e lo scrive nelle recensioni. Quindi il prompt chiede
 * dettagli, atmosfere, la zona — mai «la loro sala». Le foto vere del
 * cliente, quando ci sono, restano meglio di qualunque generata.
 */
import { caricaPubblico } from './waha';

const MODELLO = process.env.IMMAGINI_MODELLO || 'google/gemini-2.5-flash-image';

export interface SoggettoImmagine {
  categoria: string | null;
  citta: string | null;
  titolo: string | null;
  fatto: string | null;
  angolo: string | null;
}

export function promptImmagine(s: SoggettoImmagine): string {
  return [
    `Fotografia realistica per un post sui social di un'attività: ${s.categoria || 'attività locale'}${s.citta ? ` a ${s.citta}, in Italia` : ' in Italia'}.`,
    s.titolo ? `Argomento del post: ${s.titolo}.` : '',
    s.fatto ? `Di cosa parla: ${s.fatto}.` : '',
    '',
    'Regole, tutte obbligatorie:',
    '- Luce naturale, colori veri e caldi, inquadratura da fotografo professionista, profondità di campo morbida.',
    "- NESSUN testo, scritta, insegna, logo, marchio, cartello o numero nell'immagine.",
    '- Niente volti riconoscibili in primo piano.',
    "- Un dettaglio o un'atmosfera (un oggetto, un piatto, un materiale, un angolo della zona, la luce in una stanza): " +
      'NON deve sembrare la foto di un locale preciso, perché non lo è.',
    '- Niente effetti finti, niente stile illustrazione o 3D: deve sembrare una foto.',
  ]
    .filter((r) => r !== null)
    .join('\n');
}

/**
 * La scena per i modelli LOCALI (Z-Image su ComfyUI), che non sono Gemini.
 *
 * ⚠️ PERCHÉ UN PROMPT DIVERSO (02/11/2026). Le prime due foto fatte dal PC per
 * Chumphon avevano STAMPATO SOPRA il testo del prompt («Terapisa di Magasi
 * thaimdesi a Binasco, in Itally») e una persona a seno nudo sul lettino.
 * Z-Image disegna le parole che trova nel prompt e non capisce i divieti:
 * «nessun testo» lo spinge a scrivere, e senza dire «vestita» un massaggio
 * diventa un corpo nudo. Gemini quelle regole le capisce, Z-Image no.
 *
 * Quindi al PC non si manda il prompt con le regole: si manda SOLO la scena,
 * descritta in inglese da un modello di testo economico, senza parole tra
 * virgolette, senza nomi di luoghi da scrivere, senza persone (o solo mani e
 * persone vestite viste di spalle).
 */
const MODELLO_SCENA = process.env.IMMAGINI_MODELLO_SCENA || 'google/gemini-3.5-flash-lite';

export async function scenaPerModelloLocale(s: SoggettoImmagine): Promise<string> {
  const chiave = process.env.OPENROUTER_API_KEY;
  const ripiego =
    'Professional photograph of a calm, warm interior detail related to a small local business in Italy, ' +
    'natural window light, soft depth of field, realistic colors, no people.';
  if (!chiave) return ripiego;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO_SCENA,
        messages: [
          {
            role: 'user',
            content:
              `A local business (${s.categoria || 'local business'}) needs a photo for a social post.\n` +
              `Post topic: ${s.titolo ?? ''}. About: ${s.fatto ?? ''}.\n\n` +
              'Write ONE English prompt (45-70 words) for a photorealistic image generator, describing only what is visible: ' +
              'objects, materials, light, setting, camera angle. Rules: prefer scenes with NO people (still life, details, ' +
              'empty rooms, food, tools); if hands or a person are essential, they are fully clothed and seen from behind or ' +
              'cropped, never bare skin beyond hands and forearms. Do not mention any text, sign, logo, brand, place name, ' +
              'city or words to write; do not use quotes; do not write negative instructions. ' +
              'End with: natural light, shallow depth of field, realistic photography. Reply with the prompt only.',
          },
        ],
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
    const t = String(j.choices?.[0]?.message?.content ?? '')
      .replace(/["“”«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > 40 ? t.slice(0, 700) : ripiego;
  } catch {
    return ripiego;
  }
}

/** Genera l'immagine e torna i byte. Lancia se il modello non ne restituisce una. */
export async function generaImmagine(prompt: string): Promise<{ dati: Buffer; mime: string; modello: string }> {
  const chiave = process.env.OPENROUTER_API_KEY;
  if (!chiave) throw new Error('OPENROUTER_API_KEY mancante: senza, le immagini non si generano.');

  const risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(90_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${chiave}` },
    body: JSON.stringify({
      model: MODELLO,
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '4:3' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const esito = (await risposta.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    error?: { message?: string };
  };
  const url = esito.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!risposta.ok || !url?.startsWith('data:')) {
    throw new Error(`immagine non generata (HTTP ${risposta.status}): ${esito.error?.message ?? 'nessuna immagine nella risposta'}`);
  }
  const [testa, corpo] = url.split(',');
  const mime = testa.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  return { dati: Buffer.from(corpo, 'base64'), mime, modello: MODELLO };
}

/**
 * Genera e carica sul media server. Torna l'URL pubblico, che e' quello che
 * Google vuole (`sourceUrl`): un'immagine in base64 nella bozza non uscirebbe.
 */
export async function immaginePerPost(
  s: SoggettoImmagine,
  dove: { cliente: string }
): Promise<{ url: string; modello: string; prompt: string }> {
  const prompt = promptImmagine(s);
  // Una seconda prova: ogni tanto il modello risponde 200 SENZA immagine
  // (visto il 02/11/2026), e un secondo giro di solito la porta.
  let fatta: Awaited<ReturnType<typeof generaImmagine>>;
  try {
    fatta = await generaImmagine(prompt);
  } catch {
    fatta = await generaImmagine(prompt);
  }
  const { dati, mime, modello } = fatta;
  // ⚠️ Sempre nella cartella 'gbp', anche per gli articoli: il media server
  // conosce solo i suoi tipi e a 'blog' risponde 400 «Tipo non riconosciuto»
  // (02/11/2026). Conta la cartella del CLIENTE, non quella del canale.
  const url = await caricaPubblico(dati, mime, { cliente: dove.cliente, tipo: 'gbp' });
  if (!url) throw new Error('immagine generata ma non caricata sul media server (MEDIA_UPLOAD_TOKEN?)');
  return { url, modello, prompt };
}
