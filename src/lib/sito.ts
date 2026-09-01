/**
 * Il sito del cliente — l'unico che scrive sul proprio database.
 *
 * PERCHE' NON SCRIVIAMO NOI. Ogni sito ha il suo Neon, il suo schema e le sue
 * regole; il router non ha (e non deve avere) le credenziali di quindici
 * database di clienti. Gli manda una richiesta firmata col segreto DI QUEL
 * cliente e il sito fa il resto. Il segreto e' per-cliente proprio per questo:
 * non puo' stare in un .env comune, sta in `servizio.config`.
 *
 * ⚠️ IL CONTRATTO E' GIA' IN PRODUZIONE. `{action:'replace', items}` e
 * `{action:'restore'}` sono quello che i Worker su sitobracemia e
 * trattorialafenice si aspettano oggi. Cambiare qui i nomi dei campi vuol dire
 * rompere siti vivi che nessuno ridistribuirà nello stesso momento.
 *
 * Nessun import relativo, apposta: vedi la nota in cima a `waha.ts`.
 */

export interface ConfigSito {
  site_menu_url?: string;
  site_secret?: string;
  site_menu_page?: string;
  /** Il blog: un endpoint diverso, con un segreto diverso. Vedi sotto. */
  site_blog_url?: string;
  site_blog_secret?: string;
  site_blog_page?: string;
  /**
   * Che genere di sito c'e' dall'altra parte.
   *
   * 'wesion'    — un sito nostro, con l'endpoint del contratto (Astro, Express,
   *               un Worker: cambia il linguaggio, non il contratto).
   * 'wordpress' — il WordPress del cliente, via la sua REST API.
   *
   * Assente = 'wesion', perche' i clienti configurati prima del 31/08/2026 sono
   * tutti di quel tipo e non devono essere ritoccati uno per uno.
   */
  tipo?: 'wesion' | 'wordpress';
  /** WordPress: la radice del sito, senza /wp-json. */
  wp_base?: string;
  wp_utente?: string;
  /** La «password per applicazioni», non quella con cui il cliente fa login. */
  wp_password_app?: string;
  /** Categoria in cui far cadere gli articoli, se ne vuole una precisa. */
  wp_categoria?: string;
}

async function chiama(
  url: string | undefined,
  intestazione: string,
  segreto: string | undefined,
  corpo: unknown
): Promise<Record<string, unknown>> {
  if (!url) throw new Error('manca l’indirizzo a cui mandare la richiesta');

  const risposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [intestazione]: segreto || '' },
    body: JSON.stringify(corpo),
    // Un articolo puo' essere lungo e il sito puo' doverlo indicizzare: piu'
    // largo del menu, che sono venti righe.
    signal: AbortSignal.timeout(30000),
  });

  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`sito ${risposta.status}: ${testo.slice(0, 200)}`);
  return JSON.parse(testo || '{}');
}

/** Sostituisce il menù pubblicato sul sito. */
export async function pubblicaMenu(config: ConfigSito, piatti: unknown[]): Promise<Record<string, unknown>> {
  return chiama(config.site_menu_url, 'x-menu-secret', config.site_secret, { action: 'replace', items: piatti });
}

export interface ArticoloDaPubblicare {
  /** Il titolo che si legge nella scheda dell'articolo. */
  titolo: string;
  /** Due righe di riassunto sotto il titolo, nell'elenco. */
  sommario?: string;
  /** Il corpo, in testo semplice con gli a capo. Niente markdown. */
  corpo: string;
  /** Etichetta di categoria: «Ristorazione», «SEO», «Prezzi & Budget». */
  categoria?: string;
  /** URL pubblica dell'immagine di copertina, se c'è. */
  immagine?: string | null;
  /**
   * Lo slug con cui l'articolo vive nell'URL.
   *
   * Lo manda WESION e non lo inventa il sito, per una ragione precisa: e' la
   * chiave con cui un aggiornamento riconosce l'articolo gia' pubblicato invece
   * di crearne un secondo identico. Se lo generasse il sito da titolo, cambiare
   * una parola nel titolo creerebbe un doppione e il vecchio resterebbe online.
   */
  slug: string;
}

/**
 * Pubblica un articolo sul blog del cliente.
 *
 * ⚠️ STESSO SCHEMA DEL MENÙ, ENDPOINT E SEGRETO DIVERSI. Non si riusa
 * `site_menu_url` con un'azione in più: sono due superfici con rischi diversi.
 * Il menù cambia venti righe di una pagina, un articolo crea contenuto
 * indicizzabile con un URL suo. Chi ha il segreto del menù non deve poter
 * scrivere articoli sul blog — e su un sito che il menù non ce l'ha proprio,
 * come mywebby.it, l'endpoint del menù non esiste nemmeno.
 *
 * L'IDEMPOTENZA E' DEL SITO. Si manda sempre lo stesso `slug`: se quell'articolo
 * c'e' gia', il sito lo aggiorna; se non c'e', lo crea. Cosi' ripubblicare dopo
 * una correzione non lascia due versioni online, ed e' lo stesso motivo per cui
 * lo slug lo decide chi pubblica e non chi riceve.
 */
