/**
 * Un articolo non è un post lungo: ha una scheda.
 *
 * Un post di Google è testo e basta. Un articolo che finisce su un blog ha un
 * titolo che deve incuriosire, un sommario che compare nell'elenco, una
 * categoria che lo raggruppa, e uno slug che diventa **il suo indirizzo per
 * sempre**. Generarli in quattro chiamate darebbe quattro pezzi che non si
 * parlano — un titolo che promette una cosa e un corpo che ne racconta
 * un'altra. Si chiedono insieme, in un JSON solo.
 *
 * ⚠️ LO SLUG SI CALCOLA UNA VOLTA E NON SI RICALCOLA MAI PIÙ.
 *
 * È la chiave con cui il sito riconosce l'articolo: stesso slug = stesso
 * articolo, quindi ripubblicare aggiorna invece di duplicare. Se lo si
 * ricalcolasse dal titolo a ogni salvataggio, correggere una parola nel titolo
 * dalla consolle creerebbe un **secondo articolo** sul sito, e il primo
 * resterebbe online per sempre — due versioni della stessa cosa che si fanno
 * concorrenza su Google, senza che nessuno se ne accorga.
 *
 * Per questo lo slug nasce con la bozza e sta in `contenuto.slug`, e da lì non
 * si tocca. Il titolo si può correggere quanto si vuole.
 */

import { generaJson } from './generatore';
import { creaSlug } from './normalizza';
import { DIVIETI_BASE, SISTEMA_COPYWRITER } from './regolePost';
import type { Materia } from './materia';
import { daFonte } from './materia';
import { voceDi } from './materia';
import { vocePerPrompt } from './voce';

export interface SchedaArticolo {
  titolo: string;
  sommario: string;
  categoria: string;
  corpo: string;
}

/**
 * Il ruolo per gli articoli.
 *
 * Diverso da quello dei post di Google, e non di poco: là si scrivono tre righe
 * che nessuno ha cercato, qui un pezzo che qualcuno leggerà perché aveva una
 * domanda. Il tono resta quello di chi manda avanti l'attività, ma il compito
 * cambia — si spiega, non si annuncia.
 */
export const SISTEMA_ARTICOLI =
  SISTEMA_COPYWRITER.replace(
    'Scrivi i post di Google Business Profile per conto di attività italiane',
    'Scrivi articoli per il blog di attività italiane'
  ) +
  '\n\nUn articolo si legge perché chi lo apre aveva una domanda: rispondi a quella, in concreto, ' +
  'con esempi presi da quello che l’attività fa davvero. Niente introduzioni che girano intorno ' +
  'al punto per tre paragrafi.';

const REGOLE_ARTICOLO = `REGOLE DELL'ARTICOLO:
1. Da 400 a 700 parole nel corpo. Più corto non risponde a niente, più lungo non lo legge nessuno.
2. TESTO SEMPLICE, con gli a capo fra i paragrafi. Niente markdown: niente **grassetto**, niente
   ## titoli, niente [link](url). Il sito lo pubblica com'è.
3. Il TITOLO dice cosa impari leggendo, non è uno slogan. Massimo 70 caratteri: oltre, Google lo
   taglia nei risultati e chi cerca legge una frase mozzata.
4. Il SOMMARIO sono una o due frasi, massimo 160 caratteri: è quello che si legge sotto il titolo
   nell'elenco e nei risultati di ricerca. Deve dare un motivo per aprire, non ripetere il titolo.
5. Nel corpo NIENTE contatti — telefono, email, indirizzo, URL. Chi vuole trovarci ha il sito
   attorno all'articolo.
6. NON INVENTARE NIENTE. Solo i fatti scritti qui sopra. Se non basta a fare 400 parole, scrivi
   meno: un pezzo corto e vero è meglio di uno lungo e inventato.
7. Niente "in questo articolo vedremo", niente "in conclusione": si entra nel merito e si finisce
   quando si è finito.`;

/** I campi che devono esserci, controllati prima di fidarsi. */
function eScheda(x: unknown): x is SchedaArticolo {
  const d = x as Record<string, unknown>;
  return (
    Boolean(d) &&
    typeof d.titolo === 'string' &&
    d.titolo.trim().length > 0 &&
    typeof d.corpo === 'string' &&
    d.corpo.trim().length > 100
  );
}

