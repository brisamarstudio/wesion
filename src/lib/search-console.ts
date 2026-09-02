/**
 * Google Search Console — il rendimento vero di un sito (query, clic,
 * impressioni, posizione), per l'audit SEO/GEO automatico.
 *
 * ⚠️ TOKEN SEPARATO DA GBP, e non per pignoleria. `GBP_REFRESH_TOKEN` è stato
 * autorizzato una volta con lo scope `business.manage` soltanto: aggiungerne
 * uno nuovo avrebbe richiesto un consenso da rifare, col rischio di rompere
 * quel token mentre il router pubblica per sei clienti veri. Meglio un secondo
 * token, `GSC_REFRESH_TOKEN`, ottenuto una tantum con Google OAuth Playground
 * — vedi STATO.md per la procedura.
 *
 * Nessun import relativo, stesso motivo di `gbp.ts`: se un giorno serve anche
 * al router, deve potersi caricare da lì senza toccare niente.
 */

let tokenInCache: string | null = null;
let scadeA = 0;

export async function tokenAccessoGSC(): Promise<string> {
  const adesso = Date.now();
  if (tokenInCache && adesso < scadeA) return tokenInCache;

  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GSC_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
    throw new Error(
      'Credenziali Search Console mancanti (serve GSC_REFRESH_TOKEN, oltre a GBP_CLIENT_ID/SECRET già in uso per GBP).'
    );
  }

  const risposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GBP_CLIENT_ID,
      client_secret: GBP_CLIENT_SECRET,
      refresh_token: GSC_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!risposta.ok) {
    throw new Error(`OAuth Google (Search Console): ${(await risposta.text()).slice(0, 300)}`);
  }

  const dati = await risposta.json();
  tokenInCache = dati.access_token;
  scadeA = adesso + Math.max(0, (dati.expires_in || 3600) - 60) * 1000;
  return tokenInCache!;
}

export interface RigaRendimento {
  chiavi: string[];
  clic: number;
  impressioni: number;
  ctr: number;
  posizione: number;
}

/**
 * Il rendimento degli ultimi `giorni` giorni.
 *
 * ⚠️ Search Console ritarda: gli ultimi 2-3 giorni sono spesso incompleti o
 * assenti del tutto — non è un guasto della chiamata, è così che risponde
 * l'API. Chi usa il risultato non deve aspettarsi "ieri".
 */
export async function rendimento(
  proprieta: string,
  giorni = 28,
  dimensione: 'query' | 'page' = 'query',
  righe = 50
): Promise<RigaRendimento[]> {
  const token = await tokenAccessoGSC();
  const fine = new Date();
  const inizio = new Date(fine.getTime() - giorni * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const risposta = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(proprieta)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: fmt(inizio),
        endDate: fmt(fine),
        dimensions: [dimensione],
        rowLimit: righe,
      }),
    }
  );

  if (!risposta.ok) throw new Error(`Search Console: ${(await risposta.text()).slice(0, 300)}`);

  const dati = (await risposta.json()) as {
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
  };

  return (dati.rows ?? []).map((r) => ({
    chiavi: r.keys ?? [],
    clic: r.clicks ?? 0,
    impressioni: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    posizione: r.position ?? 0,
  }));
}

/** Un riassunto leggibile da un prompt, non l'export completo. */
export function riassumiRendimento(perQuery: RigaRendimento[], perPagina: RigaRendimento[]): string {
  const top = (righe: RigaRendimento[], n: number) =>
    righe
      .slice(0, n)
      .map(
        (r) =>
          `- ${r.chiavi.join(' ')}: ${r.clic} clic, ${r.impressioni} impressioni, posizione media ${r.posizione.toFixed(1)}`
      )
      .join('\n');

  return [
    'Query più frequenti (ultimi 28 giorni):',
    top(perQuery, 15) || '(nessun dato)',
    '',
    'Pagine più viste:',
    top(perPagina, 10) || '(nessun dato)',
  ].join('\n');
}
