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

/**
 * Come sta ADESSO un post che abbiamo gia' mandato.
 *
 * ⚠️ ESISTE PERCHE' "ACCETTATO" NON VUOL DIRE "ONLINE". `pubblicaPost` torna 200
 * con `state: PROCESSING`: Google lo revisiona dopo, e puo' respingerlo senza
 * dirlo a nessuno. Senza questa lettura, una riga scritta `esito='ok'` al
 * momento dell'invio resta "uscito" per sempre, anche se sulla scheda del
 * cliente non c'e' piu' niente.
 *
 * `null` quando Google risponde 404: il post non c'e' piu'. E' una risposta,
 * non un errore — chi chiama deve poterla distinguere da "non ho potuto
 * chiedere", che invece lancia.
 */
export async function statoPost(nome: string): Promise<{ stato: string } | null> {
  const token = await tokenAccesso();
  const risposta = await fetch(`https://mybusiness.googleapis.com/v4/${nome}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });

  if (risposta.status === 404) return null;
  if (!risposta.ok) {
    throw new Error(`Google API ${risposta.status}: ${(await risposta.text()).slice(0, 200)}`);
  }

  const dato = (await risposta.json()) as { state?: string };
  // Uno stato vuoto non e' "sconosciuto per sempre": e' una risposta che non
  // sappiamo leggere, e va detto invece di scriverci sopra "LIVE".
  return { stato: String(dato.state || 'SCONOSCIUTO') };
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

/**
 * La descrizione che il cliente ha scritto di sé sulla propria scheda.
 *
 * È la fonte migliore che esista per capire come parla: sono parole SUE, già
 * pubbliche, già scelte da lui. Meglio del sito, che quasi sempre l'ha scritto
 * un'agenzia e ha la voce dell'agenzia.
 */
export async function leggiProfiloGoogle(
  locationId: string
): Promise<{ descrizione: string; titolo: string; categoria: string }> {
  const token = await tokenAccesso();
  const risposta = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}?readMask=title,profile,categories`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!risposta.ok) throw new Error(`Profilo scheda non leggibile: ${(await risposta.text()).slice(0, 200)}`);

  const dati = await risposta.json();
  return {
    descrizione: dati.profile?.description || '',
    titolo: dati.title || '',
    categoria: dati.categories?.primaryCategory?.displayName || '',
  };
}

export interface RecensioneGoogle {
  stelle: number;
  testo: string;
}

/**
 * Le recensioni con del testo dentro.
 *
 * ⚠️ SONO L'UNICA FONTE CHE NON HA SCRITTO IL CLIENTE. Tutto il resto — sito,
 * descrizione, materiale incollato — è vetrina: dice quello che vorrebbe
 * sembrare. Le recensioni le scrive chi ha pagato, quindi quello che ci si
 * ripete dentro è verificato da terzi e si può usare senza chiedere conferma.
 *
 * Quelle senza testo si scartano: una stella e basta non dice cosa apprezzano.
 */
export async function leggiRecensioni(
  accountId: string,
  locationId: string,
  quante = 50
): Promise<RecensioneGoogle[]> {
  const token = await tokenAccesso();
  const risposta = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=${quante}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!risposta.ok) throw new Error(`Recensioni non leggibili: ${(await risposta.text()).slice(0, 200)}`);

  const STELLE: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const { reviews = [] } = await risposta.json();

  return (reviews as Array<{ starRating?: string; comment?: string }>)
    .map((r) => ({ stelle: STELLE[r.starRating ?? ''] || 0, testo: String(r.comment || '').trim() }))
    .filter((r) => r.testo.length > 0);
}
