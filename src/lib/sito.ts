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
  const risposta = await chiama(config.site_blog_url, 'x-blog-secret', config.site_blog_secret, {
    action: 'pubblica',
    articolo,
  });
  // Il sito risponde con l'URL vero dell'articolo: e' quello che finisce in
  // `pubblicazione.url_risultato`, cosi' dalla consolle ci si clicca sopra.
  const url = (risposta.url ?? risposta.link ?? null) as string | null;
  return { url, risposta };
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
