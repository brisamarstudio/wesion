/**
 * Il router di Wesion — quello che parla davvero con i ristoratori.
 *
 * DOVE GIRA E PERCHE' LI'. Sull'host dei container WAHA, in ascolto su
 * `172.17.0.1` (l'interfaccia docker0): raggiungibile dai container sulla stessa
 * macchina, mai da internet. Non e' una limitazione da aggirare, e' la difesa —
 * ed e' il motivo per cui la dashboard su Contabo non ci chiama: ci scrive in
 * tabella, e noi leggiamo (vedi `giroPubblicazioni` in `pubblica.ts`).
 *
 * Un Worker Cloudflare parla solo HTTP: non apre socket, non tiene una sessione
 * WhatsApp viva, non scarica un file da un container. Ogni volta che serve
 * un altro protocollo la risposta e' sempre la stessa — un endpoint HTTP su una
 * macchina che quel protocollo lo parla davvero. Questa e' quella macchina.
 *
 * COSA NON FA PIU' RISPETTO AL VECCHIO. Non ha una dashboard dentro (la fa
 * Wesion), non ha le rotte di gestione clienti (idem), non serve pagine HTML di
 * siti di prova. Fa tre cose: ascolta WhatsApp, crea bozze, pubblica quello che
 * qualcuno ha approvato.
 */

import http from 'node:http';
import { query } from '../src/lib/db.ts';
import { leggiMenu } from '../src/lib/ocr.ts';
import { mandaTesto, scaricaMedia, caricaPubblico } from '../src/lib/waha.ts';
import { ripristinaMenu, type ConfigSito } from '../src/lib/sito.ts';
import { riconosci, candidati, type Mittente } from './riconosci.ts';
import { cercaLead, gestisciLead } from './lead.ts';
import { pubblicaBozza, giroPubblicazioni } from './pubblica.ts';

const PORTA = Number(process.env.ROUTER_PORT || process.env.PORT || 3010);
const HOST = process.env.ROUTER_HOST || process.env.HOST || '172.17.0.1';
const SEGRETO = process.env.ROUTER_SECRET || '';

/** Oltre questo tempo un "SI" non pubblica più: non deve uscire il menù di ieri. */
const MINUTI_VALIDITA = Number(process.env.DRAFT_TTL_MINUTES || 15);

/** Più di tanti piatti non è un menù del giorno: è la foto sbagliata. */
const MAX_PIATTI = Number(process.env.MAX_ITEMS || 12);

/** Ogni quanto si va a vedere se la dashboard ha approvato qualcosa. */
const SECONDI_GIRO = Number(process.env.SECONDI_GIRO || 30);

// ─────────────────────────────────────────────────────────────────────────────

const CONFERMA = /^(si|s[iì]|ok|confermo|pubblica)$/i;
const ANNULLA = /^(no|annulla|cancella)$/i;
const RIPRISTINA = /^(ripristina|indietro)$/i;

/**
 * Risponde al titolare e lo scrive nello storico.
 *
 * Le due cose stanno insieme apposta: un messaggio mandato e non registrato
 * rende impossibile rispondere a "cosa gli avete detto?", che e' la prima
 * domanda quando qualcosa va storto.
 */
async function rispondi(a: Mittente, testo: string): Promise<void> {
  const partito = await mandaTesto(a.telefono, testo);
  await query(
    `INSERT INTO wesion.messaggio (azienda_id, contatto_id, direzione, canale, autore, testo, payload)
     VALUES ($1, $2, 'out', 'whatsapp', 'bot', $3, $4)`,
    [a.aziendaId, a.contattoId, testo, JSON.stringify({ destinatario: a.telefono, consegnato: partito })]
  );
  if (!partito) {
    console.error(`[router] risposta NON consegnata a ${a.telefono} (${a.nome})`);
  }
}

