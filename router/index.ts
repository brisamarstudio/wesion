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
import { ripristinaMenu, type ConfigSito, type SezioneMenu } from '../src/lib/sito.ts';
import { riconosci, candidati, eGruppo, type Mittente } from './riconosci.ts';
import { controllaImpianto } from './impianto.ts';
import { cercaLead, gestisciLead } from './lead.ts';
import { pubblicaBozza, attendiEsito, giroPubblicazioni, giroVerifiche } from './pubblica.ts';

const PORTA = Number(process.env.ROUTER_PORT || process.env.PORT || 3010);
const HOST = process.env.ROUTER_HOST || process.env.HOST || '172.17.0.1';

/**
 * ⚠️ SENZA SEGRETO NON SI PARTE, E LA GUARDIA STA QUI (01/09/2026).
 *
 * Prima era solo nel `docker-compose.yml` (`${ROUTER_SECRET:?}`), cioe' in UNO
 * dei modi di avviare questo processo. Lanciandolo con `npm run router` — che
 * e' come l'abbiamo provato in locale — partiva senza segreto e senza dire
 * niente: il controllo piu' sotto e' scritto `if (SEGRETO && ...)`, quindi con
 * il segreto vuoto non scattava mai e `/webhook` accettava qualunque
 * richiesta. Un buco che non fa rumore e' il tipo di guasto che questo
 * progetto esiste per non avere: la regola vale ovunque si avvii il programma,
 * quindi vive nel programma.
 */
const SEGRETO = process.env.ROUTER_SECRET || '';
if (!SEGRETO) {
  console.error(
    '[router] ROUTER_SECRET non impostata: mi fermo.\n' +
      '         Senza, /webhook accetterebbe richieste da chiunque raggiunga la porta.\n' +
      "         In sviluppo basta una stringa qualsiasi: ROUTER_SECRET=prova npm run router"
  );
  process.exit(1);
}

/** Oltre questo tempo un "SI" non pubblica più: non deve uscire il menù di ieri. */
const MINUTI_VALIDITA = Number(process.env.DRAFT_TTL_MINUTES || 15);

/** Più di tanti piatti non è un menù del giorno: è la foto sbagliata. */
const MAX_PIATTI = Number(process.env.MAX_ITEMS || 12);

/** Ogni quanto si va a vedere se la dashboard ha approvato qualcosa. */
const SECONDI_GIRO = Number(process.env.SECONDI_GIRO || 30);

/** Ogni quanto si richiede a Google com'e' finita davvero. Vedi `avviaVerifiche`. */
const MINUTI_VERIFICA = Number(process.env.MINUTI_VERIFICA || 30);

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

/**
 * Le sezioni di menù di questo cliente, se ne ha più di una.
 *
 * ⚠️ ⚠️ IL CONTRATTO NE PREVEDEVA UNA SOLA, E PER MESI E' BASTATA (fino al
 * 05/09/2026). Poi il primo cliente vero: La Fenice ha quattro menù — fisso
 * del giorno, venerdì a cena, sabato a cena, domenica a pranzo — e li fotografa
 * tutti. Senza sezione, un «Sabato a Cena» finiva nella Pausa Pranzo E
 * cancellava quello di mezzogiorno: una foto giusta, due menù sbagliati.
 *
 * Chi ne ha una sola (un'hamburgeria, una pizzeria) non ha niente configurato
 * qui e non vede cambiare niente.
 */
function sezioniDi(attivi: Record<string, Record<string, unknown>>): SezioneMenu[] {
  const config = attivi['menu_del_giorno'] as ConfigSito | undefined;
  const sezioni = config?.menu_sezioni;
  return Array.isArray(sezioni) ? sezioni.filter((s) => s?.slug && s?.titolo) : [];
}

/** Come si chiama una sezione parlando col titolare: il titolo, mai lo slug. */
function titoloSezione(sezioni: SezioneMenu[], slug: string | null | undefined): string | null {
  if (!slug) return null;
  return sezioni.find((s) => s.slug === slug)?.titolo ?? null;
}

