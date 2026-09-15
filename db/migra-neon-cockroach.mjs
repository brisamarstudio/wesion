/**
 * Migrazione Wesion: Neon (leadgen-italia, recuperato il 15/09/2026) -> CockroachDB (defaultdb).
 *
 *   NEON_URL=... COCKROACH_URL=... node db/migra-neon-cockroach.mjs --prova   -> fa tutto e ANNULLA
 *   NEON_URL=... COCKROACH_URL=... node db/migra-neon-cockroach.mjs           -> fa davvero
 *
 * Perche' esiste: il 14/09 Wesion e' ripartito su Cockroach QUASI VUOTO (13 aziende
 * reimportate da GBP, nessuna bozza, voce, fatto, servizio blog) e con id da
 * unique_rowid() — numeri da 19 cifre che il codice (`Number(id)`, parser INT8 in
 * src/lib/db.ts) tronca: "Non sono riuscito a leggere l'anagrafica".
 *
 * Cosa fa, in UNA transazione:
 *  1. svuota lo schema wesion su Cockroach (il contenuto e' salvato in
 *     _BACKUP-DB/wesion-neon-2026-09-15/cockroach_wesion_prima_della_migrazione.json)
 *  2. copia tutte le tabelle di Neon con gli ID ORIGINALI (piccoli)
 *  3. unisce quello che era nato solo su Cockroach (aziende nuove da GBP, servizi
 *     post_gbp, contatti, messaggi, utente, spia) con id nuovi piccoli
 * Poi, fuori transazione: una sequenza per ogni tabella, che riparte dopo il massimo,
 * come default della colonna id. Da li' in avanti anche le righe nuove hanno id piccoli.
 */
import postgres from 'postgres';
import fs from 'node:fs';

const PROVA = process.argv.includes('--prova');
const BACKUP = 'E:/Progetti MyWebby e siti clienti/_BACKUP-DB/wesion-neon-2026-09-15/cockroach_wesion_prima_della_migrazione.json';

if (!process.env.NEON_URL || !process.env.COCKROACH_URL) {
  console.error('Servono NEON_URL e COCKROACH_URL');
  process.exit(1);
}
const neon = postgres(process.env.NEON_URL, { fetch_types: false, max: 1 });
const crdb = postgres(process.env.COCKROACH_URL, { fetch_types: false, max: 1 });
const cu = new URL(process.env.COCKROACH_URL);
console.log(`Neon: ${new URL(process.env.NEON_URL).host}  ->  Cockroach: ${cu.host}${cu.pathname}${PROVA ? '   (PROVA: alla fine si annulla)' : ''}`);
if (!cu.host.includes('cockroachlabs.cloud') || cu.pathname !== '/defaultdb') {
  console.error('COCKROACH_URL non e\' il defaultdb del cluster: mi fermo.');
  process.exit(1);
}

// Ordine delle dipendenze (chiavi esterne): i genitori prima.
const ORDINE = ['campagna', 'azienda', 'contatto', 'voce', 'fatto', 'audit', 'servizio', 'sito',
  'snapshot', 'bozza', 'pubblicazione', 'messaggio', 'evento', 'utente', 'spia'];

// Tipi delle colonne su Cockroach: ogni valore viaggia come testo e si ricasta li'.
const tipi = {};
for (const r of await crdb`SELECT table_name t, column_name c, crdb_sql_type ty
                            FROM information_schema.columns WHERE table_schema = 'wesion'
                            ORDER BY table_name, ordinal_position`) {
  (tipi[r.t] ??= []).push({ c: r.c, ty: r.ty });
}
const colonneNeon = {};
for (const r of await neon`SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = 'wesion'`) {
  (colonneNeon[r.t] ??= new Set()).add(r.c);
}
const TABELLE_TUTTE = Object.keys(tipi);
const mancanti = TABELLE_TUTTE.filter((t) => !ORDINE.includes(t));
if (mancanti.length) { console.error('Tabelle non in ORDINE:', mancanti); process.exit(1); }

