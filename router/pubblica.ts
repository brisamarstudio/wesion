/**
 * Il pubblicatore. Uno solo, per tutte e due le porte d'ingresso.
 *
 * QUESTA E' LA TESI DI WESION, SCRITTA IN CODICE. Un "SI" su WhatsApp e un
 * click in dashboard non sono due percorsi che finiscono nello stesso posto:
 * sono LO STESSO percorso con due innescchi. Il titolare che conferma il menù
 * scrive `stato='approvata'` in `bozza`, esattamente come lo scrive la consolle
 * quando qualcuno approva un post di Google. Da li' in poi il codice e' questo,
 * e uno solo.
 *
 * Prima erano due programmi in due macchine con due tabelle: il menù si
 * pubblicava dentro `index.js` del router, i post dentro `/api/posts` della
 * dashboard. Le due strade avevano gestioni degli errori diverse, e quella del
 * menù non lasciava nessuna traccia di cosa fosse uscito.
 *
 * IL GIRO ESISTE PERCHE' IL PONTE E' A SENSO UNICO. La dashboard sta su Contabo,
 * il router su Oracle dietro 172.17.0.1: la dashboard non puo' chiamarci, ed e'
 * una difesa gia' pagata. Quindi non ci chiama — scrive, e noi leggiamo. Se
 * questo giro si ferma, le approvazioni si accumulano in silenzio: e' il guasto
 * piu' caro dell'impianto, ed e' per questo che c'e' la spia
 * `bozze-approvate-ferme` a sorvegliarlo dall'altra parte.
 */

import { query } from '../src/lib/db.ts';
import { pubblicaPost, statoPost, type AzioneBottone } from '../src/lib/gbp.ts';
import { pubblicaArticolo, pubblicaMenu, type ConfigSito } from '../src/lib/sito.ts';

/**
 * Dopo tre tentativi falliti si smette di riprovare.
 *
 * Non perche' al quarto non potrebbe andare: perche' se tre volte di fila
 * Google ha detto 404, il problema non passa da solo, e continuare a riprovare
 * ogni mezzo minuto nasconde il guasto dentro un log che scorre. Restano le
 * righe in `pubblicazione` e la spia `pubblicazioni-fallite` a raccontarlo.
 */
const MAX_TENTATIVI = 3;

export interface EsitoPubblicazione {
  bozzaId: number;
  destinazioni: Array<{ destinazione: string; esito: 'ok' | 'errore'; errore?: string }>;
  /** Vero se almeno una destinazione ha accettato: il contenuto è uscito. */
  uscito: boolean;
}

interface RigaBozza {
  id: number;
  azienda_id: number;
  azienda: string;
  tipo: string;
  contenuto: Record<string, unknown>;
  servizi: Array<{ tipo: string; config: Record<string, unknown> }>;
}

async function leggiBozza(bozzaId: number): Promise<RigaBozza | null> {
  const [riga] = await query<RigaBozza>(
    `SELECT b.id, b.azienda_id, b.tipo, b.contenuto, a.nome AS azienda,
            COALESCE((
              SELECT json_agg(json_build_object('tipo', s.tipo, 'config', s.config))
                FROM wesion.servizio s
               WHERE s.azienda_id = a.id AND s.attivo
            ), '[]'::json) AS servizi
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.id = $1`,
    [bozzaId]
  );
  return riga ?? null;
}

/** Registra un tentativo verso una destinazione, riuscito o no. */
async function segna(
  bozzaId: number,
  destinazione: string,
  esito: 'ok' | 'errore',
  extra: { url?: string | null; risposta?: unknown; errore?: string | null } = {}
): Promise<void> {
  await query(
    `INSERT INTO wesion.pubblicazione (bozza_id, destinazione, esito, url_risultato, risposta, errore, tentativi)
     VALUES ($1, $2, $3, $4, $5, $6,
             -- Quanti tentativi ha già visto questa destinazione, più questo.
             1 + COALESCE((SELECT count(*) FROM wesion.pubblicazione p
                            WHERE p.bozza_id = $1 AND p.destinazione = $2), 0))`,
    [
      bozzaId,
      destinazione,
      esito,
      extra.url ?? null,
      // Grezza apposta: quando Google risponde 500 "INTERNAL" senza dire
      // perché, l'unica cosa che aiuta è rileggere cosa aveva risposto davvero.
      extra.risposta ? JSON.stringify(extra.risposta) : null,
      extra.errore ?? null,
    ]
  );
}

