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
import { riscrivibileIntero, fattiAlterati, type ModificaProposta } from './seo-proposta';

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
  robotsTxt: string | null;
  fileSchema: Array<{ percorso: string; contenuto: string }>;
}

export async function leggiMateriale(dir: string): Promise<MaterialeSito> {
  const [llmsTxt, robotsTxt] = await Promise.all([
    leggiSeEsiste(path.join(dir, 'llms.txt')),
    leggiSeEsiste(path.join(dir, 'public', 'robots.txt')).then((v) => v ?? leggiSeEsiste(path.join(dir, 'robots.txt'))),
  ]);

  const percorsi = await trovaFileSchema(dir);
  const fileSchema = await Promise.all(
    percorsi.map(async (p) => ({ percorso: p, contenuto: (await leggiSeEsiste(path.join(dir, p))) ?? '' }))
  );

  return { llmsTxt, robotsTxt, fileSchema };
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
      if (!m.contenuto_nuovo?.trim()) {
        scartati.push(`${m.percorso}: contenuto vuoto`);
        continue;
      }
      await mkdir(path.dirname(assoluto), { recursive: true });
      await writeFile(assoluto, m.contenuto_nuovo, 'utf8');
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
