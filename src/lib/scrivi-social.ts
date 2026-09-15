/**
 * Scrittura bozze social tramite catena di generazione (`generaJson`).
 *
 * Creato il 15/09/2026.
 * Usa la catena esistente (Groq -> Nara -> Z.AI / OpenRouter).
 * Genera l'oggetto JSON strutturato con:
 *   - ganci (3-5 varianti per fermare lo scroll)
 *   - gancio_scelto (default 0)
 *   - testo (formattato mobile)
 *   - primo_commento (link, CTA o recap)
 *   - hashtag (3-5)
 *   - slide (per carosello: testo + prompt_immagine)
 *   - script_reel (per reel: battute a tempo)
 *   - dati_mancanti (per non inventare nulla)
 */

import { query } from './db';
import { generaJson } from './generatore';
import { controllaBozza } from './controlloTesto';
import { fattiVeri } from './scrivi';
import { leggiMateria, voceDi, type Materia } from './materia';
import { vocePerPrompt } from './voce';
import { DIVIETI_BASE } from './regolePost';
import {
  type ContenutoSocial,
  type FormatoSocial,
  type FrameworkSocial,
  type CanaleSocial,
  isContenutoSocial,
} from './social';
import {
  REGOLE_SOCIAL_BASE,
  ISTRUZIONI_FRAMEWORK,
  ISTRUZIONI_FORMATO,
} from './regoleSocial';

export const SISTEMA_COPYWRITER_SOCIAL = `Sei un copywriter professionista specializzato in social media marketing (Facebook, Instagram, LinkedIn) per attività e aziende locali italiane.
Il tuo obiettivo è scrivere post che fermano lo scroll, comunicano autenticità, e valorizzano la realtà del cliente SENZA MAI suonare generici o da agenzia ("passione e professionalità", "la qualità che fa la differenza").

REGOLE ASSOLUTE:
1. NON inventare MAI fatti, anni di attività, orari, date di fondazione o primati. Usa SOLO ciò che ti viene fornito nel FATTO o nella VOCE.
2. Se un'idea richiede dati che non hai, elencali nell'array "dati_mancanti" e scrivi il post senza inventarli.
3. Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (niente preamboli, niente markdown fuori dal JSON).`;

interface BozzaSocialDaScrivere {
  id: string | number;
  azienda_id: string | number;
  azienda: string;
  citta: string | null;
  tipo: string;
  stato: string;
  contenuto: Record<string, unknown>;
}

