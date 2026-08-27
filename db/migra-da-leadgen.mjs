/**
 * Migrazione leadgen.* -> wesion.*  (stesso database, schema diverso).
 *
 * Idempotente: si puo' rilanciare senza duplicare niente. Serve perche' la prima
 * volta qualcosa esce storto quasi sempre, e rilanciare deve essere gratis.
 *
 * NON cancella niente da leadgen: se qualcosa non torna, la verita' e' ancora li'.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Stessa logica di prospector.js: e' gia' stata sbagliata una volta, non la
 * reinvento. '+' davanti = e' gia' internazionale; '00' = prefisso di uscita;
 * un numero che inizia per 0 o 3 senza prefisso e' italiano.
 */
function normalizzaTelefono(raw) {
  const s = String(raw || '').trim();
  let cifre = s.replace(/\D/g, '');
  if (!cifre) return null;
  if (s.startsWith('+')) return cifre;
  if (cifre.startsWith('00')) return cifre.slice(2);
  if (!cifre.startsWith('39') && /^[03]/.test(cifre)) cifre = '39' + cifre;
  return cifre;
}

/** Il Place ID vive in coda al maps_url come query_place_id=ChIJ... */
function estraiPlaceId(mapsUrl) {
  const m = String(mapsUrl || '').match(/[?&]query_place_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function normalizzaSito(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./, '');
  } catch {
    return s.toLowerCase();
  }
}

/** slug leggibile e stabile: e' quello che finira' negli URL della dashboard. */
function creaSlug(nome, citta) {
  const pulisci = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return [pulisci(nome), pulisci(citta)].filter(Boolean).join('-').slice(0, 80) || 'azienda';
}

/**
 * Le due pipeline non coincidevano: sette stati di qua, sette di la', con nomi
 * diversi e confini diversi. Questa e' la traduzione, scritta una volta sola.
 */
const STATO = {
  nuovo: 'prospect',
  contattato: 'contattato',
  risposto: 'contattato',
  demo_fissata: 'in_trattativa',
  attivo: 'cliente',
  non_interessato: 'perso',
  spam: 'archiviato',
};

const client = await pool.connect();
const conta = { campagne: 0, aziende: 0, contatti: 0, audit: 0, saltate: 0 };
const slugVisti = new Set();

try {
  await client.query('BEGIN');

  // ---- campagne ----
  const { rows: campagne } = await client.query(
    `SELECT id, name, category, cities, apify_run_id, created_at FROM leadgen.campaigns ORDER BY id`
  );
  const mappaCampagne = new Map();
  for (const c of campagne) {
    const { rows } = await client.query(
      `INSERT INTO wesion.campagna (nome, categoria, citta, apify_run_id, creata_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (nome) DO UPDATE SET categoria = EXCLUDED.categoria
       RETURNING id`,
      [c.name, c.category, c.cities, c.apify_run_id, c.created_at]
    );
    mappaCampagne.set(c.id, rows[0].id);
    conta.campagne++;
  }

  // ---- aziende + contatti + audit ----
  const { rows: leads } = await client.query(`SELECT * FROM leadgen.leads ORDER BY id`);

  for (const l of leads) {
    const placeId = estraiPlaceId(l.google_maps_url);

    // slug unico anche fra omonimi nella stessa citta'
    let slug = creaSlug(l.name, l.city);
    if (slugVisti.has(slug)) slug = `${slug}-${l.id}`;
    slugVisti.add(slug);

    // Senza place_id non possiamo dedurre l'identita': si riconosce dallo slug.
    const conflitto = placeId ? 'place_id' : 'slug';
    const { rows: az } = await client.query(
      `INSERT INTO wesion.azienda
         (slug, nome, place_id, categoria, indirizzo, cap, citta, provincia, regione,
          paese, lat, lon, maps_url, stato, campagna_id, fonte, raw_json, note, creata_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (${conflitto}) DO UPDATE SET
         nome = EXCLUDED.nome,
         categoria = COALESCE(EXCLUDED.categoria, wesion.azienda.categoria),
         aggiornata_at = now()
       RETURNING id`,
      [
        slug,
        l.name,
        placeId,
        l.category,
        l.address,
        l.cap,
        l.city,
        l.province,
        l.region,
        l.country || 'IT',
        l.lat,
        l.lon,
        l.google_maps_url,
        STATO[l.status_pipeline] || 'prospect',
        mappaCampagne.get(l.campaign_id) ?? null,
        l.source || 'apify_gmaps',
        l.raw_json,
        l.notes,
        l.created_at,
      ]
    );
    const aziendaId = az[0].id;
    conta.aziende++;

    // ---- contatti: ogni modo di raggiungerla diventa una riga ----
    const contatti = [
      ['telefono', l.phone, normalizzaTelefono(l.phone)],
      ['email', l.email, String(l.email || '').trim().toLowerCase() || null],
      ['sito', l.website, normalizzaSito(l.website)],
      ['facebook', l.facebook_url, normalizzaSito(l.facebook_url)],
      ['instagram', l.instagram_url, normalizzaSito(l.instagram_url)],
    ];
    for (const [tipo, valore, normalizzato] of contatti) {
      if (!valore || !normalizzato) continue;
      const { rowCount } = await client.query(
        `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (azienda_id, tipo, normalizzato) DO NOTHING`,
        [aziendaId, tipo, String(valore).trim(), normalizzato]
      );
      conta.contatti += rowCount;
    }

    // ---- audit gia' fatti: diventano la prima riga dello storico ----
    if (l.ai_score !== null && l.ai_score !== undefined) {
      const { rows: gia } = await client.query(
        `SELECT 1 FROM wesion.audit WHERE azienda_id = $1 AND note IS NOT DISTINCT FROM $2 LIMIT 1`,
        [aziendaId, l.ai_audit_notes]
      );
      if (!gia.length) {
        await client.query(
          `INSERT INTO wesion.audit
             (azienda_id, eseguito_at, modello, sito_letto, score, note, hook, esito)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'ok')`,
          [
            aziendaId,
            l.updated_at || l.created_at,
            'migrato-da-leadgen',
            l.website,
            l.ai_score,
            l.ai_audit_notes,
            l.ai_custom_hook,
          ]
        );
        conta.audit++;
      }
    }
  }

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Migrazione annullata, niente è stato scritto:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
}

console.log('Migrazione completata:');
console.log(`  campagne  ${conta.campagne}`);
console.log(`  aziende   ${conta.aziende}`);
console.log(`  contatti  ${conta.contatti}`);
console.log(`  audit     ${conta.audit}`);
await pool.end();
