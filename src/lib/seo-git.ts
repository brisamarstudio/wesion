/**
 * Clonare il repo di un sito cliente, leggerne i file SEO, e aprire la PR con
 * le correzioni proposte.
 *
 * ⚠️ SOLO UNA PR, MAI UN PUSH SU MAIN. È la stessa regola di "l'ultimo bottone
 * è dell'operatore" applicata al codice invece che a una bozza GBP: Wesion può
 * fare tutto il resto da sola — clonare, leggere Search Console, scrivere le
 * modifiche, aprire la Pull Request — ma il merge lo decide una persona che
 * guarda il diff. Un errore in un `robots.txt` mergiato al buio può bloccare
 * l'indicizzazione di un cliente per settimane senza che nessuno se ne accorga.
 *
 * ⚠️ IL TOKEN, NON L'ALIAS SSH. `repo_url` arriva scritto in qualunque forma
 * (`github-wesion:owner/repo.git` come questo stesso repo, `git@github.com:...`,
 * un URL https) — su questo server non esiste nessun alias SSH configurato per
 * i repo dei clienti, solo quello di Wesion verso se stesso. Si estrae
 * `owner/repo` con una regex e si ricostruisce SEMPRE un URL https col token,
 * qualunque fosse la forma incollata nel modulo.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// Import con estensione .ts, come in `router/`: senza, questo file lo può
// caricare solo Next, e la sua prova (`db/prova-seo-git.ts`, che gira con
// --experimental-strip-types) non parte. È il modulo che scrive sui repo dei
// clienti: deve restare provabile fuori dall'app.
import { riscrivibileIntero, fattiAlterati, type ModificaProposta } from './seo-proposta.ts';

const exec = promisify(execFile);

export interface RepoInfo {
  owner: string;
  repo: string;
}

/** Qualunque forma sia arrivata, ne esce sempre owner/repo. */
export function estraiRepo(repoUrl: string): RepoInfo {
  const pulito = repoUrl.trim().replace(/\.git$/, '');
  const m = pulito.match(/[:/]([^/:]+)\/([^/]+)$/);
  if (!m) throw new Error(`Non riconosco "owner/repo" dentro "${repoUrl}".`);
  return { owner: m[1], repo: m[2] };
}