export async function pubblicaArticolo(
  config: ConfigSito,
  articolo: ArticoloDaPubblicare
): Promise<{ url: string | null; risposta: Record<string, unknown> }> {
  // Un solo smistamento, qui. Da `pubblica.ts` in giù nessuno sa che esistono
  // due mondi: la bozza, il controllo, l'approvazione e la riga di
  // pubblicazione sono identiche. E' il senso di avere un adattatore.
  if (config.tipo === 'wordpress') return pubblicaArticoloWordPress(config, articolo);

  const risposta = await chiama(config.site_blog_url, 'x-blog-secret', config.site_blog_secret, {
    action: 'pubblica',
    articolo,
  });
  // Il sito risponde con l'URL vero dell'articolo: e' quello che finisce in
  // `pubblicazione.url_risultato`, cosi' dalla consolle ci si clicca sopra.
  const url = (risposta.url ?? risposta.link ?? null) as string | null;
  return { url, risposta };
}

/* ═══════════════════ WordPress ═══════════════════════════════════════════
 *
 * Il cliente che non vuole rifare il sito.
 *
 * ⚠️ QUI NON SI INSTALLA NIENTE, ED E' TUTTO IL PUNTO. WordPress espone la sua
 * REST API da solo dalla 4.7, e dalla 5.6 accetta le «password per
 * applicazioni»: il cliente se la genera dal suo profilo, ce la da', e la puo'
 * revocare quando vuole senza cambiare la propria. Non tocchiamo il tema, non
 * chiediamo l'FTP, non installiamo plugin. Gli articoli compaiono nella sua
 * bacheca come qualsiasi altro post, e li puo' cancellare da solo.
 *
 * ⚠️ SOLO HTTPS. Su http WordPress le password per applicazioni non le mostra
 * nemmeno, e mandare quella stringa in chiaro darebbe a chi ascolta il diritto
 * di scrivere sul sito di un cliente. Meglio rifiutare qui che scoprirlo dopo.
 *
 * Le due trappole che si incontrano davvero, in ordine di frequenza:
 *   1. un plugin di sicurezza blocca /wp-json (risposta 401/403 anche con le
 *      credenziali giuste);
 *   2. l'hosting mangia l'header Authorization prima che PHP lo veda, e allora
 *      WordPress risponde "non sei loggato" con credenziali perfette.
 * Sono indistinguibili dal messaggio d'errore, per questo c'e' `provaWordPress`:
 * si scopre in trenta secondi mentre si configura, non il giorno che serve.
 */

function autorizzazione(config: ConfigSito): string {
  const utente = (config.wp_utente ?? '').trim();
  const password = (config.wp_password_app ?? '').trim();
  if (!utente || !password) throw new Error('mancano utente e password per applicazioni di WordPress');
  // Le password per applicazioni WordPress si mostrano a gruppi di quattro
  // separati da spazi: gli spazi sono decorativi, e chi copia-incolla se li
  // porta dietro. Toglierli qui evita un 401 che non si spiega guardando.
  return 'Basic ' + Buffer.from(`${utente}:${password.replace(/\s+/g, '')}`).toString('base64');
}