/**
 * Pubblica una bozza su tutte le destinazioni che il cliente ha attive.
 *
 * Ogni destinazione fallisce da sola e viene registrata da sola: il menù va sul
 * sito E su Google, e se Google respinge non c'e' nessun motivo di non
 * aggiornare il sito. Con una riga per destinazione, "l'ultima pubblicazione
 * riuscita su Google risale a tre giorni fa" e' una query — cioe' una spia.
 * Senza, e' una telefonata fra 32 ore.
 */
export async function pubblicaBozza(bozzaId: number): Promise<EsitoPubblicazione> {
  const bozza = await leggiBozza(bozzaId);
  if (!bozza) throw new Error(`bozza ${bozzaId} inesistente`);

  const servizio = (tipo: string) => bozza.servizi.find((s) => s.tipo === tipo)?.config ?? null;
  const destinazioni: EsitoPubblicazione['destinazioni'] = [];

  /**
   * Lo snapshot PRIMA di toccare qualcosa.
   *
   * La pubblicazione sovrascrive: senza rete, un OCR sbagliato cancella il menù
   * vero e non torna più. È già successo — un'AI aveva inventato sedici piatti.
   * Il ripristino vero lo fa il sito, che sa cosa mostrava; questo serve a
   * rispondere in dashboard alla domanda "cosa gli abbiamo mandato quel giorno".
   */
  await query(
    `INSERT INTO wesion.snapshot (azienda_id, tipo, contenuto, motivo)
     VALUES ($1, $2, $3, $4)`,
    [bozza.azienda_id, bozza.tipo, JSON.stringify(bozza.contenuto), `pubblicazione bozza ${bozzaId}`]
  );

  const testo = String(bozza.contenuto.summary ?? bozza.contenuto.testo ?? '');
  const foto = (bozza.contenuto.foto ?? null) as string | null;

  // ── Il sito, per i menù ────────────────────────────────────────────────────
  if (bozza.tipo === 'menu') {
    const config = servizio('menu_del_giorno') as ConfigSito | null;
    if (config?.site_menu_url) {
      try {
        const esito = await pubblicaMenu(config, (bozza.contenuto.items as unknown[]) ?? []);
        await segna(bozzaId, 'sito', 'ok', { risposta: esito, url: config.site_menu_page ?? null });
        destinazioni.push({ destinazione: 'sito', esito: 'ok' });
      } catch (errore: unknown) {
        const motivo = errore instanceof Error ? errore.message : String(errore);
        await segna(bozzaId, 'sito', 'errore', { errore: motivo });
        destinazioni.push({ destinazione: 'sito', esito: 'errore', errore: motivo });
      }
    } else {
      const motivo = 'il cliente non ha il servizio "menù del giorno" configurato con un site_menu_url';
      await segna(bozzaId, 'sito', 'errore', { errore: motivo });
      destinazioni.push({ destinazione: 'sito', esito: 'errore', errore: motivo });
    }
  }

  // ── La scheda Google ───────────────────────────────────────────────────────
  if (bozza.tipo === 'menu' || bozza.tipo === 'post_gbp') {
    const gbp = servizio('post_gbp') as
      | { gbp_account_id?: string; gbp_location_id?: string; cta_tipo?: string; cta_url?: string }
      | null;
    const menu = servizio('menu_del_giorno') as ConfigSito | null;

    if (gbp?.gbp_account_id && gbp?.gbp_location_id) {
      try {
        /**
         * Il bottone si decide QUI, non alla generazione.
         *
         * Ordine: quello scelto su questa bozza, poi quello di serie del
         * cliente, e per un menu la sua pagina. Risolverlo al momento della
         * pubblicazione e non quando la bozza nasce vuol dire che i
         * diciassette post gia' in coda di un piano prendono il bottone appena
         * lo imposti, senza rigenerarli.
         */
        const cta = (bozza.contenuto.cta ?? {}) as { tipo?: string; url?: string };
        const azione = (cta.tipo || gbp.cta_tipo || (menu?.site_menu_page ? 'LEARN_MORE' : null)) as
          | AzioneBottone
          | null;
        const urlBottone = cta.url || gbp.cta_url || menu?.site_menu_page || null;

        const risposta = await pubblicaPost({
          accountId: gbp.gbp_account_id,
          locationId: gbp.gbp_location_id,
          testo,
          urlImmagine: foto,
          azioneBottone: azione,
          urlBottone,
        });
        /**
         * ⚠️ `searchUrl` E' L'UNICO LINK STABILE AL POST (01/09/2026).
         *
         * Google lo restituisce nella risposta ed e' l'indirizzo pubblico di
         * QUEL post. L'URL che si copia dalla barra guardando i post dal
         * proprio profilo non serve a niente: dentro ha `stick` e `mat`, token
         * legati alla sessione di chi guarda, e a un'altra persona non aprono
         * niente. Senza questo, lo storico diceva "uscito" e non aveva un modo
         * di farti vedere cosa.
         */
        const link = (risposta as { searchUrl?: string })?.searchUrl ?? null;
        await segna(bozzaId, 'gbp', 'ok', { risposta, url: link });
        destinazioni.push({ destinazione: 'gbp', esito: 'ok' });
      } catch (errore: unknown) {
        const motivo = errore instanceof Error ? errore.message : String(errore);
        await segna(bozzaId, 'gbp', 'errore', { errore: motivo });
        destinazioni.push({ destinazione: 'gbp', esito: 'errore', errore: motivo });
      }
    } else if (bozza.tipo === 'post_gbp') {
      // Per un post di Google la scheda è l'unica destinazione: senza, non c'è
      // niente da fare e va detto. Per un menù invece è legittimo non averla —
      // ci sono clienti che hanno solo il sito.
      const motivo = 'il cliente non ha una scheda Google configurata';
      await segna(bozzaId, 'gbp', 'errore', { errore: motivo });
      destinazioni.push({ destinazione: 'gbp', esito: 'errore', errore: motivo });
    }
  }

  /**
   * ── Un messaggio a un lead ───────────────────────────────────────────────
   *
   * ⚠️ QUI IL COMPORTAMENTO E' CAMBIATO RISPETTO AL BOT VECCHIO, DI PROPOSITO.
   *
   * `lead_bot.js` rispondeva da solo ai prospect: generava il testo con l'AI e
   * lo mandava, senza che nessuno lo leggesse prima. Va in rotta di collisione
   * con la regola che governa tutto il resto di Wesion — l'ultimo bottone e'
   * dell'operatore, niente esce da solo — e non e' una regola di gusto: un
   * messaggio sbagliato a un ristoratore che non ci conosce e' una porta chiusa
   * per sempre, e non lascia nemmeno un errore da guardare.
   *
   * Adesso l'AI scrive la BOZZA, che compare nella consolle come tutte le
   * altre, e parte da qui solo dopo che qualcuno l'ha approvata. La destinazione
   * 'whatsapp' era gia' prevista nello schema: era la strada segnata.
   */
  if (bozza.tipo === 'messaggio_lead') {
    const destinatario = String(bozza.contenuto.destinatario ?? '');
    if (!destinatario) {
      const motivo = 'la bozza non dice a che numero mandare il messaggio';
      await segna(bozzaId, 'whatsapp', 'errore', { errore: motivo });
      destinazioni.push({ destinazione: 'whatsapp', esito: 'errore', errore: motivo });
    } else {
      const { mandaTesto } = await import('../src/lib/waha.ts');
      const partito = await mandaTesto(destinatario, testo);
      if (partito) {
        await query(
          `INSERT INTO wesion.messaggio (azienda_id, direzione, canale, autore, testo, payload)
           VALUES ($1, 'out', 'whatsapp', 'operatore', $2, $3)`,
          [bozza.azienda_id, testo, JSON.stringify({ destinatario, bozza_id: bozzaId })]
        );
        await segna(bozzaId, 'whatsapp', 'ok', { url: `https://wa.me/${destinatario}` });
        destinazioni.push({ destinazione: 'whatsapp', esito: 'ok' });
      } else {
        const motivo = 'WhatsApp non ha accettato il messaggio';
        await segna(bozzaId, 'whatsapp', 'errore', { errore: motivo });
        destinazioni.push({ destinazione: 'whatsapp', esito: 'errore', errore: motivo });
      }
    }
  }

  /**
   * ── Il blog del cliente ──────────────────────────────────────────────────
   *
   * Stesso schema del menu: il SITO scrive sul proprio database, noi gli
   * mandiamo una richiesta firmata col segreto suo. Wesion non ha (e non deve
   * avere) le credenziali di quindici database di clienti.
   *
   * Vale anche per mywebby.it, che qui dentro e' un cliente come gli altri: il
   * blog dell'agenzia si pubblica dalla stessa consolle e con lo stesso
   * bottone. Non e' un vezzo di simmetria — e' il motivo per cui una modifica
   * al percorso di pubblicazione la si prova per primi su di noi.
   */
  if (bozza.tipo === 'articolo') {
    const config = servizio('blog') as ConfigSito | null;
    /**
     * Due modi di essere configurato, uno per mondo: un sito nostro ha
     * l'indirizzo dell'endpoint, un WordPress ha la radice del suo sito e le
     * credenziali. Controllare solo `site_blog_url`, come faceva questa riga
     * fino al 31/08/2026, avrebbe fatto rifiutare OGNI articolo verso un
     * WordPress con un messaggio che parlava di un campo che li' non esiste.
     */
    const configurato = config?.tipo === 'wordpress' ? Boolean(config.wp_base) : Boolean(config?.site_blog_url);
    if (config && configurato) {
      try {
        const esito = await pubblicaArticolo(config, {
          titolo: String(bozza.contenuto.titolo ?? '').trim() || 'Senza titolo',
          sommario: String(bozza.contenuto.sommario ?? '').trim() || undefined,
          corpo: testo,
          categoria: String(bozza.contenuto.categoria ?? '').trim() || undefined,
          immagine: foto,
          slug: String(bozza.contenuto.slug ?? `articolo-${bozzaId}`),
        });
        await segna(bozzaId, 'blog', 'ok', { risposta: esito.risposta, url: esito.url });
        destinazioni.push({ destinazione: 'blog', esito: 'ok' });
      } catch (errore: unknown) {
        const motivo = errore instanceof Error ? errore.message : String(errore);
        await segna(bozzaId, 'blog', 'errore', { errore: motivo });
        destinazioni.push({ destinazione: 'blog', esito: 'errore', errore: motivo });
      }
    } else {
      // Il motivo dice quale campo manca in QUEL mondo: mandare uno a cercare
      // un `site_blog_url` su un cliente WordPress e' peggio che tacere.
      const motivo =
        config?.tipo === 'wordpress'
          ? 'il servizio "blog" è impostato su WordPress ma non ha l’indirizzo del sito'
          : 'il cliente non ha il servizio "blog" configurato con un site_blog_url';
      await segna(bozzaId, 'blog', 'errore', { errore: motivo });
      destinazioni.push({ destinazione: 'blog', esito: 'errore', errore: motivo });
    }
  }

  // ── Tipi che ancora non sappiamo pubblicare ───────────────────────────────
  if (destinazioni.length === 0) {
    const motivo = `non so ancora pubblicare una bozza di tipo "${bozza.tipo}"`;
    await segna(bozzaId, 'blog', 'errore', { errore: motivo });
    destinazioni.push({ destinazione: 'blog', esito: 'errore', errore: motivo });
  }

  const uscito = destinazioni.some((d) => d.esito === 'ok');

  /**
   * Lo stato cambia solo se qualcosa e' davvero uscito.
   *
   * Se non e' uscito niente la bozza resta `approvata`, cosi' il giro la
   * riprende. Non e' un cavillo: scrivere `pubblicata` su una cosa che non e'
   * mai arrivata da nessuna parte e' la bugia esatta che le spie esistono per
   * impedire.
   */
  if (uscito) {
    await query(`UPDATE wesion.bozza SET stato = 'pubblicata' WHERE id = $1`, [bozzaId]);
  }

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
     VALUES ($1, $2, 'router', $3)`,
    [
      bozza.azienda_id,
      uscito ? 'bozza_pubblicata' : 'pubblicazione_fallita',
      JSON.stringify({ bozza_id: bozzaId, destinazioni }),
    ]
  );

  return { bozzaId, destinazioni, uscito };
}

/**
 * Il giro: raccoglie le approvazioni che aspettano e le pubblica.
 *
 * E' l'unico modo che la dashboard ha di farci fare qualcosa. Gira spesso e
 * costa una query quando non c'e' niente da fare, che e' quasi sempre.
 */
export async function giroPubblicazioni(): Promise<EsitoPubblicazione[]> {
  const daFare = await query<{ id: number }>(
    `SELECT b.id
       FROM wesion.bozza b
      WHERE b.stato = 'approvata'
        -- Mai riuscita da nessuna parte...
        AND NOT EXISTS (SELECT 1 FROM wesion.pubblicazione p
                         WHERE p.bozza_id = b.id AND p.esito = 'ok')
        -- ...e non ci abbiamo già provato troppe volte.
        AND (SELECT count(*) FROM wesion.pubblicazione p WHERE p.bozza_id = b.id) < $1
        -- Una bozza scaduta non si pubblica in ritardo: si lascia dov'è.
        AND (b.scade_at IS NULL OR b.scade_at > now())
        -- ...e una programmata non si pubblica in anticipo. Sono due vincoli
        -- opposti su due colonne diverse apposta: un post del piano approvato
        -- a settembre deve uscire il giorno suo, non subito.
        AND (b.pubblica_at IS NULL OR b.pubblica_at <= now())
      ORDER BY b.approvata_at NULLS FIRST
      LIMIT 20`,
    [MAX_TENTATIVI]
  );

  const esiti: EsitoPubblicazione[] = [];
  for (const { id } of daFare) {
    try {
      esiti.push(await pubblicaBozza(id));
    } catch (errore: unknown) {
      // Una bozza che esplode non deve fermare le altre diciannove.
      console.error(`[router] bozza ${id} non pubblicata:`, errore instanceof Error ? errore.message : errore);
    }
  }
  return esiti;
}

/**
 * ── IL RICONTROLLO ──────────────────────────────────────────────────────────
 *
 * ⚠️ ESISTE PERCHE' 200 NON VUOL DIRE ONLINE, e ce l'ha insegnato la prima
 * pubblicazione vera (01/09/2026). Google ha risposto 200, abbiamo scritto
 * `esito='ok'`, e il post era in `state: PROCESSING`: la revisione e' arrivata
 * dopo. E' finita bene — `LIVE` cinque minuti dopo — ma poteva finire in
 * `REJECTED`, e in dashboard avremmo continuato a leggere "uscito · ok" per
 * sempre. E' il guasto muto applicato all'unica cosa che esce nel mondo.
 *
 * Non e' un rischio teorico: il 20/07/2026 Google ha rimosso un post e
 * sospeso la pubblicazione su una scheda (`gbp-autoposter/STATO.md`). Una
 * scheda non si sospende per un post solo — si sospende per un profilo che ne
 * accumula. Accorgersene al primo e' la differenza fra correggere e riaprire.
 *
 * Cosa NON fa: non ripubblica e non corregge niente da solo. Scrive quello che
 * Google dice, e lascia che siano le spie a farlo notare a una persona.
 */
export interface EsitoVerifica {
  pubblicazioneId: number;
  stato: string;
  cambiato: boolean;
}

export async function giroVerifiche(): Promise<EsitoVerifica[]> {
  const daVedere = await query<{ id: number; nome: string; stato_remoto: string | null }>(
    `SELECT p.id, p.risposta->>'name' AS nome, p.stato_remoto
       FROM wesion.pubblicazione p
      WHERE p.destinazione = 'gbp'
        AND p.esito = 'ok'
        AND p.risposta->>'name' IS NOT NULL
        -- Dopo un mese un post e' storia: Google lo tiene, ma ricontrollarlo
        -- ogni giorno per sempre costa chiamate e non cambia piu' niente.
        AND p.eseguita_at > now() - INTERVAL '30 days'
        -- Mai visto, oppure visto piu' di sei ore fa. Piu' spesso di cosi' non
        -- serve: la revisione di Google ci mette minuti, non secondi, e un post
        -- rimosso resta rimosso.
        AND (p.verificata_at IS NULL OR p.verificata_at < now() - INTERVAL '6 hours')
      ORDER BY p.verificata_at NULLS FIRST
      LIMIT 20`
  );

  const esiti: EsitoVerifica[] = [];
  for (const riga of daVedere) {
    try {
      const risposta = await statoPost(riga.nome);
      // 404: il post non c'e' piu'. E' una risposta, non un guasto nostro.
      const stato = risposta ? risposta.stato : 'RIMOSSO';
      const cambiato = stato !== riga.stato_remoto;

      await query(
        `UPDATE wesion.pubblicazione SET stato_remoto = $2, verificata_at = now() WHERE id = $1`,
        [riga.id, stato]
      );

      if (cambiato && stato !== 'LIVE' && stato !== 'PROCESSING') {
        console.log(`[router] pubblicazione ${riga.id}: Google adesso dice ${stato}`);
      }
      esiti.push({ pubblicazioneId: riga.id, stato, cambiato });
    } catch (errore: unknown) {
      // Non aver POTUTO chiedere e' diverso da "il post non c'e' piu'": non si
      // scrive niente, si riprova al giro dopo. Scrivere "sconosciuto" qui
      // vorrebbe dire trasformare un problema di rete in un allarme sul post.
      console.error(
        `[router] verifica ${riga.id} non riuscita:`,
        errore instanceof Error ? errore.message : errore
      );
    }
  }
  return esiti;
}
