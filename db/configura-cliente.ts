/**
 * Preparare un'azienda perché il router possa lavorarci.
 *
 * Servono tre cose, e mancarne una vuol dire un bot che tace o che pubblica
 * nel vuoto:
 *
 *   1. lo STATO dell'azienda a 'cliente' (le spie dei silenzi guardano solo i
 *      clienti: un prospect che non riceve post non è un guasto, è un prospect);
 *   2. il CONTATTO del titolare con `e_titolare = true` — senza, il router
 *      risponde "numero non abilitato", apposta;
 *   3. i SERVIZI attivi con la loro configurazione: senza `site_menu_url` il
 *      menù non va da nessuna parte, senza gli id di Google il post nemmeno.
 *
 * ⚠️ IL MOTIVO PER CUI QUESTO FILE È .ts E NON .mjs. Importa
 * `normalizzaTelefono` dalla stessa libreria che usa il router. Se lo script
 * normalizzasse il numero anche solo un po' diversamente — uno zero in più, il
 * prefisso trattato in un altro modo — scriverebbe in tabella una stringa che
 * il router non ritrova mai, e il sintomo sarebbe "il bot non mi risponde" su
 * un cliente configurato benissimo. È lo stesso genere di divergenza silenziosa
 * che ha reso necessario tutto questo progetto.
 *
 * Uso:
 *   npm run cliente -- --mostra
 *   npm run cliente -- --azienda trattoria-la-fenice-pavia --mostra
 *   npm run cliente -- --azienda trattoria-la-fenice-pavia \
 *       --titolare "+39 333 1234567" --cliente \
 *       --sito-url https://lafenice.it/api/menu --sito-segreto SEGRETO \
 *       --sito-pagina https://lafenice.it/menu \
 *       --gbp-account 123456789 --gbp-scheda 987654321
 */

import { pool, query } from '../src/lib/db.ts';
import { normalizzaTelefono } from '../src/lib/normalizza.ts';

// ── Gli argomenti ───────────────────────────────────────────────────────────

function argomenti(): Record<string, string | boolean> {
  const fuori: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const nome = a.slice(2);
    const prossimo = argv[i + 1];
    if (!prossimo || prossimo.startsWith('--')) {
      fuori[nome] = true;
    } else {
      fuori[nome] = prossimo;
      i++;
    }
  }
  return fuori;
}

const arg = argomenti();
const testo = (n: string): string | null => (typeof arg[n] === 'string' ? (arg[n] as string).trim() : null);

// ── Cosa c'è adesso ─────────────────────────────────────────────────────────

async function mostra(dove?: string): Promise<void> {
  const aziende = await query<{
    id: number;
    slug: string;
    nome: string;
    stato: string;
    titolari: string | null;
    servizi: string | null;
  }>(
    `SELECT a.id, a.slug, a.nome, a.stato,
            (SELECT string_agg(c.valore || ' [' || c.tipo || ']', ', ')
               FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.e_titolare)                AS titolari,
            (SELECT string_agg(s.tipo || (CASE WHEN s.attivo THEN '' ELSE ' (spento)' END), ', ')
               FROM wesion.servizio s WHERE s.azienda_id = a.id)         AS servizi
       FROM wesion.azienda a
      WHERE ($1::text IS NULL OR a.slug = $1 OR a.id::text = $1)
        AND ($1::text IS NOT NULL OR a.stato = 'cliente'
             OR EXISTS (SELECT 1 FROM wesion.servizio s WHERE s.azienda_id = a.id))
      ORDER BY a.nome`,
    [dove ?? null]
  );

  if (!aziende.length) {
    console.log(
      dove
        ? `Nessuna azienda con slug o id "${dove}".`
        : 'Nessuna azienda è ancora configurata come cliente. Il router non ha niente da fare.'
    );
    return;
  }

  for (const a of aziende) {
    console.log(`\n${a.nome}  (slug: ${a.slug}, id: ${a.id})`);
    console.log(`  stato:    ${a.stato}${a.stato === 'cliente' ? '' : "  ← le spie dei silenzi lo ignorano finché non è 'cliente'"}`);
    console.log(`  titolari: ${a.titolari ?? 'NESSUNO ← il router non accetterà comandi da nessuno'}`);
    console.log(`  servizi:  ${a.servizi ?? 'nessuno ← non c\'è niente da pubblicare'}`);
  }
  console.log('');
}

// ── Le verifiche che valgono la pena ────────────────────────────────────────

/**
 * ⚠️ Gli id di Google devono essere numerici.
 *
 * Il 21/07/2026 una copia dimenticata di una funzione leggeva il pezzo
 * sbagliato dell'URL e scriveva in tabella frammenti di stringa o `undefined`.
 * Un id sbagliato non dà fastidio a nessuno finché non si pubblica, e allora
 * Google risponde 404 settimane dopo, su un cliente a caso. Meglio rifiutarlo
 * qui, dove c'è ancora qualcuno che guarda.
 */
function verificaIdGoogle(nome: string, valore: string): void {
  if (!/^[0-9]+$/.test(valore)) {
    throw new Error(
      `${nome} deve essere numerico, invece è "${valore}". ` +
        'Si rileggono da Google (elencaSchede in src/lib/gbp.ts), non si deducono a mano.'
    );
  }
}

// ── Il lavoro ───────────────────────────────────────────────────────────────