function radiceWordPress(config: ConfigSito): string {
  const base = (config.wp_base ?? '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('manca l’indirizzo del sito WordPress');
  if (!/^https:\/\//i.test(base)) {
    throw new Error(`il sito WordPress deve stare su https (ricevuto "${base}"): senza, le password per applicazioni non valgono`);
  }
  return `${base}/wp-json/wp/v2`;
}

async function chiamaWordPress(
  config: ConfigSito,
  percorso: string,
  opzioni: { metodo?: string; corpo?: unknown } = {}
): Promise<{ stato: number; dato: Record<string, unknown> | Array<Record<string, unknown>>; grezzo: string }> {
  const risposta = await fetch(`${radiceWordPress(config)}${percorso}`, {
    method: opzioni.metodo ?? 'GET',
    headers: {
      Authorization: autorizzazione(config),
      ...(opzioni.corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opzioni.corpo ? JSON.stringify(opzioni.corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });

  const grezzo = await risposta.text();
  let dato: Record<string, unknown> | Array<Record<string, unknown>> = {};
  try {
    dato = JSON.parse(grezzo);
  } catch {
    /**
     * Non e' JSON: quasi sempre e' la pagina di errore del server o una
     * schermata di un plugin di sicurezza. Il testo grezzo e' l'unica cosa
     * utile per capirlo, quindi va nel messaggio invece di essere buttato.
     */
    throw new Error(`WordPress ha risposto qualcosa che non e' JSON (HTTP ${risposta.status}): ${grezzo.slice(0, 200)}`);
  }

  return { stato: risposta.status, dato, grezzo };
}

export interface EsitoProvaWordPress {
  ok: boolean;
  /** Chi risulta di essere, se le credenziali funzionano. */
  utente?: string;
  /** Se puo' davvero pubblicare, o e' un utente senza i permessi. */
  puoPubblicare?: boolean;
  errore?: string;
}

/**
 * Prova le credenziali PRIMA che servano.
 *
 * Si chiede a WordPress "chi sono io": se risponde, la REST API e' raggiungibile,
 * l'header Authorization e' arrivato fino a PHP, e le credenziali valgono. Sono
 * le tre cose che possono essere rotte, e le distingue tutte in una richiesta.
 */
export async function provaWordPress(config: ConfigSito): Promise<EsitoProvaWordPress> {
  try {
    const { stato, dato } = await chiamaWordPress(config, '/users/me?context=edit');
    if (stato === 401 || stato === 403) {
      const codice = String((dato as Record<string, unknown>).code ?? '');
      return {
        ok: false,
        errore:
          codice === 'rest_not_logged_in' || codice === 'incorrect_password'
            ? 'Credenziali rifiutate. Se sei sicuro che siano giuste, l’hosting sta togliendo l’header Authorization prima di PHP: succede su Apache senza la riga CGIPassAuth.'
            : `WordPress ha risposto ${stato}: ${String((dato as Record<string, unknown>).message ?? '')}`,
      };
    }
    if (stato >= 400) {
      return { ok: false, errore: `WordPress ha risposto ${stato}: ${String((dato as Record<string, unknown>).message ?? '')}` };
    }

    const utente = dato as Record<string, unknown>;
    // `capabilities` arriva solo con context=edit, cioe' solo se l'utente ha
    // davvero i permessi per leggersi: e' gia' meta' risposta.
    const capacita = (utente.capabilities ?? {}) as Record<string, boolean>;
    return {
      ok: true,
      utente: String(utente.name ?? utente.slug ?? config.wp_utente ?? ''),
      puoPubblicare: Boolean(capacita.publish_posts ?? capacita.edit_posts),
    };
  } catch (errore: unknown) {
    return { ok: false, errore: errore instanceof Error ? errore.message : String(errore) };
  }
}

/**
 * Pubblica (o aggiorna) l'articolo dentro il WordPress del cliente.
 *
 * ⚠️ LO SLUG RESTA LA CHIAVE, come per i siti nostri: prima si cerca se
 * quell'articolo c'e' gia', e se c'e' si aggiorna quello. Senza questo passo,
 * correggere una virgola e ripubblicare creerebbe un secondo post che fa
 * concorrenza al primo sulla stessa ricerca — e su WordPress il doppione lo
 * scopre il cliente, nella sua bacheca, prima di noi.
 *
 * `status: 'publish'` e' voluto: la catena di Wesion ha gia' un'approvazione
 * umana prima di arrivare qui, e lasciare l'articolo in bozza dentro WordPress
 * vorrebbe dire chiedere al cliente di approvare due volte la stessa cosa.
 */
export async function pubblicaArticoloWordPress(
  config: ConfigSito,
  articolo: ArticoloDaPubblicare
): Promise<{ url: string | null; risposta: Record<string, unknown> }> {
  const slug = String(articolo.slug ?? '').trim().toLowerCase();
  if (!slug) throw new Error('senza slug non si puo’ riconoscere un articolo gia’ pubblicato');

  // WordPress vuole HTML. Il generatore produce testo semplice con gli a capo
  // (regola 2 di `articolo.ts`), quindi i paragrafi si fanno qui: mandarglielo
  // piatto darebbe un muro di testo di 600 parole senza un solo <p>.
  const corpoHtml = String(articolo.corpo ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`)
    .join('\n');

  const contenuto = {
    title: articolo.titolo,
    slug,
    content: corpoHtml,
    excerpt: articolo.sommario ?? '',
    status: 'publish',
  };

  const esistenti = await chiamaWordPress(config, `/posts?slug=${encodeURIComponent(slug)}&status=any&context=edit`);
  const trovato = Array.isArray(esistenti.dato) ? esistenti.dato[0] : null;

  const esito = trovato?.id
    ? await chiamaWordPress(config, `/posts/${trovato.id}`, { metodo: 'POST', corpo: contenuto })
    : await chiamaWordPress(config, '/posts', { metodo: 'POST', corpo: contenuto });

  if (esito.stato >= 400) {
    const messaggio = String((esito.dato as Record<string, unknown>).message ?? esito.grezzo.slice(0, 200));
    throw new Error(`WordPress ha rifiutato l’articolo (HTTP ${esito.stato}): ${messaggio}`);
  }

  const post = esito.dato as Record<string, unknown>;
  return { url: (post.link as string) ?? null, risposta: { id: post.id, stato: post.status, link: post.link } };
}

/**
 * Rimette il menù precedente.
 *
 * Lo storico vero ce l'ha il sito, non noi: e' lui che sa cosa mostrava prima.
 * Noi teniamo comunque uno `snapshot` di quello che abbiamo pubblicato, ma
 * serve a rispondere in dashboard alla domanda "cosa gli abbiamo mandato il
 * giorno tale", non a ricostruire la sua pagina.
 */
export async function ripristinaMenu(config: ConfigSito): Promise<{ ripristinato: boolean }> {
  const esito = await chiama(config.site_menu_url, 'x-menu-secret', config.site_secret, { action: 'restore' });
  return { ripristinato: Boolean(esito.restored ?? esito.ripristinato) };
}