const q = (s) => '"' + s.replace(/"/g, '""') + '"';

/** Inserisce righe (valori gia' testo o null) con cast esplicito al tipo di Cockroach. */
async function inserisci(tx, t, righe, { conflitto = '' } = {}) {
  let n = 0;
  for (const r of righe) {
    const cols = tipi[t].filter((x) => x.c in r);
    const sqlTxt = `INSERT INTO wesion.${q(t)} (${cols.map((x) => q(x.c)).join(', ')})
                    VALUES (${cols.map((x, i) => `$${i + 1}::${x.ty}`).join(', ')}) ${conflitto}`;
    const res = await tx.unsafe(sqlTxt, cols.map((x) => r[x.c]));
    n += res.count;
  }
  return n;
}

/** Legge una tabella di Neon con ogni colonna come testo (niente conversioni JS sui BIGINT). */
async function leggiNeon(t) {
  const cols = tipi[t].filter((x) => colonneNeon[t]?.has(x.c));
  return neon.unsafe(`SELECT ${cols.map((x) => `${q(x.c)}::text AS ${q(x.c)}`).join(', ')} FROM wesion.${q(t)}`);
}

/** Le righe del backup JSON di Cockroach, rese testo come quelle di Neon. */
const comeTesto = (v) => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
const bk = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
const riga = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, comeTesto(v)]));