/**
 * La domanda numerata: si fa SOLO quando il modello non ha saputo dire da sé
 * in quale menù va (vedi `leggiMenu`). Numerata e non «scrivi quale», perché
 * rispondere «2» non si sbaglia e non si scrive male.
 */
function domandaSezione(sezioni: SezioneMenu[]): string {
  return (
    'In quale menù lo metto?\n' +
    sezioni.map((s, i) => `${i + 1} ${s.titolo}`).join('\n') +
    '\n\nRispondi col numero.'
  );
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
   * ⚠️ UN «SI» NON BASTA SE NON SAPPIAMO DOVE.
   *
   * Il titolare puo' rispondere SI alla domanda «in quale menu' lo metto?» —
   * succedera', e' la risposta piu' naturale del mondo a un bot. Pubblicare
   * allora vorrebbe dire scegliere noi una sezione a caso: e la sezione
   * sbagliata non e' un errore innocuo, sovrascrive ANCHE il menu' vero di
   * quella sezione (il sito fa `replace`).
   */
  const sezioniBozza = (bozza.contenuto.sezioni ?? []) as SezioneMenu[];
  if (Array.isArray(sezioniBozza) && sezioniBozza.length > 1 && !bozza.contenuto.sezione) {
    await rispondi(a, `Prima devo sapere in quale menù va.\n\n${domandaSezione(sezioniBozza)}`);
    return 'sezione_mancante';
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

  let esito = await pubblicaBozza(bozza.id);

  /**
   * La bozza era gia' presa: l'ha presa il giro dei 30 secondi nello stesso
   * istante. Non si ripubblica — si aspetta lui e si racconta il suo esito, che
   * e' l'unico vero. Se non fa in tempo, si dice quello che sta succedendo:
   * mai «non sono riuscito a pubblicare» per una cosa che sta uscendo.
   */
  if (esito.saltata) {
    const finale = await attendiEsito(bozza.id);
    if (!finale) {
      await rispondi(a, 'Ricevuto: il menù sta uscendo proprio adesso. Se qualcosa non va te lo dico qui.');
      return 'in_corso';
    }
    esito = finale;
  }

  const righe = esito.destinazioni.map((d) => {
    // "scheda Google", mai "Google Maps": i ristoratori capiscono che il menù
    // finisce sulla mappa e si aspettano una cosa che non succede.
    const nome = d.destinazione === 'gbp' ? 'Scheda Google' : d.destinazione === 'sito' ? 'Sito' : d.destinazione;
    return `${nome}: ${d.esito === 'ok' ? 'aggiornato' : 'NON aggiornato'}`;
  });

  // Il nome del menù nel resoconto: «Sito: aggiornato» su un locale con quattro
  // sezioni non dice abbastanza per accorgersi di uno sbaglio prima del cliente.
  const titolo = titoloSezione(sezioniBozza, bozza.contenuto.sezione as string | null);

  const tutteOk = esito.destinazioni.every((d) => d.esito === 'ok');
  const sitoOk = esito.destinazioni.some((d) => d.destinazione === 'sito' && d.esito === 'ok');

  await rispondi(
    a,
    `${tutteOk ? 'MENÙ PUBBLICATO' : esito.uscito ? 'PUBBLICAZIONE PARZIALE' : 'NON SONO RIUSCITO A PUBBLICARE'}\n\n` +
      (titolo ? `Menù: ${titolo}\n` : '') +
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
      // Una query in piu' per sapere in che cartella va la foto. Costa niente
      // (succede una volta per lavagna fotografata) e tiene le immagini di un
      // cliente separate da quelle di tutti gli altri.
      const [az] = await query<{ slug: string }>(`SELECT slug FROM wesion.azienda WHERE id = $1`, [a.aziendaId]);
      foto = await caricaPubblico(dati, mime, { cliente: az?.slug, tipo: 'menu' });
    } catch (errore: unknown) {
      console.error('[router] media non scaricato:', errore instanceof Error ? errore.message : errore);
    }
  }

  /**
   * I servizi si leggono QUI, prima di leggere la foto, e non piu' alla fine.
   *
   * Servono due volte: per sapere in quali menu' puo' finire questa foto (le
   * sezioni le passiamo al modello, che l'intestazione la sta gia' leggendo) e
   * per chiedere conferma solo di quello che si fara' davvero. Le stesse righe
   * per tutte e due le cose, cosi' la domanda e la risposta non divergono.
   */
  const attivi = await servizi(a.aziendaId);
  const sezioni = sezioniDi(attivi);

  let letto;
  try {
    letto = await leggiMenu({ nomeLocale: a.nome, testo, immagineDataUrl, sezioni });
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
      // `sezioni` dentro la bozza e non solo `sezione`: se il titolare
      // risponde «2» fra dieci minuti, quel 2 deve valere sulla lista che ha
      // letto lui, non su una che nel frattempo abbiamo cambiato in config.
      JSON.stringify({
        summary: letto.summary,
        items: letto.items,
        foto,
        testo_originale: testo,
        sezione: letto.sezione,
        sezioni,
      }),
      letto.modello,
      String(MINUTI_VALIDITA),
    ]
  );

  return chiediConferma(a, {
    piatti: letto.items,
    summary: letto.summary,
    sezione: letto.sezione,
    sezioni,
    attivi,
  });
}

