/**
 * La prova della parte che TOCCA IL DISCO: dove Wesion va a cercare i file del
 * sito di un cliente, e cosa lascia scrivere sopra a quelli che ci sono già.
 *
 *   npm run prova:seo-git
 *
 * ⚠️ Perché esiste, con una data. PR #3 su `trattorialafenice` (02/09/2026):
 * un `llms.txt` buono, scritto a mano — sezioni, link con descrizione — è
 * stato coperto da un elenco piatto di URL. Nessuno aveva sbagliato prompt: il
 * file lo cercavamo SOLO nella radice del repo, su un sito Astro sta in
 * `public/`, e al modello dicevamo «llms.txt attuale: (non esiste)». Uno che
 * non esiste si crea da zero, e infatti l'ha creato.
 *
 * La lezione che questa prova tiene ferma è più larga del bug: quello che il
 * modello combina dipende da cosa gli mettiamo davanti, e la fotografia del
 * sito la scattiamo noi, qui dentro. Le prove del parser stanno in
 * `prova-seo-proposta.ts`; queste sono le prove della fotografia.
 *
 * Gira su cartelle finte in una temporanea, non tocca niente di vero e non
 * chiede rete. Import con estensione .ts: la esegue Node con
 * --experimental-strip-types, non Next (stessa regola di `router/`).
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { leggiMateriale, applicaModifiche, pezziPR } from '../src/lib/seo-git.ts';
import type { ModificaProposta } from '../src/lib/seo-proposta.ts';

let falliti = 0;

function verifica(nome: string, condizione: boolean, dettaglio = '') {
  if (condizione) {
    console.log(`  ok   ${nome}`);
  } else {
    falliti++;
    console.log(`  NO   ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  }
}

async function repoFinto(file: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wesion-prova-'));
  for (const [relativo, contenuto] of Object.entries(file)) {
    const assoluto = path.join(dir, relativo);
    await mkdir(path.dirname(assoluto), { recursive: true });
    await writeFile(assoluto, contenuto, 'utf8');
  }
  return dir;
}

const daButtare: string[] = [];
async function apri(file: Record<string, string>): Promise<string> {
  const dir = await repoFinto(file);
  daButtare.push(dir);
  return dir;
}

// Il vero llms.txt della Fenice, accorciato: quello che la PR #3 ha coperto.
const LLMS_BUONO = `# Trattoria La Fenice

Trattoria di cucina tradizionale pavese a Carbonara al Ticino, alle porte di Pavia.

## Pagine principali
- [Home](https://www.trattorialafenice.it/): trattoria a Carbonara al Ticino
- [Menu](https://www.trattorialafenice.it/menu): i piatti della cucina pavese

## Per chi cerca
- Ristoranti in provincia di Pavia / trattorie nel pavese.
`;

const LLMS_PIATTO = `https://www.trattorialafenice.it/ - Homepage
https://www.trattorialafenice.it/menu - Menu completo
`;

// ── 1. Il file statico si trova dov'è, non dove ci fa comodo ────────────────
console.log('\nDove sta llms.txt');
{
  const astro = await apri({ 'public/llms.txt': LLMS_BUONO });
  const m = await leggiMateriale(astro);
  verifica('Astro: lo trova in public/', m.llmsTxt === LLMS_BUONO, `letto: ${JSON.stringify(m.llmsTxt)?.slice(0, 60)}`);
  verifica('e dice il percorso vero, non la radice', m.llmsPercorso === 'public/llms.txt', `${m.llmsPercorso}`);
}
{
  const hugo = await apri({ 'static/llms.txt': LLMS_BUONO, 'static/robots.txt': 'User-agent: *\n' });
  const m = await leggiMateriale(hugo);
  verifica('Hugo/SvelteKit: lo trova in static/', m.llmsPercorso === 'static/llms.txt', `${m.llmsPercorso}`);
  verifica('e robots.txt insieme a lui', m.robotsPercorso === 'static/robots.txt', `${m.robotsPercorso}`);
}
{
  const radice = await apri({ 'llms.txt': LLMS_BUONO });
  const m = await leggiMateriale(radice);
  verifica('nella radice funziona ancora', m.llmsPercorso === 'llms.txt', `${m.llmsPercorso}`);
}
{
  const doppio = await apri({ 'public/llms.txt': LLMS_BUONO, 'llms.txt': 'vecchio, non servito online\n' });
  const m = await leggiMateriale(doppio);
  verifica(
    'se ci sono tutti e due, vince quello servito online',
    m.llmsPercorso === 'public/llms.txt' && m.llmsTxt === LLMS_BUONO
  );
}
{
  const spoglio = await apri({ 'README.md': '# niente\n' });
  const m = await leggiMateriale(spoglio);
  verifica("se davvero non c'è, lo dice", m.llmsTxt === null && m.llmsPercorso === null);
}

// ── 2. Un file riscrivibile che esiste non può uscirne più povero ───────────
console.log('\nRiscrivere llms.txt senza perderci');
{
  const dir = await apri({ 'public/llms.txt': LLMS_BUONO });
  const piu_povero: ModificaProposta = {
    percorso: 'public/llms.txt',
    motivo: 'riscritto',
    azione: 'scrivi',
    contenuto_nuovo: LLMS_PIATTO,
  };
  const { applicate, scartati } = await applicaModifiche(dir, [piu_povero]);
  verifica('la riscrittura più corta non passa', applicate.length === 0);
  verifica('e lo scarto dice quanto si perdeva', scartati.length === 1 && scartati[0].includes('più corta'), scartati[0]);

  const dopo = await leggiMateriale(dir);
  verifica('il file buono è ancora lì, intatto', dopo.llmsTxt === LLMS_BUONO);
}
{
  const dir = await apri({ 'public/llms.txt': LLMS_BUONO });
  const piu_ricco: ModificaProposta = {
    percorso: 'public/llms.txt',
    motivo: 'aggiunta la sezione orari',
    azione: 'scrivi',
    contenuto_nuovo: `${LLMS_BUONO}\n## Orari\n- Chiuso il lunedì.\n`,
  };
  const { applicate, scartati } = await applicaModifiche(dir, [piu_ricco]);
  verifica('una che AGGIUNGE passa', applicate.length === 1 && scartati.length === 0, scartati.join(' · '));

  const dopo = await leggiMateriale(dir);
  verifica("e quello che c'era prima è tutto ancora dentro", dopo.llmsTxt?.includes('## Per chi cerca') === true);
}
{
  const dir = await apri({ 'README.md': '# niente\n' });
  const nuovo: ModificaProposta = {
    percorso: 'public/llms.txt',
    motivo: 'non esisteva',
    azione: 'scrivi',
    contenuto_nuovo: LLMS_PIATTO,
  };
  const { applicate } = await applicaModifiche(dir, [nuovo]);
  verifica("un file che non c'era si crea comunque, corto quanto vuole", applicate.length === 1);
}

// ── 3. Le difese di prima non si sono rotte per strada ──────────────────────
console.log('\nQuello che difendevamo già');
{
  const dir = await apri({ 'src/layouts/Layout.astro': '---\nconst graph = [];\n---\n<html></html>\n' });
  const rigenera: ModificaProposta = {
    percorso: 'src/layouts/Layout.astro',
    motivo: 'schema migliorato',
    azione: 'scrivi',
    contenuto_nuovo: '<html>rigenerato a memoria, molto più lungo di prima ma senza niente di quello che c era</html>\n',
  };
  const { applicate, scartati } = await applicaModifiche(dir, [rigenera]);
  verifica('un file NON riscrivibile non si riscrive — è la PR #1', applicate.length === 0);
  verifica('e non basta essere più lunghi per passare', scartati[0]?.includes('sostituzione mirata') === true, scartati[0]);
}
{
  const dir = await apri({ 'public/llms.txt': LLMS_BUONO });
  const fuori: ModificaProposta = {
    percorso: '../fuori.txt',
    motivo: 'niente',
    azione: 'scrivi',
    contenuto_nuovo: 'x'.repeat(5000),
  };
  const { applicate, scartati } = await applicaModifiche(dir, [fuori]);
  verifica('fuori dal repo non si scrive', applicate.length === 0 && scartati[0].includes('fuori dal repo'));
}

// ── 3bis. Il caso Fenice: llms.txt non è un file, è una rotta ───────────────
// Il danno peggiore della giornata, e l'unico finito online: un public/llms.txt
// creato accanto a src/pages/llms.txt.ts vince sulla rotta, e il generatore —
// che rilegge il blog dal database — smette di servire a qualcosa senza dare
// un solo errore.
console.log('\nQuando llms.txt è codice, non un file');
const GENERATORE = `import { leggiArticoli } from '../lib/blog';
export async function GET() {
  const articoli = await leggiArticoli();
  return new Response('# Trattoria La Fenice\\n' + articoli.length);
}
`;
{
  const dir = await apri({ 'src/pages/llms.txt.ts': GENERATORE });
  const m = await leggiMateriale(dir);
  verifica('il generatore viene trovato', m.llmsGeneratore?.percorso === 'src/pages/llms.txt.ts', `${m.llmsGeneratore?.percorso}`);
  verifica('e col suo codice dentro', m.llmsGeneratore?.contenuto === GENERATORE);
  verifica('il file statico giustamente non esiste', m.llmsTxt === null && m.llmsPercorso === null);
}
{
  const dir = await apri({ 'src/pages/llms.txt.ts': GENERATORE });
  const statico: ModificaProposta = {
    percorso: 'public/llms.txt',
    motivo: 'non esisteva, serve ai crawler AI',
    azione: 'scrivi',
    contenuto_nuovo: '# Trattoria La Fenice\n\nUn elenco piatto di URL.\n',
  };
  const { applicate, scartati } = await applicaModifiche(dir, [statico]);
  verifica('creare il file statico viene RIFIUTATO', applicate.length === 0);
  verifica(
    'e lo scarto dice dove sta il generatore',
    scartati[0]?.includes('src/pages/llms.txt.ts') === true,
    scartati[0]
  );
}
{
  // La controprova: senza generatore, crearlo resta la cosa giusta.
  const dir = await apri({ 'README.md': '# niente\n' });
  const statico: ModificaProposta = {
    percorso: 'public/llms.txt',
    motivo: 'non esisteva',
    azione: 'scrivi',
    contenuto_nuovo: LLMS_PIATTO,
  };
  const { applicate } = await applicaModifiche(dir, [statico]);
  verifica('senza generatore invece si crea, come prima', applicate.length === 1);
}
{
  const dir = await apri({ 'src/routes/robots.txt.js': 'export function GET() {}\n' });
  const m = await leggiMateriale(dir);
  verifica('vale anche per robots.txt, e per SvelteKit', m.robotsGeneratore?.percorso === 'src/routes/robots.txt.js', `${m.robotsGeneratore?.percorso}`);
}

// ── 4. Su quale repo stiamo per agire ───────────────────────────────────────
// `pezziPR` decide owner/repo/numero di ogni chiamata a GitHub, `chiudiPR`
// compresa — che chiude una PR e cancella un ramo. Una svista qui non dà
// errore: agisce sul repo sbagliato di un cliente sbagliato.
console.log('\nDa un indirizzo di PR ai pezzi giusti');
{
  const p = pezziPR('https://github.com/brisamarstudio/trattorialafenice/pull/3');
  verifica(
    'owner, repo e numero',
    p?.owner === 'brisamarstudio' && p?.repo === 'trattorialafenice' && p?.numero === 3,
    JSON.stringify(p)
  );
}
{
  const p = pezziPR('https://github.com/brisamarstudio/trattorialafenice/pull/12/files#diff-abc');
  verifica('regge la coda che il browser aggiunge', p?.numero === 12, JSON.stringify(p));
}
verifica('un indirizzo che non è una PR non passa', pezziPR('https://github.com/tizio/repo') === null);
verifica('e nemmeno una stringa a caso', pezziPR('boh') === null);

for (const dir of daButtare) await rm(dir, { recursive: true, force: true });

console.log(falliti ? `\n${falliti} prove fallite.` : '\nTutto a posto.');
process.exit(falliti ? 1 : 0);