async function configura(): Promise<void> {
  const dove = testo('azienda');
  if (!dove) throw new Error('serve --azienda <slug|id>');

  const [azienda] = await query<{ id: number; nome: string; stato: string }>(
    `SELECT id, nome, stato FROM wesion.azienda WHERE slug = $1 OR id::text = $1`,
    [dove]
  );
  if (!azienda) throw new Error(`nessuna azienda con slug o id "${dove}"`);

  console.log(`\n${azienda.nome} (id ${azienda.id})`);

  // ── stato ────────────────────────────────────────────────────────────────
  if (arg.cliente && azienda.stato !== 'cliente') {
    await query(`UPDATE wesion.azienda SET stato = 'cliente', aggiornata_at = now() WHERE id = $1`, [azienda.id]);
    console.log(`  stato: ${azienda.stato} → cliente`);
  }

  // ── il titolare ──────────────────────────────────────────────────────────
  const titolare = testo('titolare');
  if (titolare) {
    const normalizzato = normalizzaTelefono(titolare);
    if (!normalizzato) throw new Error(`"${titolare}" non sembra un numero di telefono`);

    /**
     * Si scrive come contatto 'whatsapp' e non 'telefono' apposta: il numero
     * scrapato da Google Maps è già lì come 'telefono' con e_titolare=false, ed
     * è un'altra cosa — quello è il centralino, questo è il permesso di
     * pubblicare. Tenerli distinti fa sì che togliere il permesso non cancelli
     * il recapito.
     */
    await query(
      `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato, e_titolare, note)
       VALUES ($1, 'whatsapp', $2, $3, true, 'abilitato a pubblicare')
       ON CONFLICT (azienda_id, tipo, normalizzato)
         DO UPDATE SET e_titolare = true, valore = EXCLUDED.valore`,
      [azienda.id, titolare, normalizzato]
    );
    console.log(`  titolare: ${titolare} → in tabella come "${normalizzato}"`);
    console.log(`            (è questa stringa che il router confronta: se non torna, il bot tace)`);
  }

  // ── il menù del giorno ───────────────────────────────────────────────────
  const sitoUrl = testo('sito-url');
  if (sitoUrl) {
    const config: Record<string, string> = { site_menu_url: sitoUrl };
    const segreto = testo('sito-segreto');
    const pagina = testo('sito-pagina');
    if (segreto) config.site_secret = segreto;
    if (pagina) config.site_menu_page = pagina;

    if (!segreto) {
      console.warn('  ⚠️  nessun --sito-segreto: il sito rifiuterà la richiesta se ne pretende uno');
    }

    await query(
      `INSERT INTO wesion.servizio (azienda_id, tipo, attivo, config)
       VALUES ($1, 'menu_del_giorno', true, $2)
       ON CONFLICT (azienda_id, tipo)
         DO UPDATE SET attivo = true, config = wesion.servizio.config || EXCLUDED.config`,
      [azienda.id, JSON.stringify(config)]
    );
    console.log(`  menù del giorno: attivo → ${sitoUrl}`);
  }

  // ── la scheda Google ─────────────────────────────────────────────────────
  const account = testo('gbp-account');
  const scheda = testo('gbp-scheda');
  if (account || scheda) {
    if (!account || !scheda) throw new Error('--gbp-account e --gbp-scheda vanno insieme: uno solo non serve a niente');
    verificaIdGoogle('--gbp-account', account);
    verificaIdGoogle('--gbp-scheda', scheda);

    await query(
      `INSERT INTO wesion.servizio (azienda_id, tipo, attivo, config)
       VALUES ($1, 'post_gbp', true, $2)
       ON CONFLICT (azienda_id, tipo)
         DO UPDATE SET attivo = true, config = wesion.servizio.config || EXCLUDED.config`,
      [azienda.id, JSON.stringify({ gbp_account_id: account, gbp_location_id: scheda })]
    );
    console.log(`  scheda Google: attiva → account ${account}, scheda ${scheda}`);
  }

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'cliente_configurato', 'configura-cliente', $2)`,
    [azienda.id, JSON.stringify({ argomenti: Object.keys(arg) })]
  );

  // ── e adesso il router cosa vede? ────────────────────────────────────────
  console.log('\nCome lo vede il router adesso:');
  await mostra(String(azienda.id));

  const [pronto] = await query<{ titolari: number; servizi: number; stato: string }>(
    `SELECT a.stato,
            (SELECT count(*) FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.e_titolare)::int AS titolari,
            (SELECT count(*) FROM wesion.servizio s WHERE s.azienda_id = a.id AND s.attivo)::int     AS servizi
       FROM wesion.azienda a WHERE a.id = $1`,
    [azienda.id]
  );

  const mancanze: string[] = [];
  if (pronto.stato !== 'cliente') mancanze.push("lo stato non è 'cliente' (--cliente)");
  if (pronto.titolari === 0) mancanze.push('nessun titolare abilitato (--titolare)');
  if (pronto.servizi === 0) mancanze.push('nessun servizio attivo (--sito-url o --gbp-account/--gbp-scheda)');

  if (mancanze.length) {
    console.log('⚠️  Non è ancora pronto:');
    for (const m of mancanze) console.log(`   - ${m}`);
  } else {
    console.log('✓ Pronto: il router accetterà una foto del menù da questo titolare.');
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────────────────────

try {
  if (arg.mostra && !arg.azienda) await mostra();
  else if (arg.mostra) await mostra(testo('azienda')!);
  else await configura();
} catch (errore: unknown) {
  console.error(`\nErrore: ${errore instanceof Error ? errore.message : errore}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