function elenco(titolo: string, voci: string[]): string {
  const pulite = voci.map((v) => String(v).trim()).filter(Boolean);
  return pulite.length ? `\n${titolo}\n${pulite.map((v) => `- ${v}`).join('\n')}` : '';
}

export interface RichiestaArticolo {
  azienda: string;
  citta: string | null;
  /** Il tema, dal piano o scritto a mano. */
  angolo: string;
  titoloLavorazione?: string;
  /** Il fatto su cui si regge. */
  fatto?: string;
  /** Le categorie che questo blog usa già: si sceglie fra quelle, non se ne inventano. */
  categorie: string[];
}

export function promptArticolo(r: RichiestaArticolo, m: Materia): string {
  const dove = r.citta ? `, a ${r.citta}` : '';
  return [
    `ATTIVITÀ: ${r.azienda}${dove}.`,
    m.cosa_fa?.valore ? `In concreto: ${m.cosa_fa.valore}.` : '',
    r.fatto ? `\n\nIL FATTO da cui parte l'articolo:\n"${r.fatto}"` : '',
    `\nDI COSA PARLA: ${r.angolo}`,
    r.titoloLavorazione ? `(tema di lavorazione: ${r.titoloLavorazione})` : '',

    elenco('\nALTRE COSE VERE che puoi usare:', [
      ...daFonte(m, 'offerta').map((v) => v.valore),
      ...daFonte(m, 'materiali').map((v) => v.valore),
      ...daFonte(m, 'punti_forza').map((v) => v.valore),
    ]),
    elenco('\nCONFINI — non contraddirli mai:', m.non_fa),
    elenco('\nNON DIRE MAI:', m.mai_dire),
    elenco('\nNON AFFERMARE MAI, qualunque sia il cliente:', DIVIETI_BASE),

    // La voce in fondo, con la separazione fra sfondo, recensioni e istruzioni:
    // vedi `voce.ts`. È l'ultimo posto che un modello guarda prima di
    // rispondere, ed è la parte che decide se il pezzo suona come lui.
    `\n\n${vocePerPrompt(voceDi(m))}`,

    r.categorie.length
      ? `\nCATEGORIA: scegli UNA fra queste, scritta identica: ${r.categorie.join(' · ')}`
      : '\nCATEGORIA: una o due parole che raggruppino questo articolo.',

    `\n\n${REGOLE_ARTICOLO}`,

    `\n\nRispondi SOLO con questo oggetto JSON, senza niente attorno:
{"titolo": "…", "sommario": "…", "categoria": "…", "corpo": "…"}`,
  ]
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ArticoloGenerato extends SchedaArticolo {
  /** Calcolato dal titolo, UNA VOLTA SOLA. Vedi il commento in cima al file. */
  slug: string;
  modello: string;
  ms: number;
}

export async function scriviArticolo(r: RichiestaArticolo, m: Materia): Promise<ArticoloGenerato> {
  const esito = await generaJson<SchedaArticolo>(SISTEMA_ARTICOLI, promptArticolo(r, m), eScheda);
  const d = esito.dato;

  const titolo = d.titolo.trim();
  const categoria = String(d.categoria ?? '').trim();

  return {
    titolo,
    // Il sommario è facoltativo per il modello ma non per l'elenco del blog: se
    // manca si prende l'inizio del corpo, che è meglio di uno spazio bianco.
    sommario: String(d.sommario ?? '').trim() || d.corpo.trim().slice(0, 155).replace(/\s+\S*$/, '') + '…',
    // Se il modello si è inventato una categoria fuori elenco si tiene quella
    // del cliente più vicina — cioè nessuna: meglio senza che una etichetta
    // nuova che spacca il raggruppamento del blog.
    categoria: r.categorie.length && !r.categorie.includes(categoria) ? '' : categoria,
    corpo: d.corpo.trim(),
    slug: creaSlug(titolo),
    modello: esito.modello,
    ms: esito.ms,
  };
}
