/**
 * La prova del parser delle proposte SEO — quello che legge la risposta del
 * modello e decide QUALI FILE SCRIVERE su una copia del repo di un cliente.
 *
 *   npm run prova:seo
 *
 * ⚠️ Non è un test di cortesia: qui dentro passa testo scritto da un modello
 * che diventa una scrittura su disco e una Pull Request sul repo di un
 * cliente vero. I casi sotto sono quelli che romperebbero in silenzio — un
 * blocco senza INIZIO che si mangia il file successivo, un percorso che esce
 * dal repo, l'indentazione persa.
 *
 * Import con estensione .ts: lo esegue Node con --experimental-strip-types,
 * non Next (stessa regola di `router/`).
 */
import { leggiProposta, MARCA } from '../src/lib/seo-proposta.ts';

let falliti = 0;

function verifica(nome: string, condizione: boolean, dettaglio = '') {
  if (condizione) {
    console.log(`  ok   ${nome}`);
  } else {
    falliti++;
    console.log(`  NO   ${nome}${dettaglio ? ` — ${dettaglio}` : ''}`);
  }
}

// ── 1. Il caso normale ──────────────────────────────────────────────────────
const normale = [
  `${MARCA.riepilogo}: Aggiunto llms.txt e sistemata la policy bot AI.`,
  '',
  `${MARCA.file}: public/llms.txt`,
  `${MARCA.motivo}: non esisteva`,
  MARCA.inizio,
  '# Trattoria La Fenice',
  '',
  '- [Menù](https://www.trattorialafenice.it/menu): il menù del giorno',
  MARCA.fine,
  '',
  `${MARCA.file}: public/robots.txt`,
  `${MARCA.motivo}: mancavano Claude-SearchBot e Claude-User`,
  MARCA.inizio,
  'User-agent: GPTBot',
  'Disallow: /',
  MARCA.fine,
].join('\n');

const a = leggiProposta(normale);
console.log('Caso normale');
verifica('due file', a.modifiche.length === 2, `trovati ${a.modifiche.length}`);
verifica('il riepilogo c’è', a.riepilogo.startsWith('Aggiunto llms.txt'));
verifica('primo percorso', a.modifiche[0]?.percorso === 'public/llms.txt', a.modifiche[0]?.percorso);
verifica('primo motivo', a.modifiche[0]?.motivo === 'non esisteva', a.modifiche[0]?.motivo);
verifica(
  'contenuto intero, righe vuote comprese',
  a.modifiche[0]?.contenuto_nuovo ===
    '# Trattoria La Fenice\n\n- [Menù](https://www.trattorialafenice.it/menu): il menù del giorno'
);
verifica(
  'secondo file',
  a.modifiche[1]?.contenuto_nuovo === 'User-agent: GPTBot\nDisallow: /',
  JSON.stringify(a.modifiche[1]?.contenuto_nuovo)
);

// ── 2. L'indentazione, che `ripulisci` avrebbe appiattito ───────────────────
const indentato = [
  `${MARCA.file}: src/layouts/Layout.astro`,
  MARCA.inizio,
  '<script type="application/ld+json">',
  '  {',
  '    "@context": "https://schema.org",',
  '        "@type": "Restaurant"',
  '  }',
  '</script>',
  MARCA.fine,
].join('\n');

const b = leggiProposta(indentato);
console.log('\nIndentazione');
verifica('due spazi conservati', b.modifiche[0]?.contenuto_nuovo.includes('\n  {'));
verifica('otto spazi conservati', b.modifiche[0]?.contenuto_nuovo.includes('\n        "@type"'));
verifica('niente motivo, e non è un errore', b.modifiche[0]?.motivo === '');

// ── 3. I percorsi che scriverebbero fuori dal repo ──────────────────────────
const cattivi = ['/etc/passwd', '../../.ssh/authorized_keys', 'C:/Windows/system32/x.txt']
  .map((p) => [`${MARCA.file}: ${p}`, MARCA.inizio, 'roba', MARCA.fine].join('\n'))
  .join('\n\n');

const c = leggiProposta(cattivi);
console.log('\nPercorsi fuori dal repo');
verifica('scartati tutti e tre', c.modifiche.length === 0, `passati: ${c.modifiche.map((m) => m.percorso).join(', ')}`);

// ── 4. Il blocco monco: manca l'INIZIO ──────────────────────────────────────
//    Senza la regex giusta questo si mangia il file successivo e lo scrive
//    sotto il percorso sbagliato. È il caso che fa più danno di tutti.
const monco = [
  `${MARCA.file}: public/rotto.txt`,
  `${MARCA.motivo}: qui il modello si è dimenticato l’INIZIO`,
  '',
  `${MARCA.file}: public/buono.txt`,
  MARCA.inizio,
  'io sono il file buono',
  MARCA.fine,
].join('\n');

const d = leggiProposta(monco);
console.log('\nBlocco monco (manca INIZIO)');
verifica('un solo file', d.modifiche.length === 1, `trovati ${d.modifiche.length}`);
verifica('ed è quello buono', d.modifiche[0]?.percorso === 'public/buono.txt', d.modifiche[0]?.percorso);
verifica('col contenuto giusto', d.modifiche[0]?.contenuto_nuovo === 'io sono il file buono');

// ── 5. Niente da proporre, detto bene ───────────────────────────────────────
const vuoto = `${MARCA.riepilogo}: Il sito è già a posto, non propongo niente.`;
const e = leggiProposta(vuoto);
console.log('\nNiente da proporre');
verifica('zero modifiche', e.modifiche.length === 0);
verifica('ma il riepilogo c’è (non è un fuori formato)', e.riepilogo.length > 0);

// ── 6. Fuori formato: il route deve poterlo distinguere dal caso 5 ──────────
const fuoriFormato = leggiProposta('Certo! Ecco le modifiche che proporrei: {"modifiche": []}');
console.log('\nFuori formato');
verifica('zero modifiche', fuoriFormato.modifiche.length === 0);
verifica('e zero riepilogo', fuoriFormato.riepilogo === '');

console.log(falliti === 0 ? '\nTutto a posto.' : `\n${falliti} verifiche fallite.`);
process.exit(falliti === 0 ? 0 : 1);
