/**
 * Google Business Profile — pubblicazione dei post sulle schede dei clienti.
 *
 * Il refresh token e' UNO d'agenzia e copre tutte le schede: sta solo qui, non
 * nei progetti Cloudflare dei singoli siti. Ogni cliente porta con se' soltanto
 * il proprio account/location id, che non sono segreti.
 *
 * Nessun import relativo, apposta: lo caricano sia Next sia il router. Vedi la
 * nota in cima a `waha.ts`.
 */

let tokenInCache: string | null = null;
let scadeA = 0;

/**
 * Il token d'accesso, tenuto in cache finche' vale.
 *
 * Un minuto di margine sulla scadenza dichiarata: chiedere un token nuovo costa
 * poco, usarne uno scaduto costa una pubblicazione persa e un 401 da capire.
 */
export async function tokenAccesso(): Promise<string> {
  const adesso = Date.now();
  if (tokenInCache && adesso < scadeA) return tokenInCache;

  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
    throw new Error('Credenziali GBP mancanti: senza, nessun post esce su nessuna scheda.');
  }

  const risposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GBP_CLIENT_ID,
      client_secret: GBP_CLIENT_SECRET,
      refresh_token: GBP_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!risposta.ok) throw new Error(`OAuth Google: ${(await risposta.text()).slice(0, 300)}`);

  const dati = await risposta.json();
  tokenInCache = dati.access_token;
  scadeA = adesso + Math.max(0, (dati.expires_in || 3600) - 60) * 1000;
  return tokenInCache!;
}

export interface PostGoogle {
  accountId: string;
  locationId: string;
  testo: string;
  urlImmagine?: string | null;
  urlBottone?: string | null;
}

/**
 * Rete di sicurezza, non la regola.
 *
 * La REGOLA sta in `controlloTesto.ts`, che con lo stesso numero accende un
 * avviso all'operatore mentre puo' ancora accorciare il testo. Quella e' la
 * copia che comanda: sta in un file senza dipendenze, quindi la legge anche il
 * browser dentro la consolle.
 *
 * Qui il taglio serve solo a non far fallire la chiamata se un testo arriva
 * lungo lo stesso — da una rotta che non passa dal controllo, per esempio. Un
 * post accorciato e' meglio di un post non pubblicato, ma e' comunque un
 * ripiego: se scatta, e' sfuggito qualcosa prima.
 */
const TAGLIO_DI_SICUREZZA = 1500;

export async function pubblicaPost(post: PostGoogle): Promise<unknown> {
  const token = await tokenAccesso();

  const corpo: Record<string, unknown> = {
    languageCode: 'it',
    summary: String(post.testo || '').slice(0, TAGLIO_DI_SICUREZZA),
    topicType: 'STANDARD',
  };

  if (post.urlImmagine && post.urlImmagine.startsWith('http')) {
    corpo.media = [{ mediaFormat: 'PHOTO', sourceUrl: post.urlImmagine }];
  }
  if (post.urlBottone) {
    corpo.callToAction = { actionType: 'LEARN_MORE', url: post.urlBottone };
  }

  const risposta = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${post.accountId}/locations/${post.locationId}/localPosts`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }
  );

  if (!risposta.ok) throw new Error(`Google API ${risposta.status}: ${(await risposta.text()).slice(0, 300)}`);
  return risposta.json();
}

export interface SchedaGoogle {
  accountId: string;
  locationId: string;
  titolo: string;
  codice: string;
}

/**
 * Elenca tutte le schede dell'agenzia: serve per compilare i servizi dei clienti.
 *
 * ⚠️ `split('/')[1]` — l'id sta nel SECONDO pezzo di `accounts/123` e di
 * `locations/456`. Il 21/07/2026 una copia dimenticata di questa funzione
 * leggeva `[3]` e scriveva in tabella pezzi di stringa o `undefined`. Un id
 * sbagliato non da' fastidio a nessuno finche' non si pubblica, e allora Google
 * risponde 404 settimane dopo l'errore vero, su un cliente a caso. La spia
 * `id-google-malformati` esiste per accorgersene prima.
 */
export async function elencaSchede(): Promise<SchedaGoogle[]> {
  const token = await tokenAccesso();
  const testa = { Authorization: `Bearer ${token}` };

  const rispAccount = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: testa,
  });
  if (!rispAccount.ok) throw new Error(`Account Google: ${(await rispAccount.text()).slice(0, 200)}`);
  const { accounts = [] } = await rispAccount.json();

  const fuori: SchedaGoogle[] = [];
  for (const account of accounts) {
    const accountId = String(account.name).split('/')[1];
    const rispSchede = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?readMask=name,title,storeCode&pageSize=100`,
      { headers: testa }
    );
    if (!rispSchede.ok) continue;
    const { locations = [] } = await rispSchede.json();
    for (const scheda of locations) {
      fuori.push({
        accountId,
        locationId: String(scheda.name).split('/')[1],
        titolo: scheda.title || '',
        codice: scheda.storeCode || '',
      });
    }
  }
  return fuori;
}
