/**
 * La prova del parser delle proposte SEO — quello che legge la risposta del
 * modello e decide QUALI FILE SCRIVERE su una copia del repo di un cliente.
 *
 *   npm run prova:seo
 *
 * ⚠️ Non è un test di cortesia. Qui dentro passa testo scritto da un modello
 * che diventa una scrittura su disco e una Pull Request sul repo di un cliente
 * vero. Ogni caso qui sotto è un danno già visto o evitato per un pelo: la PR
 * #1 su `trattorialafenice` (02/09/2026) riscriveva `Layout.astro` per intero
 * e cancellava schema, accessibilità e il cambio lingua — con l'ultimo caso di
 * questa prova non sarebbe mai partita.
 *
 * Import con estensione .ts: lo esegue Node con --experimental-strip-types,
 * non Next (stessa regola di `router/`).
 */
import { leggiProposta, MARCA, riscrivibileIntero } from '../src/lib/seo-proposta.ts';

let falliti = 0;

function verifica(nome: string, condizione: boolean, dettaglio = '') {
  if (condizione) {
    console.log(`  ok   ${nome}`);
  } else {
    falliti++;
    console.log(`  NO   ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  }
}

// ── 1. File nuovo, scritto per intero ───────────────────────────────────────
const nuovo = [
  `${MARCA.riepilogo}: Aggiunto llms.txt.`,
  '',
  `${MARCA.file}: public/llms.txt`,
  `${MARCA.motivo}: non esisteva`,
  MARCA.scrivi,
  '# Trattoria La Fenice',
  '',
  '- [Menù](https://www.trattorialafenice.it/menu): il menù del giorno',
  MARCA.fine,
].join('\n');

const a = leggiProposta(nuovo);
console.log('File nuovo');
verifica('una modifica', a.modifiche.length === 1, `trovate ${a.modifiche.length}`);
verifica('azione scrivi', a.modifiche[0]?.azione === 'scrivi');
verifica('percorso', a.modifiche[0]?.percorso === 'public/llms.txt', a.modifiche[0]?.percorso);
verifica('motivo', a.modifiche[0]?.motivo === 'non esisteva');
verifica(
  'contenuto intero, righe vuote comprese',
  a.modifiche[0]?.contenuto_nuovo ===
    '# Trattoria La Fenice\n\n- [Menù](https://www.trattorialafenice.it/menu): il menù del giorno'
);
verifica('niente scartati', a.scartati.length === 0, a.scartati.join(' | '));

// ── 2. Sostituzione mirata su un file che esiste ────────────────────────────
const mirata = [
  `${MARCA.riepilogo}: Aggiunto containedInPlace.`,
  '',
  `${MARCA.file}: src/layouts/Layout.astro`,
  `${MARCA.motivo}: manca containedInPlace`,
  MARCA.cerca,
  '    "latitude": 45.1396,',
  '    "longitude": 9.0624',
  '  },',
  MARCA.con,
  '    "latitude": 45.1396,',
  '    "longitude": 9.0624',
  '  },',
  '  "containedInPlace": { "@type": "Place", "name": "Carbonara al Ticino" },',
  MARCA.fine,
].join('\n');

const b = leggiProposta(mirata);
console.log('\nSostituzione mirata');
verifica('una modifica', b.modifiche.length === 1, `trovate ${b.modifiche.length}`);
verifica('azione sostituisci', b.modifiche[0]?.azione === 'sostituisci');
verifica('indentazione conservata nel CERCA', b.modifiche[0]?.cerca?.startsWith('    "latitude"') === true);
verifica('il CON contiene l’aggiunta', b.modifiche[0]?.con?.includes('containedInPlace') === true);

// ── 3. I percorsi che scriverebbero fuori dal repo ──────────────────────────
const cattivi = ['/etc/passwd', '../../.ssh/authorized_keys', 'C:/Windows/x.txt', '.git/config']
  .map((p) => [`${MARCA.file}: ${p}`, MARCA.scrivi, 'roba', MARCA.fine].join('\n'))
  .join('\n\n');

const c = leggiProposta(cattivi);
console.log('\nPercorsi fuori dal repo');
verifica('nessuno passa', c.modifiche.length === 0, `passati: ${c.modifiche.map((m) => m.percorso).join(', ')}`);
verifica('e lo dice, uno per uno', c.scartati.length === 4, `${c.scartati.length} scarti`);

// ── 4. Il blocco monco non deve rubare il contenuto del successivo ──────────
//    È il difetto che fa più danno: il file giusto scritto sotto il percorso
//    sbagliato, senza un errore da nessuna parte.
const monco = [
  `${MARCA.file}: public/rotto.txt`,
  `${MARCA.motivo}: qui il modello si è dimenticato l’apertura`,
  '',
  `${MARCA.file}: public/buono.txt`,
  MARCA.scrivi,
  'io sono il file buono',
  MARCA.fine,
].join('\n');

const d = leggiProposta(monco);
console.log('\nBlocco monco');
verifica('una sola modifica', d.modifiche.length === 1, `trovate ${d.modifiche.length}`);
verifica('ed è quella buona', d.modifiche[0]?.percorso === 'public/buono.txt', d.modifiche[0]?.percorso);
verifica('col contenuto giusto', d.modifiche[0]?.contenuto_nuovo === 'io sono il file buono');
verifica('il monco è segnalato, non ignorato', d.scartati.some((x) => x.startsWith('public/rotto.txt')));

// ── 5. Niente da proporre, detto bene / fuori formato ───────────────────────
const vuoto = leggiProposta(`${MARCA.riepilogo}: Il sito è già a posto.`);
const fuoriFormato = leggiProposta('Certo! Ecco le modifiche: {"modifiche": []}');
console.log('\nNiente da proporre, e fuori formato');
verifica('vuoto: zero modifiche ma un riepilogo c’è', vuoto.modifiche.length === 0 && vuoto.riepilogo.length > 0);
verifica(
  'fuori formato: zero e zero, così il route lo distingue',
  fuoriFormato.modifiche.length === 0 && fuoriFormato.riepilogo === ''
);

// ── 6. Quali file si possono riscrivere per intero ──────────────────────────
console.log('\nRiscrivibili per intero');
verifica('llms.txt sì', riscrivibileIntero('public/llms.txt'));
verifica('robots.txt sì', riscrivibileIntero('robots.txt'));
verifica('Layout.astro NO — è il caso della PR #1', !riscrivibileIntero('src/layouts/Layout.astro'));
verifica('index.html NO', !riscrivibileIntero('src/pages/index.html'));

console.log(falliti === 0 ? '\nTutto a posto.' : `\n${falliti} verifiche fallite.`);
process.exit(falliti === 0 ? 0 : 1);
