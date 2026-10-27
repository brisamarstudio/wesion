/**
 * Trova il repository Git di un cliente:
 * 1. Guardando nelle cartelle locali di `SITI/` (se eseguito sul PC di sviluppo).
 * 2. Interrogando l'API di GitHub di BrisamarStudio (se eseguito online su Contabo,
 *    tramite GITHUB_TOKEN_BRISAMAR).
 *
 * Utilizza sia il nome/slug del cliente, sia il DOMINIO del suo sito web
 * (es. "Chumphon Studio Massaggi Thailandesi" ha sito "https://www.emmathai.it/" -> trova il repo "emmathai").
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);

export interface CandidatoRepo {
  cartella: string;
  repo_url: string;
}

/** Toglie spazi, accenti e maiuscole per il matching */
function normalizza(s: string): string {
  const senzaAccenti = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return senzaAccenti.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Estrae il brand o dominio pulito da un URL (es. "https://www.emmathai.it/" -> "emmathai") */
function estraiDominio(url: string): string {
  try {
    const raw = url.trim();
    if (!raw) return '';
    const parsed = new URL(raw.startsWith('http') ? raw : 'https://' + raw);
    const host = parsed.hostname.replace(/^www\./, '');
    const parti = host.split('.');
    return parti.length > 1 ? parti[0] : host;
  } catch {
    return '';
  }
}

/** Le cartelle vere di `SITI/` che hanno un `.git`, con l'URL del loro `origin`. */
async function elencaRepoLocali(basePath: string): Promise<CandidatoRepo[]> {
  const voci = await readdir(basePath, { withFileTypes: true });
  const risultati: CandidatoRepo[] = [];

  for (const voce of voci) {
    if (!voce.isDirectory()) continue;
    const cartella = path.join(basePath, voce.name);
    try {
      await stat(path.join(cartella, '.git'));
    } catch {
      continue;
    }
    try {
      const { stdout } = await exec('git', ['-C', cartella, 'remote', 'get-url', 'origin'], {
        timeout: 5_000,
      });
      const repo_url = stdout.trim();
      if (repo_url) risultati.push({ cartella: voce.name, repo_url });
    } catch {
      continue;
    }
  }

  return risultati;
}

/** Cerca i repo tramite l'API di GitHub se siamo sul server remoto (Contabo) */
async function elencaRepoGitHub(token: string): Promise<CandidatoRepo[]> {
  try {
    const r = await fetch('https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'Wesion-RepoFinder',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const dati = (await r.json()) as Array<{ name: string; ssh_url?: string; full_name?: string }>;
    if (!Array.isArray(dati)) return [];
    return dati.map((repo) => ({
      cartella: repo.name,
      repo_url: `github-wesion:${repo.full_name || `brisamarstudio/${repo.name}`}.git`,
    }));
  } catch {
    return [];
  }
}

export interface EsitoRicercaRepo {
  disponibile: boolean;
  trovato: CandidatoRepo | null;
  candidati: CandidatoRepo[];
}

export async function cercaRepoLocale(
  nome: string,
  slug: string,
  sitoUrl?: string
): Promise<EsitoRicercaRepo> {
  const basePath = process.env.SITI_LOCAL_PATH;
  const githubToken = process.env.GITHUB_TOKEN_BRISAMAR;

  let tutti: CandidatoRepo[] = [];

  // 1. Prova prima il filesystem locale se configurato (sviluppo)
  if (basePath) {
    try {
      tutti = await elencaRepoLocali(basePath);
    } catch {
      tutti = [];
    }
  }

  // 2. Se non siamo in locale o non ci sono cartelle, interroga GitHub via API
  if (tutti.length === 0 && githubToken) {
    tutti = await elencaRepoGitHub(githubToken);
  }

  if (tutti.length === 0) {
    return { disponibile: false, trovato: null, candidati: [] };
  }

  // Estraiamo le chiavi di ricerca: nome, slug, e il dominio del sito web
  const dominio = sitoUrl ? estraiDominio(sitoUrl) : '';
  const chiavi = [
    normalizza(nome),
    normalizza(slug),
    dominio ? normalizza(dominio) : '',
  ].filter((k) => k.length >= 3);

  // Cerchiamo corrispondenze
  const combacia = tutti.filter((c) => {
    const cart = normalizza(c.cartella);
    return chiavi.some((k) => cart.includes(k) || k.includes(cart));
  });

  if (combacia.length === 1) {
    return { disponibile: true, trovato: combacia[0], candidati: [] };
  }

  return {
    disponibile: true,
    trovato: null,
    candidati: combacia.length ? combacia : tutti,
  };
}