function urlConToken(owner: string, repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

/** Clona superficiale (un solo commit): basta a leggere e scrivere file, non serve la storia. */
export async function clonaRepo(repoUrl: string, token: string): Promise<{ dir: string; info: RepoInfo }> {
  const info = estraiRepo(repoUrl);
  const dir = await mkdtemp(path.join(os.tmpdir(), `wesion-seo-${info.repo}-`));
  await exec('git', ['clone', '--depth', '1', urlConToken(info.owner, info.repo, token), dir], {
    timeout: 60_000,
  });
  return { dir, info };
}

export async function pulisci(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function leggiSeEsiste(percorso: string): Promise<string | null> {
  try {
    return await readFile(percorso, 'utf8');
  } catch {
    return null;
  }
}

const IGNORA = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.astro']);
const ESTENSIONI_UTILI = new Set(['.astro', '.blade.php', '.php', '.html', '.tsx', '.jsx', '.vue', '.svelte']);

/**
 * Cerca i file che probabilmente contengono il grafo JSON-LD.
 *
 * ⚠️ NON C'È UN PERCORSO FISSO: un sito è Astro (`Layout.astro`), un altro
 * Laravel (`layouts/app.blade.php`) — vedi il playbook SEO. Si cerca il
 * contenuto (`application/ld+json` o `@graph`), non un nome di file.
 */
export async function trovaFileSchema(radice: string, massimo = 5): Promise<string[]> {
  const trovati: string[] = [];

  async function esplora(dir: string): Promise<void> {
    if (trovati.length >= massimo) return;
    let voci;
    try {
      voci = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const v of voci) {
      if (trovati.length >= massimo) return;
      if (IGNORA.has(v.name)) continue;
      const p = path.join(dir, v.name);
      if (v.isDirectory()) {
        await esplora(p);
        continue;
      }
      const estensioneOk = [...ESTENSIONI_UTILI].some((e) => v.name.endsWith(e));
      if (!estensioneOk) continue;
      const contenuto = await leggiSeEsiste(p);
      if (contenuto && (contenuto.includes('application/ld+json') || contenuto.includes('@graph'))) {
        trovati.push(path.relative(radice, p));
      }
    }
  }

  await esplora(radice);
  return trovati;
}

export interface MaterialeSito {
  llmsTxt: string | null;
  /** Dove sta davvero, relativo alla radice del repo. `null` se non c'è. */
  llmsPercorso: string | null;
  robotsTxt: string | null;
  robotsPercorso: string | null;
  fileSchema: Array<{ percorso: string; contenuto: string }>;
}

/**
 * La cartella da cui il sito serve i file statici, per i generatori che usiamo.
 *
 * Astro e Next li tengono in `public/`, SvelteKit e Hugo in `static/`. La
 * radice viene per ultima perché è il posto in cui NON stanno quasi mai: se un
 * repo ha tutti e due, quello servito online è quello dentro la cartella.
 */
const CARTELLE_STATICHE = ['public', 'static', ''];

/**
 * Il primo dei posti possibili in cui un file statico esiste davvero, insieme
 * al percorso con cui chiamarlo.
 *
 * ⚠️ NASCE DALLA PR #3 SU `trattorialafenice` (02/09/2026), e il danno è stato
 * la riscrittura di un `llms.txt` buono con uno scritto alla cieca. La causa
 * NON era il modello: `llms.txt` lo cercavamo solo nella radice, mentre su un
 * sito Astro sta in `public/` — e `robots.txt`, due righe più sotto, era già
 * cercato in tutti e due i posti. Così il prompt gli diceva «llms.txt attuale:
 * (non esiste)», e uno che non esiste si crea da zero: ha fatto la cosa
 * giusta rispetto a quello che gli avevamo raccontato del sito.
 *
 * Morale, che vale oltre questa funzione: prima di accusare il modello di aver
 * distrutto qualcosa, si guarda cosa gli abbiamo messo davanti.
 *
 * Il percorso torna insieme al contenuto perché senza il modello scrive dove
 * gli pare — di solito nella radice — e il sito si ritrova DUE `llms.txt`, con
 * quello servito online che resta il vecchio: un file nuovo che non legge
 * nessuno, e nessun errore da nessuna parte.
 */
async function leggiStatico(
  dir: string,
  nome: string
): Promise<{ percorso: string; contenuto: string } | null> {
  for (const cartella of CARTELLE_STATICHE) {
    const relativo = cartella ? `${cartella}/${nome}` : nome;
    const contenuto = await leggiSeEsiste(path.join(dir, relativo));
    if (contenuto !== null) return { percorso: relativo, contenuto };
  }
  return null;
}

export async function leggiMateriale(dir: string): Promise<MaterialeSito> {
  const [llms, robots] = await Promise.all([leggiStatico(dir, 'llms.txt'), leggiStatico(dir, 'robots.txt')]);

  const percorsi = await trovaFileSchema(dir);
  const fileSchema = await Promise.all(
    percorsi.map(async (p) => ({ percorso: p, contenuto: (await leggiSeEsiste(path.join(dir, p))) ?? '' }))
  );

  return {
    llmsTxt: llms?.contenuto ?? null,
    llmsPercorso: llms?.percorso ?? null,
    robotsTxt: robots?.contenuto ?? null,
    robotsPercorso: robots?.percorso ?? null,
    fileSchema,
  };
}

/**
 * Applica le modifiche proposte alla copia clonata, e dice cosa NON ha
 * applicato.
 *
 * ⚠️ QUI STA LA DIFESA VERA, e viene da un danno guardato in faccia: la PR #1
 * su `trattorialafenice` (02/09/2026) riscriveva `Layout.astro` per intero e
 * nel farlo cancellava schema, accessibilità e lo script del cambio lingua,
 * lasciando un riferimento a una variabile inesistente — un sito che non
 * compila. Il modello non aveva "sbagliato": gli avevamo chiesto di rigenerare
 * un file, e rigenerare vuol dire ricostruire a memoria.
 *
 * Perciò:
 *   - un file che ESISTE si tocca solo con una sostituzione mirata;
 *   - la sostituzione si applica solo se l'aggancio compare ESATTAMENTE una
 *     volta: zero volte vuol dire che il modello se l'è inventato, due volte
 *     che non sa quale dei due intendeva. In tutti e due i casi non si scrive.
 *
 * Quello che viene scartato torna indietro, non finisce in un log: chi legge
 * la PR deve sapere cosa manca.
 */
export async function applicaModifiche(
  dir: string,
  modifiche: ModificaProposta[]
): Promise<{ applicate: ModificaProposta[]; scartati: string[] }> {
  const { mkdir } = await import('node:fs/promises');
  const applicate: ModificaProposta[] = [];
  const scartati: string[] = [];

  for (const m of modifiche) {
    const assoluto = path.join(dir, m.percorso);

    // `path.resolve` normalizza anche i `..` che fossero sfuggiti al parser:
    // l'ultimo controllo prima della scrittura vera si fa sul percorso finito.
    if (!path.resolve(assoluto).startsWith(path.resolve(dir) + path.sep)) {
      scartati.push(`${m.percorso}: finirebbe fuori dal repo`);
      continue;
    }

    const attuale = await leggiSeEsiste(assoluto);

    if (m.azione === 'scrivi') {
      if (attuale !== null && !riscrivibileIntero(m.percorso)) {
        scartati.push(
          `${m.percorso}: esiste già e non è un file riscrivibile per intero — ` +
            'andava proposta una sostituzione mirata, non una riscrittura'
        );
        continue;
      }
      const nuovo = m.contenuto_nuovo ?? '';
      if (!nuovo.trim()) {
        scartati.push(`${m.percorso}: contenuto vuoto`);
        continue;
      }

      // ⚠️ ANCHE UN FILE RISCRIVIBILE PER INTERO, SE ESISTE, NON PUÒ USCIRNE
      //    PIÙ POVERO DI COM'È ENTRATO — PR #3 su `trattorialafenice`
      //    (02/09/2026): un `llms.txt` strutturato (sezioni, link con
      //    descrizione) sostituito da un elenco piatto di URL, 13 righe tolte
      //    per cinque messe. `RISCRIVIBILI_INTERI` nasceva dall'idea che su
      //    quei file «non c'è nulla da perdere»: vero quando non esistono,
      //    falso il giorno dopo, quando esistono perché li abbiamo scritti noi.
      //
      //    La causa di quel giro era un'altra (vedi `leggiStatico`) ed è
      //    riparata, ma la porta restava aperta per il prossimo che sbaglia
      //    percorso. Il metro è la lunghezza, non un giudizio sul contenuto:
      //    una proposta buona su questi file AGGIUNGE, e un file più corto è
      //    l'unica forma che ha qui il «l'ho ricostruito a memoria».
      //
      //    Si perde qualche riscrittura legittima più stringata. Va bene: lo
      //    scarto finisce nella PR, chi legge lo vede e lo fa a mano in due
      //    minuti — mentre un file buono coperto in silenzio non lo vede
      //    nessuno finché non serve.
      if (attuale !== null && nuovo.trim().length < attuale.trim().length) {
        scartati.push(
          `${m.percorso}: la riscrittura è più corta del file che c'è già ` +
            `(${nuovo.trim().length} caratteri contro ${attuale.trim().length}) — ` +
            'su questi file si aggiunge, non si sostituisce con meno di quello che c\'era'
        );
        continue;
      }

      await mkdir(path.dirname(assoluto), { recursive: true });
      await writeFile(assoluto, nuovo, 'utf8');
      applicate.push(m);
      continue;
    }

    // sostituzione
    if (attuale === null) {
      scartati.push(`${m.percorso}: non esiste, non c'è niente da sostituire`);
      continue;
    }
    const cerca = m.cerca ?? '';

    // Un fatto sul cliente cambiato di nascosto dentro una modifica per il
    // resto legittima — vedi `fattiAlterati`, e la PR #2 che l'ha insegnato.
    const alterati = fattiAlterati(cerca, m.con ?? '');
    if (alterati.length) {
      scartati.push(
        `${m.percorso}: cambierebbe dati sul cliente che nessuno ha verificato (${alterati.join(', ')}) — ` +
          'quelli si correggono a mano, non li decide un modello'
      );
      continue;
    }

    const quante = attuale.split(cerca).length - 1;
    if (quante === 0) {
      scartati.push(`${m.percorso}: il testo da sostituire non si trova nel file`);
      continue;
    }
    if (quante > 1) {
      scartati.push(`${m.percorso}: il testo da sostituire compare ${quante} volte, ambiguo`);
      continue;
    }
    await writeFile(assoluto, attuale.replace(cerca, m.con ?? ''), 'utf8');
    applicate.push(m);
  }

  return { applicate, scartati };
}

/**
 * Apre un branch sulle modifiche già applicate, pusha, apre la PR. Ritorna l'URL.
 */
export async function apriPR(params: {
  dir: string;
  info: RepoInfo;
  token: string;
  percorsi: string[];
  titolo: string;
  corpo: string;
}): Promise<string> {
  const { dir, info, token, percorsi, titolo, corpo } = params;
  if (!percorsi.length) throw new Error('Nessuna modifica applicata: niente da aprire come PR.');

  // Il giorno nel nome basta finché il giro è mensile; l'ora evita che due
  // prove nello stesso pomeriggio litighino sullo stesso branch.
  const branch = `wesion-seo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const opzioni = { cwd: dir, timeout: 30_000 };

  await exec('git', ['config', 'user.email', 'wesion@mywebby.it'], opzioni);
  await exec('git', ['config', 'user.name', 'Wesion (audit SEO automatico)'], opzioni);
  await exec('git', ['checkout', '-b', branch], opzioni);
  await exec('git', ['add', ...percorsi], opzioni);
  await exec('git', ['commit', '-m', titolo], opzioni);
  await exec('git', ['push', urlConToken(info.owner, info.repo, token), `HEAD:${branch}`], opzioni);

  // Il branch di base: quello che GitHub dice essere il default, non "main"
  // per assunzione — un repo vecchio può chiamarsi ancora "master".
  const rInfo = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!rInfo.ok) throw new Error(`GitHub (info repo): ${(await rInfo.text()).slice(0, 300)}`);
  const { default_branch: base } = (await rInfo.json()) as { default_branch: string };

  const rPR = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: titolo, body: corpo, head: branch, base }),
  });
  if (!rPR.ok) throw new Error(`GitHub (apertura PR): ${(await rPR.text()).slice(0, 300)}`);

  const { html_url: url } = (await rPR.json()) as { html_url: string };
  return url;
}

/**
 * Da un URL di PR ai tre pezzi che servono per interrogarla.
 *
 * L'URL è l'unica cosa che teniamo in `wesion.sito`: il numero si rilegge da
 * lì invece di salvarlo a parte, così non ci sono due verità da tenere
 * allineate.
 */
export function pezziPR(urlPR: string): { owner: string; repo: string; numero: number } | null {
  const m = urlPR.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], numero: Number(m[3]) };
}

export interface FileCambiato {
  percorso: string;
  aggiunte: number;
  tolte: number;
  /** Il diff di questo file, come lo manda GitHub. Assente sui file binari. */
  patch: string | null;
}

export interface StatoPR {
  numero: number;
  url: string;
  /** `aperta`, `applicata` (merge fatto), `chiusa` (chiusa senza merge). */
  stato: 'aperta' | 'applicata' | 'chiusa';
  file: FileCambiato[];
}

/**
 * Cosa c'è dentro una PR, per farla leggere in dashboard invece che su GitHub.
 *
 * ⚠️ Serve perché senza, la feature è a metà: la macchina fa l'analisi e poi
 * la nasconde dietro un link, lasciando all'operatore il lavoro di capire un
 * diff su un sito esterno. Chi approva un post non va a leggerlo su Google:
 * lo legge qui. Vale lo stesso per il codice di un sito.
 */
export async function leggiPR(urlPR: string, token: string): Promise<StatoPR> {
  const p = pezziPR(urlPR);
  if (!p) throw new Error(`Non riconosco questo indirizzo di PR: ${urlPR}`);

  const intestazioni = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const base = `https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.numero}`;

  const [rPR, rFile] = await Promise.all([
    fetch(base, { headers: intestazioni }),
    fetch(`${base}/files?per_page=50`, { headers: intestazioni }),
  ]);

  if (!rPR.ok) throw new Error(`GitHub (lettura PR): ${(await rPR.text()).slice(0, 300)}`);
  if (!rFile.ok) throw new Error(`GitHub (file della PR): ${(await rFile.text()).slice(0, 300)}`);

  const pr = (await rPR.json()) as { state: string; merged: boolean; html_url: string };
  const file = (await rFile.json()) as Array<{
    filename: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;

  return {
    numero: p.numero,
    url: pr.html_url,
    stato: pr.merged ? 'applicata' : pr.state === 'open' ? 'aperta' : 'chiusa',
    file: file.map((f) => ({
      percorso: f.filename,
      aggiunte: f.additions,
      tolte: f.deletions,
      patch: f.patch ?? null,
    })),
  };
}

/**
 * Applica la proposta: il merge.
 *
 * ⚠️ È IL BOTTONE DELL'OPERATORE, e da qui in poi il sito del cliente cambia
 * davvero (Cloudflare Pages ricostruisce da solo al push su main). Per questo
 * non lo fa nessun giro automatico e non lo fa il modello: lo chiama solo
 * qualcuno che ha appena guardato il diff in pagina.
 */
export async function applicaPR(urlPR: string, token: string, titolo: string): Promise<void> {
  const p = pezziPR(urlPR);
  if (!p) throw new Error(`Non riconosco questo indirizzo di PR: ${urlPR}`);

  const risposta = await fetch(
    `https://api.github.com/repos/${p.owner}/${p.repo}/pulls/${p.numero}/merge`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ commit_title: titolo, merge_method: 'squash' }),
    }
  );

  if (!risposta.ok) {
    const dettaglio = (await risposta.text()).slice(0, 300);
    // 405 = GitHub dice che non è mergiabile (conflitti, o branch protetto):
    // è un no motivato, non un guasto nostro, e va detto così.
    throw new Error(
      risposta.status === 405
        ? `GitHub non riesce ad applicarla da sola (di solito: conflitti col branch principale). ${dettaglio}`
        : `GitHub (merge): ${dettaglio}`
    );
  }
}

