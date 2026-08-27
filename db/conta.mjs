/**
 * Confronto leadgen -> wesion, riga per riga.
 *
 * Non "controlla che funzioni": CONFRONTA I NUMERI. Un ripristino che sembra
 * giusto e ha perso qualcosa e' peggio di uno fallito, perche' non te ne accorgi.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const uno = async (sql) => (await pool.query(sql)).rows[0].n;

const confronti = [
  ['campagne', `SELECT COUNT(*)::int n FROM leadgen.campaigns`, `SELECT COUNT(*)::int n FROM wesion.campagna`],
  ['aziende / lead', `SELECT COUNT(*)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.azienda`],
  ['telefoni', `SELECT COUNT(phone)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.contatto WHERE tipo='telefono'`],
  ['siti', `SELECT COUNT(website)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.contatto WHERE tipo='sito'`],
  ['facebook', `SELECT COUNT(facebook_url)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.contatto WHERE tipo='facebook'`],
  ['instagram', `SELECT COUNT(instagram_url)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.contatto WHERE tipo='instagram'`],
  ['email', `SELECT COUNT(email)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.contatto WHERE tipo='email'`],
  ['audit', `SELECT COUNT(ai_score)::int n FROM leadgen.leads`, `SELECT COUNT(*)::int n FROM wesion.audit`],
];

console.log('');
console.log('  cosa                 leadgen   wesion');
console.log('  ' + '-'.repeat(38));

let tutteUguali = true;
for (const [nome, sqlVecchio, sqlNuovo] of confronti) {
  const [v, n] = [await uno(sqlVecchio), await uno(sqlNuovo)];
  const ok = v === n;
  if (!ok) tutteUguali = false;
  console.log(
    `  ${nome.padEnd(20)} ${String(v).padStart(6)}   ${String(n).padStart(6)}   ${ok ? 'ok' : '<-- DIVERSO'}`
  );
}

// Il place_id e' la chiave su cui abbiamo scommesso: se ne mancano, si vede qui.
const senzaPlaceId = await uno(
  `SELECT COUNT(*)::int n FROM wesion.azienda WHERE place_id IS NULL`
);
const duplicati = await uno(
  `SELECT COUNT(*)::int n FROM (
     SELECT place_id FROM wesion.azienda WHERE place_id IS NOT NULL
     GROUP BY place_id HAVING COUNT(*) > 1) d`
);

console.log('');
console.log(`  aziende senza place_id: ${senzaPlaceId}`);
console.log(`  place_id duplicati:     ${duplicati}`);
console.log('');
console.log(tutteUguali && duplicati === 0 ? '  I numeri tornano.' : '  ATTENZIONE: qualcosa non torna.');
console.log('');

await pool.end();
