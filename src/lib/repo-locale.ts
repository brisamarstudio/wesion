/**
 * Trova il repository Git di un cliente guardando dentro `SITI/`, invece di
 * farselo dettare a mano.
 *
 * ⚠️ SOLO SU QUESTO PC, NON SU CONTABO. `SITI/` è una cartella locale del PC di
 * sviluppo (03/09/2026): la dashboard vera gira su Contabo, che non ci arriva.
 * Per questo il percorso viene da `SITI_LOCAL_PATH`, che semplicemente non c'è
 * nel `.env` del server — lì la funzione dice "non disponibile qui" invece di
 * rompersi, e il campo si compila a mano come sempre. Non è una scorciatoia
 * finta: è comoda esattamente quando serve, cioè mentre si configura un
 * cliente da questo PC, e sparisce da sola dove non ha senso che ci sia.
 *
 * ⚠️ LEGGE E BASTA, come `gbp.ts`: propone un `repo_url`, non lo scrive in
 * tabella. Stessa regola di "Leggi dalla scheda Google" — un fatto sul
 * cliente lo conferma una persona premendo «Salva», mai in automatico.
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

/** Toglie spazi, accenti e maiuscole: così "Trattoria La Fenice" e
 *  "trattorialafenice" si confrontano allo stesso modo. */
function normalizza(s: string): string {
  const senzaAccenti = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return senzaAccenti.toLowerCase().replace(/[^a-z0-9]/g, '');
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
      continue; // non è un repo, o non ha .git in cima (submodule strano): si salta
    }
    try {
      const { stdout } = await exec('git', ['-C', cartella, 'remote', 'get-url', 'origin'], {
        timeout: 5_000,
      });
      const repo_url = stdout.trim();
      if (repo_url) risultati.push({ cartella: voce.name, repo_url });
    } catch {
      continue; // repo senza remote 'origin': niente da proporre
    }
  }

  return risultati;
}

export interface EsitoRicercaRepo {
  disponibile: boolean;
  /** Un solo candidato chiaro: il nome dell'azienda combacia con una sola cartella. */
  trovato: CandidatoRepo | null;
  /** Più di uno combacia, o nessuno: elencati per farli scegliere a una persona. */
  candidati: CandidatoRepo[];
}

/**
 * Cerca fra le cartelle di `SITI/` quella del cliente `nome`/`slug`.
 *
 * Combacia per CONTENIMENTO fra le due normalizzate, in entrambi i sensi:
 * "MyWebby" sta dentro "SitoMyWebby", "trattorialafenicepavia" (lo slug)
 * contiene "trattorialafenice" (la cartella). Se ne combaciano zero o più di
 * uno, non si indovina: si restituiscono come candidati e decide una persona
 * — la stessa regola di "Leggi dalla scheda Google" applicata qui.
 */
export async function cercaRepoLocale(nome: string, slug: string): Promise<EsitoRicercaRepo> {
  const basePath = process.env.SITI_LOCAL_PATH;
  if (!basePath) return { disponibile: false, trovato: null, candidati: [] };

  let tutti: CandidatoRepo[];
  try {
    tutti = await elencaRepoLocali(basePath);
  } catch {
    return { disponibile: false, trovato: null, candidati: [] };
  }

  const chiavi = [normalizza(nome), normalizza(slug)].filter(Boolean);
  const combacia = tutti.filter((c) => {
    const cart = normalizza(c.cartella);
    return chiavi.some((k) => cart.includes(k) || k.includes(cart));
  });

  if (combacia.length === 1) return { disponibile: true, trovato: combacia[0], candidati: [] };
  return { disponibile: true, trovato: null, candidati: combacia.length ? combacia : tutti };
}