/** I servizi attivi del cliente, per sapere cosa può fare. */
async function servizi(aziendaId: number): Promise<Record<string, Record<string, unknown>>> {
  const righe = await query<{ tipo: string; config: Record<string, unknown> }>(
    `SELECT tipo, config FROM wesion.servizio WHERE azienda_id = $1 AND attivo`,
    [aziendaId]
  );
  return Object.fromEntries(righe.map((r) => [r.tipo, r.config]));
}

function elencaPiatti(piatti: Array<{ name: string; price?: string }>): string {
  return piatti
    .map((p) => `- ${p.name}${p.price ? ` (${String(p.price).trim()})` : ''}`)
    .join('\n');
}

/** L'URL del media dentro un payload di WAHA, che cambia posto a ogni motore. */
function urlMedia(payload: Record<string, unknown>): string | null {
  const dati = (payload._data ?? {}) as Record<string, unknown>;
  const media = (payload.media ?? {}) as Record<string, unknown>;
  const url =
    payload.mediaUrl ?? media.url ?? payload.url ?? dati.mediaUrl ?? dati.directPath ?? null;
  if (url) return String(url);
  // Ultima spiaggia: WAHA serve il file per id del messaggio.
  if (payload.id) return `${process.env.WAHA_BASE || 'http://127.0.0.1:3006'}/api/files/${payload.id}`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

async function menuInAttesa(aziendaId: number) {
  const [riga] = await query<{ id: number; contenuto: Record<string, unknown>; scaduta: boolean }>(
    `SELECT id, contenuto, (scade_at IS NOT NULL AND scade_at <= now()) AS scaduta
       FROM wesion.bozza
      WHERE azienda_id = $1 AND tipo = 'menu'
        AND stato IN ('generata', 'attesa_approvazione')
      ORDER BY creata_at DESC LIMIT 1`,
    [aziendaId]
  );
  return riga ?? null;
}

/** ── SI: approva e pubblica ────────────────────────────────────────────── */
async function conferma(a: Mittente): Promise<string> {
  const bozza = await menuInAttesa(a.aziendaId);
  if (!bozza) {
    await rispondi(a, 'Non ho nessuna bozza in attesa. Mandami prima la foto del menù del giorno.');
    return 'nessuna_bozza';
  }

  if (bozza.scaduta) {
    await query(`UPDATE wesion.bozza SET stato = 'scaduta' WHERE id = $1`, [bozza.id]);
    await rispondi(
      a,
      `Quella bozza è di più di ${MINUTI_VALIDITA} minuti fa ed è scaduta. Rimandami il menù, così non pubblichiamo quello sbagliato.`
    );
    return 'scaduta';
  }

  const piatti = (bozza.contenuto.items as unknown[]) ?? [];
  if (!Array.isArray(piatti) || piatti.length === 0) {
    await rispondi(a, "Nella bozza non c'è nessun piatto leggibile: non pubblico niente.");
    return 'vuota';
  }

  /**
   * L'approvazione si scrive PRIMA di pubblicare.
   *
   * Se il processo muore fra le due cose, resta una riga `approvata` che il
   * giro riprende da solo. Nell'ordine inverso resterebbe un menù pubblicato
   * che in tabella risulta ancora in attesa — cioe' un cliente che ha il menù
   * giusto sul sito e una spia accesa che dice il contrario.
   */
  await query(
    `UPDATE wesion.bozza
        SET stato = 'approvata', approvata_da = $2, approvata_via = 'whatsapp', approvata_at = now()
      WHERE id = $1`,
    [bozza.id, a.telefono]
  );

  const esito = await pubblicaBozza(bozza.id);

  const righe = esito.destinazioni.map((d) => {
    // "scheda Google", mai "Google Maps": i ristoratori capiscono che il menù
    // finisce sulla mappa e si aspettano una cosa che non succede.
    const nome = d.destinazione === 'gbp' ? 'Scheda Google' : d.destinazione === 'sito' ? 'Sito' : d.destinazione;
    return `${nome}: ${d.esito === 'ok' ? 'aggiornato' : 'NON aggiornato'}`;
  });

  const tutteOk = esito.destinazioni.every((d) => d.esito === 'ok');
  const sitoOk = esito.destinazioni.some((d) => d.destinazione === 'sito' && d.esito === 'ok');

  await rispondi(
    a,
    `${tutteOk ? 'MENÙ PUBBLICATO' : esito.uscito ? 'PUBBLICAZIONE PARZIALE' : 'NON SONO RIUSCITO A PUBBLICARE'}\n\n` +
      righe.join('\n') +
      (sitoOk ? '\n\nSe qualcosa non va, rispondi RIPRISTINA.' : '') +
      (esito.uscito ? '' : '\n\nCe ne stiamo occupando noi, non serve che rifaccia niente.')
  );

  return esito.uscito ? 'pubblicato' : 'pubblicazione_fallita';
}

/** ── NO ───────────────────────────────────────────────────────────────── */
async function annulla(a: Mittente): Promise<string> {
  const bozza = await menuInAttesa(a.aziendaId);
  if (!bozza) {
    await rispondi(a, 'Non c\'era niente in attesa: non ho annullato niente.');
    return 'nessuna_bozza';
  }
  await query(`UPDATE wesion.bozza SET stato = 'rifiutata' WHERE id = $1`, [bozza.id]);
  await rispondi(a, 'Bozza annullata, non ho pubblicato niente.');
  return 'annullata';
}

/** ── RIPRISTINA ───────────────────────────────────────────────────────── */
async function ripristina(a: Mittente): Promise<string> {
  const config = (await servizi(a.aziendaId))['menu_del_giorno'] as ConfigSito | undefined;
  if (!config?.site_menu_url) {
    await rispondi(a, 'Non ho un sito collegato su cui ripristinare il menù.');
    return 'senza_sito';
  }
  try {
    const esito = await ripristinaMenu(config);
    await rispondi(
      a,
      esito.ripristinato
        ? "Fatto: sul sito è tornato il menù precedente.\n\nIl post già uscito su Google va tolto a mano dalla scheda."
        : 'Non ho un menù precedente da ripristinare.'
    );
    await query(
      `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'menu_ripristinato', 'router', $2)`,
      [a.aziendaId, JSON.stringify({ ripristinato: esito.ripristinato })]
    );
    return 'ripristinato';
  } catch (errore: unknown) {
    console.error('[router] ripristino:', errore instanceof Error ? errore.message : errore);
    await rispondi(a, 'Non sono riuscito a ripristinare il menù. Riprova fra poco.');
    return 'ripristino_fallito';
  }
}

/** ── Un menù nuovo ────────────────────────────────────────────────────── */
async function nuovoMenu(a: Mittente, testo: string, payload: Record<string, unknown>): Promise<string> {
  await rispondi(a, 'Sto leggendo il menù, un attimo...');

  let immagineDataUrl: string | null = null;
  let foto: string | null = null;

  const url = urlMedia(payload);
  if (url) {
    try {
      const { dati, mime } = await scaricaMedia(url);
      immagineDataUrl = `data:${mime};base64,${dati.toString('base64')}`;
      foto = await caricaPubblico(dati, mime);
    } catch (errore: unknown) {
      console.error('[router] media non scaricato:', errore instanceof Error ? errore.message : errore);
    }
  }

  let letto;
  try {
    letto = await leggiMenu({ nomeLocale: a.nome, testo, immagineDataUrl });
  } catch (errore: unknown) {
    console.error('[router] ocr:', errore instanceof Error ? errore.message : errore);
    await rispondi(a, 'Non sono riuscito a leggere il menù (il servizio non risponde). Riprova fra poco.');
    return 'ocr_fallito';
  }

  if (letto.items.length === 0) {
    await rispondi(
      a,
      'Non ho letto nessun piatto. Riprova con una foto più nitida e dritta, oppure scrivimi i piatti a mano.'
    );
    return 'niente_letto';
  }

  if (letto.items.length > MAX_PIATTI) {
    await rispondi(
      a,
      `Ho letto ${letto.items.length} piatti: troppi per un menù del giorno, temo sia la foto sbagliata. Non pubblico niente.`
    );
    return 'troppi_piatti';
  }

  /**
   * Una bozza nuova ne scavalca una vecchia ancora in attesa.
   *
   * Se il titolare rimanda la foto e' perche' la prima non gli andava bene:
   * lasciarne due aperte vuol dire che un "SI" pubblica quella sbagliata.
   */
  await query(
    `UPDATE wesion.bozza SET stato = 'rifiutata'
      WHERE azienda_id = $1 AND tipo = 'menu' AND stato IN ('generata', 'attesa_approvazione')`,
    [a.aziendaId]
  );

  await query(
    `INSERT INTO wesion.bozza (azienda_id, tipo, origine, contenuto, stato, modello, scade_at)
     VALUES ($1, 'menu', 'foto_whatsapp', $2, 'attesa_approvazione', $3, now() + ($4 || ' minutes')::interval)`,
    [
      a.aziendaId,
      JSON.stringify({ summary: letto.summary, items: letto.items, foto, testo_originale: testo }),
      letto.modello,
      String(MINUTI_VALIDITA),
    ]
  );

  await rispondi(
    a,
    `MENÙ DEL GIORNO RILEVATO (${letto.items.length} piatti):\n\n${elencaPiatti(letto.items)}\n\n` +
      `Se confermi lo pubblico sul tuo sito e sulla tua scheda Google.\n\n` +
      `Sulla scheda Google uscirà così:\n"${letto.summary}"\n\n` +
      `Rispondi SI per pubblicare, NO per annullare. La bozza vale ${MINUTI_VALIDITA} minuti.`
  );
  return 'bozza_creata';
}

// ─────────────────────────────────────────────────────────────────────────────

async function gestisciMessaggio(payload: Record<string, unknown>): Promise<string> {
  if (payload.fromMe) return 'ignorato_mio';

  const testo = String(payload.body || payload.caption || '').trim();
  const esito = await riconosci(payload);

  // ── Non è un titolare ────────────────────────────────────────────────────
  if (!esito.mittente) {
    const identificativi = candidati(payload);

    if (esito.motivo === 'non_titolare') {
      // Sappiamo di chi è il numero, ma non è autorizzato a pubblicare. Va
      // detto e va registrato, o si passa un pomeriggio a chiedersi perché il
      // bot non risponde a un numero che in tabella c'è.
      console.warn(
        `[router] ${esito.identificativo} è di ${esito.aziendaNonTitolare} ma non è segnato come titolare`
      );
      await mandaTesto(
        esito.identificativo,
        `Questo numero risulta collegato a ${esito.aziendaNonTitolare}, ma non è ancora abilitato a pubblicare. Scrivici e lo attiviamo.`
      );
      return 'non_titolare';
    }

    const lead = await cercaLead(identificativi);
    if (lead) return gestisciLead(lead, testo, null);

    /**
     * Uno sconosciuto vero. Si REGISTRA lo stesso, con `azienda_id` nullo: un
     * messaggio da un mittente che non riconosciamo e' un dato, non uno scarto.
     * Quasi sempre e' un titolare che scrive da un secondo numero, cioe' un
     * cliente vero a cui il bot sta tacendo. La spia `messaggi-orfani` legge
     * proprio queste righe.
     */
    await query(
      `INSERT INTO wesion.messaggio (azienda_id, direzione, canale, autore, testo, payload)
       VALUES (NULL, 'in', 'whatsapp', 'azienda', $1, $2)`,
      [testo || null, JSON.stringify({ mittente: esito.identificativo, candidati: identificativi })]
    );
    console.log(`[router] mittente sconosciuto: ${esito.identificativo}`);
    return 'sconosciuto';
  }

  const a = esito.mittente;

  await query(
    `INSERT INTO wesion.messaggio (azienda_id, contatto_id, direzione, canale, autore, testo, payload)
     VALUES ($1, $2, 'in', 'whatsapp', 'azienda', $3, $4)`,
    [a.aziendaId, a.contattoId, testo || null, JSON.stringify({ mittente: a.telefono })]
  );

  if (RIPRISTINA.test(testo)) return ripristina(a);
  if (CONFERMA.test(testo)) return conferma(a);
  if (ANNULLA.test(testo)) return annulla(a);

  const conFoto = Boolean(payload.hasMedia || urlMedia(payload));

  // Un messaggio corto senza foto è chiacchiera, non un menù: inutile spendere
  // una chiamata all'AI per farsi restituire un'anteprima su niente.
  if (!conFoto && testo.length < 15) {
    await rispondi(
      a,
      `Per aggiornare il menù di ${a.nome} mandami la foto della lavagna, oppure scrivi i piatti.\n\n` +
        `Comandi: SI pubblica, NO annulla, RIPRISTINA rimette il menù precedente.`
    );
    return 'aiuto';
  }

  return nuovoMenu(a, testo, payload);
}

// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer((richiesta, risposta) => {
  const rispondiJson = (codice: number, corpo: unknown) => {
    risposta.writeHead(codice, { 'Content-Type': 'application/json' });
    risposta.end(JSON.stringify(corpo));
  };

  // /health resta aperto: serve a sapere se il processo è vivo, e non dice
  // niente che un vicino di rete non possa già dedurre dal fatto che risponde.
  if (richiesta.method === 'GET' && richiesta.url?.startsWith('/health')) {
    return rispondiJson(200, { ok: true, servizio: 'wesion-router' });
  }

  if (richiesta.method !== 'POST' || !richiesta.url?.startsWith('/webhook')) {
    return rispondiJson(404, { errore: 'non_trovato' });
  }

  if (SEGRETO && richiesta.headers['x-router-secret'] !== SEGRETO) {
    return rispondiJson(401, { errore: 'vietato' });
  }

  let grezzo = '';
  richiesta.on('data', (pezzo) => {
    grezzo += pezzo;
    // Una foto arriva come URL, non come corpo: oltre questa soglia non è un
    // messaggio, è qualcuno che sta provando a riempirci la memoria.
    if (grezzo.length > 2_000_000) richiesta.destroy();
  });

  richiesta.on('end', async () => {
    let corpo: Record<string, unknown>;
    try {
      corpo = JSON.parse(grezzo || '{}');
    } catch {
      return rispondiJson(400, { errore: 'json_illeggibile' });
    }

    // WAHA manda anche eventi diversi da "message": qui interessa solo quello.
    const evento = corpo.event || 'message';
    if (evento !== 'message') return rispondiJson(200, { stato: 'evento_ignorato', evento });

    try {
      const stato = await gestisciMessaggio((corpo.payload as Record<string, unknown>) || corpo);
      return rispondiJson(200, { stato });
    } catch (errore: unknown) {
      console.error('[router] errore non gestito:', errore);
      return rispondiJson(500, { errore: errore instanceof Error ? errore.message : String(errore) });
    }
  });
});

/**
 * Il giro non parte in parallelo con se stesso.
 *
 * Con `setInterval` secco, un giro lento (Google che ci mette venti secondi a
 * rispondere) verrebbe scavalcato dal successivo e la stessa bozza partirebbe
 * due volte. Si riarma solo quando il precedente ha finito.
 */
let giroInCorso = false;
async function avviaGiro(): Promise<void> {
  if (giroInCorso) return;
  giroInCorso = true;
  try {
    const esiti = await giroPubblicazioni();
    for (const e of esiti) {
      console.log(`[router] bozza ${e.bozzaId}: ${e.uscito ? 'pubblicata' : 'NON pubblicata'}`);
    }
  } catch (errore: unknown) {
    console.error('[router] giro fallito:', errore instanceof Error ? errore.message : errore);
  } finally {
    giroInCorso = false;
  }
}

server.listen(PORTA, HOST, () => {
  console.log(`[router] Wesion in ascolto su http://${HOST}:${PORTA}`);
  console.log(`[router] giro delle approvazioni ogni ${SECONDI_GIRO}s`);
  setInterval(avviaGiro, SECONDI_GIRO * 1000);
  void avviaGiro();
});