/**
 * L'ultimo messaggio prima del SI: cosa ho letto, dove finisce, cosa rispondere.
 *
 * ⚠️ SI CHIEDE CONFERMA SOLO DI QUELLO CHE SI FARA' DAVVERO.
 *
 * Questo messaggio prometteva sempre «il tuo sito e la tua scheda Google» e
 * mostrava sempre l'anteprima del post Google, comunque fossero configurati i
 * servizi del cliente. Con `post_gbp` spento — o mai acceso — il titolare
 * approvava una cosa e ne usciva un'altra: e' un consenso raccolto su una frase
 * falsa, e a fine giro `pubblicaBozza` (che i servizi li legge sul serio, con
 * `AND s.attivo`) su Google non ci andava.
 *
 * Dal 05/09/2026 vale anche per la SEZIONE: dire «lo pubblico» senza dire in
 * quale dei quattro menu' e' la stessa promessa a meta'. E se non lo sappiamo,
 * non si chiede SI — si chiede quale.
 */
async function chiediConferma(
  a: Mittente,
  dati: {
    piatti: Array<{ name: string; price?: string }>;
    summary: string;
    sezione: string | null;
    sezioni: SezioneMenu[];
    attivi: Record<string, Record<string, unknown>>;
  }
): Promise<string> {
  const suSito = Boolean((dati.attivi['menu_del_giorno'] as ConfigSito | undefined)?.site_menu_url);
  const suGoogle = Boolean(dati.attivi['post_gbp']);

  const dove = [suSito ? 'sul tuo sito' : null, suGoogle ? 'sulla tua scheda Google' : null]
    .filter(Boolean)
    .join(' e ');

  // Nessuna destinazione: farsi dire SI qui vorrebbe dire far approvare un
  // nulla di fatto, e scoprirlo solo dopo. Meglio dirlo adesso e non creare
  // l'attesa di una pubblicazione che non puo' avvenire.
  if (!dove) {
    await rispondi(
      a,
      `Ho letto il menù (${dati.piatti.length} piatti), ma per ${a.nome} non risulta attiva nessuna destinazione: ` +
        `né il sito né la scheda Google. Non pubblico niente — ci pensiamo noi a sistemare la configurazione.`
    );
    return 'senza_destinazioni';
  }

  const titolo = titoloSezione(dati.sezioni, dati.sezione);

  /**
   * Il modello non ha saputo dire in quale menu' va, e questo cliente ne ha
   * piu' d'uno: si chiede. E' il quarto passo del disegno del 05/09 — prima si
   * prova a capirlo da soli dall'intestazione della foto, e solo se non si
   * capisce si disturba il titolare.
   */
  if (!titolo && dati.sezioni.length > 1) {
    await rispondi(
      a,
      `MENÙ RILEVATO (${dati.piatti.length} piatti):\n\n${elencaPiatti(dati.piatti)}\n\n` +
        domandaSezione(dati.sezioni)
    );
    return 'sezione_da_scegliere';
  }

  await rispondi(
    a,
    `MENÙ DEL GIORNO RILEVATO (${dati.piatti.length} piatti):\n\n${elencaPiatti(dati.piatti)}\n\n` +
      `Se confermi lo pubblico ${dove}${titolo ? `, nella sezione «${titolo}»` : ''}.\n\n` +
      (suGoogle ? `Sulla scheda Google uscirà così:\n"${dati.summary}"\n\n` : '') +
      `Rispondi SI per pubblicare, NO per annullare. La bozza vale ${MINUTI_VALIDITA} minuti.`
  );
  return 'bozza_creata';
}

