/**
 * Quali pagine Google conosce davvero, e quali no.
 *
 * ⚠️ È LA DOMANDA PIÙ CONCRETA DI TUTTO L'AUDIT, ed è rimasta senza risposta
 * fino al 03/09/2026. Una pagina non indicizzata non è "posizionata male": non
 * esiste. Nessuno schema JSON-LD, nessun `llms.txt`, nessun meta tag la
 * rimette in gara — e nessuno dei controlli che facevamo prima se ne
 * accorgeva, perché guardavano tutti il CODICE del sito e mai cosa Google
 * avesse davvero visto.
 *
 * Trovato su mywebby.it, primo giro: 5 pagine su 17 «URL is unknown to
 * Google», fra cui una pagina servizio da 1.500€ e il portfolio. Tutte vive,
 * HTTP 200, HTML prerenderizzato corretto. La causa non era il sito: Google
 * non riscaricava la sitemap dal 20 giugno, e le pagine aggiunte dopo non le
 * aveva mai viste.
 *
 * ⚠️ LEGGE E BASTA, non chiede l'indicizzazione. L'API di Google per chiedere
 * l'indicizzazione (Indexing API) è ufficialmente ammessa solo per JobPosting
 * e BroadcastEvent: usarla per pagine normali è fuori dai termini. La strada
 * vera è il bottone «Richiedi indicizzazione» nella console, premuto da una
 * persona — di nuovo la regola dell'ultimo bottone, stavolta perché è Google
 * a pretenderlo.
 */
import { tokenAccessoGSC } from './search-console';

export interface EsitoUrl {
  url: string;
  /** PASS = indicizzata. NEUTRAL/FAIL = no, e `stato` dice perché. */
  verdetto: string;
  /** Il testo di Google: "Submitted and indexed", "URL is unknown to Google"... */
  stato: string;
  /** Quando c'è ed è diverso dall'url, Google ha scelto un'altra pagina come originale. */
  canonicalDiGoogle: string | null;
}

export interface EsitoIndicizzazione {
  totali: number;
  indicizzate: number;
  fuori: EsitoUrl[];
  /** Quando Google ha scaricato la sitemap l'ultima volta, e quante URL conteneva allora. */
  sitemap: { scaricataIl: string | null; urlDichiarate: number | null } | null;
}

/** Gli URL dichiarati dalla sitemap del sito — la lista che Google dovrebbe conoscere. */
export async function leggiSitemap(urlSitemap: string, massimo = 50): Promise<string[]> {
  const risposta = await fetch(urlSitemap, { signal: AbortSignal.timeout(20000) });
  if (!risposta.ok) throw new Error(`sitemap non raggiungibile (HTTP ${risposta.status}): ${urlSitemap}`);
  const xml = await risposta.text();
  const trovati = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return trovati.slice(0, massimo);
}

/**
 * Cosa sa Google di questa sitemap: quando l'ha scaricata e quante URL
 * conteneva allora. Se la data è vecchia e il numero è più basso di quello
 * vero, le pagine nuove non le ha mai viste — ed è esattamente il guasto
 * trovato su mywebby.it.
 */
async function statoSitemap(proprieta: string): Promise<EsitoIndicizzazione['sitemap']> {
  const token = await tokenAccessoGSC();
  const risposta = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(proprieta)}/sitemaps`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
  );
  if (!risposta.ok) return null;
  const dati = (await risposta.json()) as {
    sitemap?: Array<{ lastDownloaded?: string; contents?: Array<{ submitted?: string }> }>;
  };
  const prima = dati.sitemap?.[0];
  if (!prima) return null;
  return {
    scaricataIl: prima.lastDownloaded ?? null,
    urlDichiarate: prima.contents?.[0]?.submitted ? Number(prima.contents[0].submitted) : null,
  };
}

async function ispeziona(proprieta: string, url: string): Promise<EsitoUrl> {
  const token = await tokenAccessoGSC();
  const risposta = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: proprieta }),
    signal: AbortSignal.timeout(30000),
  });
  if (!risposta.ok) throw new Error(`ispezione fallita (HTTP ${risposta.status}) su ${url}`);
  const dati = (await risposta.json()) as {
    inspectionResult?: {
      indexStatusResult?: { verdict?: string; coverageState?: string; googleCanonical?: string };
    };
  };
  const r = dati.inspectionResult?.indexStatusResult ?? {};
  const canonical = r.googleCanonical ?? null;
  return {
    url,
    verdetto: r.verdict ?? 'SCONOSCIUTO',
    stato: r.coverageState ?? 'nessuna risposta da Google',
    canonicalDiGoogle: canonical && canonical !== url ? canonical : null,
  };
}

/**
 * Il giro completo: sitemap -> ispezione di ogni URL -> chi è rimasto fuori.
 *
 * ⚠️ UNA ALLA VOLTA, e con un tetto. La quota di ispezione è 2.000 al giorno
 * per sito (600 al minuto): con `massimo` a 50 un audit non la intacca, ma un
 * sito da mille pagine mandato in parallelo la brucerebbe in un colpo e
 * lascerebbe fuori tutti gli altri clienti fino a domani.
 */
export async function controllaIndicizzazione(
  proprieta: string,
  urlSitemap: string,
  massimo = 50
): Promise<EsitoIndicizzazione> {
  const url = await leggiSitemap(urlSitemap, massimo);
  const sitemap = await statoSitemap(proprieta).catch(() => null);

  const esiti: EsitoUrl[] = [];
  for (const u of url) {
    try {
      esiti.push(await ispeziona(proprieta, u));
    } catch {
      // Un URL che non si riesce a ispezionare non deve far cadere tutto il
      // giro: si salta, e il conto dei totali lo dice da solo.
    }
  }

  return {
    totali: esiti.length,
    indicizzate: esiti.filter((e) => e.verdetto === 'PASS').length,
    fuori: esiti.filter((e) => e.verdetto !== 'PASS'),
    sitemap,
  };
}

/** Il pezzo da leggere in una PR: solo quello che non va, e cosa farci. */
export function riassumiIndicizzazione(esito: EsitoIndicizzazione): string {
  const righe: string[] = [`Indicizzazione: ${esito.indicizzate} pagine su ${esito.totali} sono su Google.`];

  if (esito.sitemap?.scaricataIl) {
    const giorni = Math.floor((Date.now() - new Date(esito.sitemap.scaricataIl).getTime()) / 86400000);
    const quante = esito.sitemap.urlDichiarate;
    if (giorni > 30 || (quante !== null && quante < esito.totali)) {
      righe.push(
        `⚠️ Google ha scaricato la sitemap ${giorni} giorni fa` +
          (quante !== null ? `, e allora conteneva ${quante} URL contro le ${esito.totali} di oggi` : '') +
          `. Le pagine aggiunte dopo non le ha mai viste: reinvia la sitemap da Search Console.`
      );
    }
  }

  if (esito.fuori.length) {
    righe.push(`\nPagine che Google NON ha indicizzato (${esito.fuori.length}):`);
    for (const f of esito.fuori) {
      righe.push(`  - ${f.url}\n    ${f.stato}${f.canonicalDiGoogle ? ` (Google preferisce ${f.canonicalDiGoogle})` : ''}`);
    }
    righe.push(
      `\nUna pagina non indicizzata non è posizionata male: non è in gara. ` +
        `Si chiede l'indicizzazione a mano dalla barra in alto di Search Console — l'API di Google per farlo da codice non è ammessa per le pagine normali.`
    );
  }

  return righe.join('\n');
}
