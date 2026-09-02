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
import { mkdtemp, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

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

export interface ModificaProposta {
  /** Relativo alla radice del repo. */
  percorso: string;
  contenuto_nuovo: string;
}

/**
 * Scrive le modifiche, apre un branch, pusha, apre la PR. Ritorna l'URL.
 *
 * ⚠️ `stat` prima di scrivere una cartella nuova non basta da solo — un file
 * come `public/llms.txt` su un repo che non ha ancora `public/` fallirebbe la
 * `writeFile` con ENOENT. Si crea la cartella se manca.
 */
export async function apriPR(params: {
  dir: string;
  info: RepoInfo;
  token: string;
  modifiche: ModificaProposta[];
  titolo: string;
  corpo: string;
}): Promise<string> {
  const { dir, info, token, modifiche, titolo, corpo } = params;
  if (!modifiche.length) throw new Error('Nessuna modifica da proporre: niente da aprire come PR.');

  const { mkdir } = await import('node:fs/promises');
  for (const m of modifiche) {
    const assoluto = path.join(dir, m.percorso);
    await mkdir(path.dirname(assoluto), { recursive: true });
    await writeFile(assoluto, m.contenuto_nuovo, 'utf8');
  }

  const branch = `wesion-seo-${new Date().toISOString().slice(0, 10)}`;
  const opzioni = { cwd: dir, timeout: 30_000 };

  await exec('git', ['config', 'user.email', 'wesion@mywebby.it'], opzioni);
  await exec('git', ['config', 'user.name', 'Wesion (audit SEO automatico)'], opzioni);
  await exec('git', ['checkout', '-b', branch], opzioni);
  await exec('git', ['add', ...modifiche.map((m) => m.percorso)], opzioni);
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