/**
 * La risposta alla domanda «in quale menù lo metto?».
 *
 * Torna `null` quando il messaggio non e' una scelta: allora e' un menu' nuovo,
 * o chiacchiera, e se ne occupa chi viene dopo nel dispatch. Si accetta il
 * numero, ma anche il titolo scritto a mano («sabato»): il numero e' la strada
 * che non si sbaglia, non un obbligo.
 */
async function scegliSezione(a: Mittente, testo: string): Promise<string | null> {
  const bozza = await menuInAttesa(a.aziendaId);
  if (!bozza || bozza.scaduta) return null;

  // La sezione c'e' gia': un «2» adesso non e' una scelta, e cambiare
  // destinazione a una bozza gia' dichiarata al titolare sarebbe peggio.
  if (bozza.contenuto.sezione) return null;

  const sezioni = (bozza.contenuto.sezioni ?? []) as SezioneMenu[];
  if (!Array.isArray(sezioni) || sezioni.length < 2) return null;

  const pulito = testo.trim().toLowerCase();
  const numero = /^[1-9]$/.test(pulito) ? Number(pulito) : 0;
  const scelta =
    (numero >= 1 && numero <= sezioni.length ? sezioni[numero - 1] : null) ??
    sezioni.find((s) => s.titolo.toLowerCase() === pulito) ??
    // Ultimo tentativo, solo se non e' ambiguo: «sabato» quando c'e' un solo
    // sabato. Con due sezioni che contengono la parola non si sceglie a caso.
    (sezioni.filter((s) => pulito.length >= 4 && s.titolo.toLowerCase().includes(pulito)).length === 1
      ? sezioni.find((s) => s.titolo.toLowerCase().includes(pulito))
      : null);

  if (!scelta) return null;

  await query(
    `UPDATE wesion.bozza
        SET contenuto = jsonb_set(contenuto, '{sezione}', to_jsonb($2::text))
      WHERE id = $1`,
    [bozza.id, scelta.slug]
  );

  return chiediConferma(a, {
    piatti: (bozza.contenuto.items as Array<{ name: string; price?: string }>) ?? [],
    summary: String(bozza.contenuto.summary ?? ''),
    sezione: scelta.slug,
    sezioni,
    attivi: await servizi(a.aziendaId),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function gestisciMessaggio(payload: Record<string, unknown>): Promise<string> {
  if (payload.fromMe) return 'ignorato_mio';

  /**
   * I gruppi si scartano qui, prima di cercare chi ha scritto.
   *
   * UN NUMERO = UN BOT (deciso il 05/09/2026): il numero bot non entra in
   * nessun gruppo, e se ci finisse un «SI» di chiunque pubblicherebbe davvero —
   * `candidati()` legge `author`/`participant`, che in un gruppo sono la persona
   * che ha scritto, non il titolare. Si scarta in silenzio e senza rispondere:
   * una risposta del bot dentro un gruppo la leggerebbero tutti.
   */
  if (eGruppo(payload)) {
    console.log(`[router] messaggio di gruppo ignorato (${String(payload.from ?? '')})`);
    return 'ignorato_gruppo';
  }

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

  /**
   * «2» — la risposta alla domanda su quale menù.
   *
   * Sta qui, prima della chiacchiera: senza, un «2» finirebbe nel ramo del
   * messaggio corto e si sentirebbe rispondere «mandami la foto della lavagna»
   * dopo che gliel'aveva appena mandata. Torna `null` quando non e' una scelta,
   * e allora prosegue il dispatch come prima.
   */
  if (!conFoto && testo.length <= 30) {
    const scelta = await scegliSezione(a, testo);
    if (scelta) return scelta;
  }

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

  // Niente `SEGRETO &&`: adesso e' garantito non vuoto (si esce all'avvio se
  // manca), e quella condizione era proprio il modo in cui il controllo si
  // spegneva da solo senza dirlo.
  if (richiesta.headers['x-router-secret'] !== SEGRETO) {
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

/**
 * Il ricontrollo: cosa dice GOOGLE ADESSO dei post che abbiamo mandato.
 *
 * ⚠️ Un giro a parte, e piu' lento, apposta. Pubblicare e' urgente — un "SI" su
 * WhatsApp deve uscire mentre il titolare ha ancora il telefono in mano — ma la
 * revisione di Google ci mette minuti e un post respinto resta respinto: farlo
 * ogni trenta secondi vorrebbe dire spendere chiamate all'API per riscrivere lo
 * stesso valore. Mezz'ora e' abbastanza spesso perche' una persona se ne
 * accorga in giornata.
 */
let verificaInCorso = false;
async function avviaVerifiche(): Promise<void> {
  if (verificaInCorso) return;
  verificaInCorso = true;
  try {
    const esiti = await giroVerifiche();
    const cambiati = esiti.filter((e) => e.cambiato);
    if (cambiati.length) {
      console.log(`[router] ricontrollo: ${cambiati.length} pubblicazioni hanno cambiato stato`);
    }
  } catch (errore: unknown) {
    console.error('[router] ricontrollo fallito:', errore instanceof Error ? errore.message : errore);
  } finally {
    verificaInCorso = false;
  }
}

/**
 * Ogni quanto si guarda l'impianto. Cinque minuti: una chiave che muore non
 * torna viva da sola, quindi guardarla piu' spesso non anticipa niente, ma
 * mezz'ora di bot muto su tutti i clienti insieme e' troppa.
 */
const MINUTI_IMPIANTO = Number(process.env.MINUTI_IMPIANTO || 5);

let impiantoInCorso = false;
async function avviaControlloImpianto(): Promise<void> {
  if (impiantoInCorso) return;
  impiantoInCorso = true;
  try {
    await controllaImpianto();
  } catch (errore: unknown) {
    // Non deve mai fermare il router: se il controllo non riesce a scrivere,
    // il servizio continua a funzionare e la dashboard se ne accorge dal
    // battito che non arriva piu'.
    console.error('[router] controllo impianto fallito:', errore instanceof Error ? errore.message : errore);
  } finally {
    impiantoInCorso = false;
  }
}

server.listen(PORTA, HOST, () => {
  console.log(`[router] Wesion in ascolto su http://${HOST}:${PORTA}`);
  console.log(`[router] giro delle approvazioni ogni ${SECONDI_GIRO}s`);
  console.log(`[router] ricontrollo su Google ogni ${MINUTI_VERIFICA} minuti`);
  console.log(`[router] controllo dell'impianto ogni ${MINUTI_IMPIANTO} minuti`);
  setInterval(avviaGiro, SECONDI_GIRO * 1000);
  setInterval(avviaVerifiche, MINUTI_VERIFICA * 60_000);
  setInterval(avviaControlloImpianto, MINUTI_IMPIANTO * 60_000);
  void avviaGiro();
  // Subito, e non fra cinque minuti: se la chiave WAHA e' morta lo si deve
  // sapere all'avvio, non al primo titolare che scrive e non riceve risposta.
  void avviaControlloImpianto();
  // Il primo ricontrollo dopo un minuto e non subito: all'avvio c'e' gia' il
  // giro delle pubblicazioni che parla con Google, e partire insieme vorrebbe
  // dire due raffiche di chiamate nello stesso istante per niente.
  setTimeout(avviaVerifiche, 60_000);
});