/**
 * Scarta la proposta: commento col motivo, PR chiusa, ramo cancellato.
 *
 * ⚠️ ESISTE PERCHÉ IL «NO» NON C'ERA (02/09/2026). La scheda sapeva dire solo
 * sì: per rifiutare una proposta bisognava uscire da Wesion, aprire GitHub e
 * chiuderla lì. Ma la regola che tiene su tutto questo programma è che
 * l'ultimo bottone è dell'operatore — e un bottone che ha solo il sì non è una
 * decisione, è un modulo di consenso. Le prime tre PR su `trattorialafenice`
 * andavano buttate tutte e tre: se il no costa un giro fuori dal programma,
 * prima o poi qualcuno applica per stanchezza.
 *
 * Il motivo finisce in un commento PRIMA della chiusura, e non è cortesia:
 * fra sei mesi «closed» da solo non dice se la proposta era sbagliata o solo
 * arrivata in un brutto momento, e quella differenza serve a chi legge lo
 * storico per capire se l'audit sta migliorando.
 */
export async function chiudiPR(urlPR: string, token: string, motivo?: string): Promise<void> {
  const p = pezziPR(urlPR);
  if (!p) throw new Error(`Non riconosco questo indirizzo di PR: ${urlPR}`);

  const intestazioni = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const base = `https://api.github.com/repos/${p.owner}/${p.repo}`;

  const rPR = await fetch(`${base}/pulls/${p.numero}`, { headers: intestazioni });
  if (!rPR.ok) throw new Error(`GitHub (lettura PR): ${(await rPR.text()).slice(0, 300)}`);
  const { head, state, merged } = (await rPR.json()) as {
    head: { ref: string };
    state: string;
    merged: boolean;
  };

  // Una già applicata non si "scarta": chiuderla non toglierebbe niente dal
  // sito, e lasciarlo credere sarebbe peggio che dire di no.
  if (merged) throw new Error(`La proposta #${p.numero} è già stata applicata al sito: non si può scartare.`);
  if (state !== 'open') throw new Error(`La proposta #${p.numero} non è più aperta: non c'è niente da scartare.`);

  if (motivo?.trim()) {
    // Se il commento non parte, la PR si chiude lo stesso: il motivo è
    // importante, ma non quanto il fatto che la proposta smetta di stare lì
    // aperta a chiedere una decisione già presa.
    await fetch(`${base}/issues/${p.numero}/comments`, {
      method: 'POST',
      headers: intestazioni,
      body: JSON.stringify({ body: `Scartata da Wesion.\n\n${motivo.trim()}` }),
    }).catch(() => {});
  }

  const rChiudi = await fetch(`${base}/pulls/${p.numero}`, {
    method: 'PATCH',
    headers: intestazioni,
    body: JSON.stringify({ state: 'closed' }),
  });
  if (!rChiudi.ok) throw new Error(`GitHub (chiusura PR): ${(await rChiudi.text()).slice(0, 300)}`);

  // ⚠️ Il ramo si cancella SOLO se l'abbiamo fatto noi. `wesion-seo-*` è roba
  // nostra e non la guarda nessun altro; qualunque altro nome è lavoro del
  // cliente, e sul repo di un cliente non si cancella niente che non abbiamo
  // creato — nemmeno se la PR passa da qui.
  //
  // E se la cancellazione fallisce non è un errore da mostrare: la PR è
  // chiusa, che è la cosa per cui è stato premuto il bottone. Un ramo di
  // troppo è sporcizia, non un danno.
  if (head.ref.startsWith('wesion-seo-')) {
    await fetch(`${base}/git/refs/heads/${head.ref}`, { method: 'DELETE', headers: intestazioni }).catch(() => {});
  }
}