// Lo stato di Cockroach deve essere ancora quello del backup: se nel frattempo e'
// entrato qualcosa di nuovo (dashboard o router), non lo si butta via senza saperlo.
for (const t of TABELLE_TUTTE) {
  const [{ n }] = await crdb.unsafe(`SELECT count(*)::int AS n FROM wesion.${q(t)}`);
  // ::int su Cockroach e' INT8: arriva come testo, da qui il Number().
  if (Number(n) !== (bk[t]?.length ?? 0)) {
    console.error(`Cockroach e' cambiato dopo il backup: ${t} ha ${n} righe, il backup ${bk[t]?.length ?? 0}. Rifare il backup.`);
    process.exit(1);
  }
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
// Abbinamenti verificati a mano il 15/09 (nome/slug diversi tra i due database).
const ABBINATI_A_MANO = { 'Trattoria “La Fenice” Rizziello': '51', MyWebby: '82' };

const riepilogo = {};
class Annulla extends Error {}

try {
  await crdb.begin(async (tx) => {
    // 1. svuota, figli prima
    for (const t of [...ORDINE].reverse()) await tx.unsafe(`DELETE FROM wesion.${q(t)}`);

    // 2. Neon con gli id originali
    for (const t of ORDINE) {
      const righe = await leggiNeon(t);
      riepilogo[t] = { neon: await inserisci(tx, t, righe) };
    }

    const massimo = async (t) => BigInt((await tx.unsafe(`SELECT coalesce(max(id), 0)::text AS m FROM wesion.${q(t)}`))[0].m);
    const prossimo = {};
    for (const t of ['azienda', 'contatto', 'servizio', 'messaggio', 'utente']) prossimo[t] = (await massimo(t)) + 1n;
    const nuovoId = (t) => String(prossimo[t]++);

    // 3a. aziende: abbinate -> id Neon; nuove -> id piccolo nuovo
    const aziendeNeon = await tx`SELECT id::text AS id, nome, place_id FROM wesion.azienda`;
    const mappaAzienda = {};
    let aziendeNuove = 0, aziendeAbbinate = 0;
    for (const a of bk.azienda.map(riga)) {
      const m = aziendeNeon.find((x) => (a.place_id && x.place_id === a.place_id)) ??
        aziendeNeon.find((x) => x.id === ABBINATI_A_MANO[a.nome]) ??
        aziendeNeon.find((x) => norm(x.nome) === norm(a.nome));
      if (m) {
        mappaAzienda[a.id] = m.id;
        await tx`UPDATE wesion.azienda SET place_id = coalesce(place_id, ${a.place_id}), stato = ${a.stato},
                   aggiornata_at = now() WHERE id::text = ${m.id}`;
        aziendeAbbinate++;
      } else {
        const id = nuovoId('azienda');
        mappaAzienda[a.id] = id;
        await inserisci(tx, 'azienda', [{ ...a, id, campagna_id: null }]);
        aziendeNuove++;
      }
    }
    riepilogo.azienda.cockroach = `${aziendeNuove} nuove, ${aziendeAbbinate} abbinate`;

    // 3b. servizi: unione delle config (Neon || Cockroach)
    let servizi = 0;
    for (const s of bk.servizio.map(riga)) {
      const az = mappaAzienda[s.azienda_id];
      const [esiste] = await tx`SELECT id::text AS id FROM wesion.servizio WHERE azienda_id::text = ${az} AND tipo = ${s.tipo}`;
      if (esiste) {
        await tx.unsafe(`UPDATE wesion.servizio SET config = config || $1::JSONB, attivo = attivo OR $2::BOOL WHERE id::text = $3`,
          [s.config, s.attivo, esiste.id]);
      } else {
        await inserisci(tx, 'servizio', [{ ...s, id: nuovoId('servizio'), azienda_id: az }]);
      }
      servizi++;
    }
    riepilogo.servizio.cockroach = servizi;

    // 3c. contatti senza doppioni
    let contatti = 0;
    const mappaContatto = {};
    for (const c of bk.contatto.map(riga)) {
      const az = mappaAzienda[c.azienda_id];
      const [esiste] = await tx`SELECT id::text AS id FROM wesion.contatto
                                 WHERE azienda_id::text = ${az} AND tipo = ${c.tipo} AND normalizzato = ${c.normalizzato}`;
      if (esiste) { mappaContatto[c.id] = esiste.id; continue; }
      const id = nuovoId('contatto');
      mappaContatto[c.id] = id;
      contatti += await inserisci(tx, 'contatto', [{ ...c, id, azienda_id: az }]);
    }
    riepilogo.contatto.cockroach = contatti;

    // 3d. messaggi, utente, spia
    riepilogo.messaggio.cockroach = await inserisci(tx, 'messaggio', bk.messaggio.map(riga).map((m) => ({
      ...m, id: nuovoId('messaggio'),
      azienda_id: m.azienda_id ? mappaAzienda[m.azienda_id] : null,
      contatto_id: m.contatto_id ? mappaContatto[m.contatto_id] ?? null : null,
    })));
    riepilogo.utente.cockroach = await inserisci(tx, 'utente',
      bk.utente.map(riga).map((u) => ({ ...u, id: nuovoId('utente') })), { conflitto: 'ON CONFLICT (email) DO NOTHING' });
    let spie = 0;
    for (const s of bk.spia.map(riga)) {
      await tx`DELETE FROM wesion.spia WHERE chiave = ${s.chiave}`;
      spie += await inserisci(tx, 'spia', [s]);
    }
    riepilogo.spia.cockroach = spie;

    // verifica: nessun id enorme rimasto
    for (const t of ORDINE.filter((t) => tipi[t].some((x) => x.c === 'id'))) {
      const [{ n }] = await tx.unsafe(`SELECT count(*)::int AS n FROM wesion.${q(t)} WHERE id > 9007199254740991`);
      if (Number(n)) throw new Error(`${t}: ${n} id oltre MAX_SAFE_INTEGER`);
    }
    for (const t of ORDINE) {
      const [{ n }] = await tx.unsafe(`SELECT count(*)::int AS n FROM wesion.${q(t)}`);
      riepilogo[t].finale = Number(n);
    }
    console.table(riepilogo);
    if (PROVA) throw new Annulla();
  });
} catch (e) {
  if (!(e instanceof Annulla)) throw e;
  console.log('PROVA: transazione annullata, Cockroach non e\' stato toccato.');
  await neon.end(); await crdb.end();
  process.exit(0);
}

// 4. sequenze (DDL, fuori dalla transazione)
for (const t of ORDINE.filter((t) => tipi[t].some((x) => x.c === 'id'))) {
  const [{ m }] = await crdb.unsafe(`SELECT coalesce(max(id), 0)::text AS m FROM wesion.${q(t)}`);
  const seq = `wesion.${t}_id_seq`;
  await crdb.unsafe(`CREATE SEQUENCE IF NOT EXISTS ${seq} START ${BigInt(m) + 1n}`);
  await crdb.unsafe(`SELECT setval('${seq}', ${BigInt(m) + 1n}, false)`);
  await crdb.unsafe(`ALTER TABLE wesion.${q(t)} ALTER COLUMN id SET DEFAULT nextval('${seq}')`);
  console.log(`sequenza ${seq}: prossimo id ${BigInt(m) + 1n}`);
}
console.log('Migrazione completata.');
await neon.end(); await crdb.end();