export function promptSocial(bozza: BozzaSocialDaScrivere, m: Materia): string {
  const c = bozza.contenuto;
  const dove = bozza.citta ? `, a ${bozza.citta}` : '';
  const formato: FormatoSocial = (c.formato as FormatoSocial) || 'post';
  const framework: FrameworkSocial = (c.framework as FrameworkSocial) || 'PAS';
  const canale: CanaleSocial = (c.canale as CanaleSocial) || 'facebook';

  const pezzi: string[] = [
    `ATTIVITÀ: ${bozza.azienda}${dove}.`,
    m.cosa_fa?.valore ? `Cosa fa in concreto: ${m.cosa_fa.valore}.` : '',
    `CANALE SOCIAL: ${canale.toUpperCase()}`,
    `FORMATO: ${formato.toUpperCase()}`,
    `FRAMEWORK RICHIESTO: ${framework}`,
    `\nIL FATTO REALE E VERIFICATO DA RACCONTARE${c.fonte ? ` (fonte: ${c.fonte})` : ''}:\n"${c.fatto ?? m.cosa_fa?.valore ?? ''}"`,
    `\nANGOLO / COMPITO: ${c.angolo ?? 'Racconta questo fatto con stile concreto e umano.'}`,
    c.titolo ? `(Tema di lavorazione: ${c.titolo})` : '',
  ];

  // Regole di formato e framework
  pezzi.push('\n--- ISTRUZIONI DI FORMATO ---');
  pezzi.push(ISTRUZIONI_FORMATO[formato] ?? ISTRUZIONI_FORMATO.post);

  pezzi.push('\n--- ISTRUZIONI DI FRAMEWORK ---');
  pezzi.push(ISTRUZIONI_FRAMEWORK[framework] ?? ISTRUZIONI_FRAMEWORK.libero);

  // La voce del cliente
  pezzi.push('\n--- COME PARLA QUESTO CLIENTE ---');
  pezzi.push(vocePerPrompt(voceDi(m)));

  // Confini
  const divieti: string[] = [...DIVIETI_BASE];
  if (m.non_fa.length) divieti.push(...m.non_fa.map((d) => `NON fa: ${d}`));
  if (m.mai_dire.length) divieti.push(...m.mai_dire.map((d) => `NON dire mai: ${d}`));
  pezzi.push('\n--- CONFINI E COSE DA NON DIRE ---');
  pezzi.push(divieti.map((d) => `- ${d}`).join('\n'));

  // Regole canale
  pezzi.push('\n--- REGOLE CANALE SOCIAL ---');
  pezzi.push(REGOLE_SOCIAL_BASE);

  // Schema JSON richiesto
  pezzi.push(`
--- STRUTTURA JSON DI RISPOSTA RICHIESTA ---
Restituisci ESATTAMENTE questo schema JSON:
{
  "ganci": [
    "Variante gancio 1 (prima riga ad alto contrasto, < 50 caratteri)",
    "Variante gancio 2 (curiosità / ribaltamento luogo comune)",
    "Variante gancio 3 (domanda diretta al target)"
  ],
  "gancio_scelto": 0,
  "testo": "Corpo completo del post per mobile, con righe vuote tra i paragrafi brevi, ritmo serrato e la CTA.",
  "primo_commento": "Testo da incollare come primo commento con link, info di contatto o approfondimento.",
  "hashtag": ["#Hashtag1", "#Hashtag2", "#Hashtag3"],
  "slide": [
    // Obbligatorio solo se formato == 'carosello': da 4 a 7 slide
    { "n": 1, "testo": "Testo sintetico slide", "prompt_immagine": "Prompt descrittivo per generare l'immagine 1080x1350" }
  ],
  "script_reel": [
    // Obbligatorio solo se formato == 'reel': battute e video
    { "secondi": "0-3s", "a_video": "Cosa si vede (inquadratura/azione)", "voce": "Cosa viene detto" }
  ],
  "dati_mancanti": [
    // Inserisci qui eventuali dati specifici che servirebbero ma non sono presenti nel fatto
  ]
}`);

  return pezzi.filter(Boolean).join('\n');
}

export async function scriviBozzaSocial(bozza: BozzaSocialDaScrivere): Promise<{
  testo: string;
  modello: string;
  ms: number;
  contenutoSocial: ContenutoSocial;
}> {
  const materia = await leggiMateria(bozza.azienda_id);
  const prompt = promptSocial(bozza, materia);

  const { dato, modello, ms } = await generaJson<ContenutoSocial>(
    SISTEMA_COPYWRITER_SOCIAL,
    prompt,
    isContenutoSocial,
    { maxTokens: 2500 }
  );

  const c = bozza.contenuto;
  const contenutoSocial: ContenutoSocial = {
    ...dato,
    canale: (c.canale as CanaleSocial) || dato.canale || 'facebook',
    formato: (c.formato as FormatoSocial) || dato.formato || 'post',
    framework: (c.framework as FrameworkSocial) || dato.framework || 'PAS',
    titolo: typeof c.titolo === 'string' ? c.titolo : undefined,
    angolo: typeof c.angolo === 'string' ? c.angolo : undefined,
    fatto: typeof c.fatto === 'string' ? c.fatto : undefined,
    fonte: typeof c.fonte === 'string' ? c.fonte : undefined,
    origine_slot: typeof c.origine_slot === 'string' ? c.origine_slot : undefined,
  };

  return {
    testo: dato.testo,
    modello,
    ms,
    contenutoSocial,
  };
}
