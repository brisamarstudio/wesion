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
}

async function chiama(config: ConfigSito, corpo: unknown): Promise<Record<string, unknown>> {
  if (!config.site_menu_url) throw new Error('il servizio non ha site_menu_url configurato');

  const risposta = await fetch(config.site_menu_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-menu-secret': config.site_secret || '',
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(20000),
  });

  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`sito ${risposta.status}: ${testo.slice(0, 200)}`);
  return JSON.parse(testo || '{}');
}

/** Sostituisce il menù pubblicato sul sito. */
export async function pubblicaMenu(config: ConfigSito, piatti: unknown[]): Promise<Record<string, unknown>> {
  return chiama(config, { action: 'replace', items: piatti });
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
  const esito = await chiama(config, { action: 'restore' });
  return { ripristinato: Boolean(esito.restored ?? esito.ripristinato) };
}
