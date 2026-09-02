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

/**
 * I bottoni che Google mette sotto un post, con il nome che si legge davvero
 * nel suo pannello.
 *
 * ⚠️ `CALL` NON VUOLE UN URL: usa il numero della scheda. Passargliene uno fa
 * fallire la chiamata, ed e' l'unico della lista che si comporta cosi'.
 */
export const AZIONI_BOTTONE = {
  LEARN_MORE: 'Scopri di più',
  BOOK: 'Prenota',
  ORDER: 'Ordina online',
  SHOP: 'Acquista',
  SIGN_UP: 'Iscriviti',
  CALL: 'Chiama ora',
} as const;

export type AzioneBottone = keyof typeof AZIONI_BOTTONE;

/** Vero per le azioni che pretendono un indirizzo. */
export const VUOLE_URL = (a: string): boolean => a !== 'CALL';

export interface PostGoogle {
  accountId: string;
  locationId: string;
  testo: string;
  urlImmagine?: string | null;
  /**
   * Il bottone sotto il post. Assente = nessun bottone, che e' quello che
   * facevamo sempre prima del 01/09/2026 senza averlo deciso: `pubblicaPost`
   * sapeva metterlo, ma glielo passava solo il menu del giorno. I diciassette
   * post di un piano uscivano tutti senza, cioe' senza niente da cliccare.
   */
  azioneBottone?: AzioneBottone | null;
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
  /**
   * Il bottone, se richiesto.
   *
   * `CALL` e' l'unico che NON vuole un url: Google usa il numero della scheda,
   * e passargliene uno fa fallire la chiamata. Tutti gli altri senza url non
   * hanno senso — un "Prenota" che non porta da nessuna parte e' peggio di
   * nessun bottone — quindi in quel caso non si mette niente.
   */
  const azione = post.azioneBottone ?? (post.urlBottone ? 'LEARN_MORE' : null);
  if (azione === 'CALL') {
    corpo.callToAction = { actionType: 'CALL' };
  } else if (azione && post.urlBottone) {
    corpo.callToAction = { actionType: azione, url: post.urlBottone };
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

/** Quello che Google sa del posto, e che noi ricopiavamo a mano. */
export interface AnagraficaScheda {
  titolo: string;
  place_id: string;
  maps_url: string;
  sito: string;
  telefono: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  categoria: string;
  /** `true` se la scheda è rivendicata da qualcuno (Voice of Merchant). */
  rivendicata: boolean;
}

/**
 * I dati anagrafici di una scheda Google, per non ricopiarli a mano.
 *
 * ⚠️ NASCE DA UNA DOMANDA GIUSTA (02/09/2026): «URL di Maps e Place ID, dove
 * cavolo le trovo?». La risposta era: sul sito degli sviluppatori di Google,
 * con un cercatore di Place ID, incollando e sperando di non sbagliare riga.
 * Ma quei dati Google ce li stava già dando — bastava chiedere `metadata`
 * nella `readMask`, un campo in più su una chiamata che facevamo già.
 *
 * Un dato che si può leggere non si fa ricopiare a una persona: ricopiare a
 * mano un `ChIJCz7Caq7ZhkcRhFP5-SRLuq4` è solo un modo lento di sbagliarlo, e
 * il Place ID è L'IDENTITÀ dell'azienda in tabella — sbagliarlo non dà errore,
 * crea un doppione.
 *
 * NON è la stessa cosa del `locationId`: quello è l'id interno di Google
 * Business Profile (`12152690749846843306`), il Place ID è `ChIJ...`. Sono due
 * numeri diversi dello stesso posto, e confonderli costa un pomeriggio.
 */
export async function leggiSchedaGoogle(locationId: string): Promise<AnagraficaScheda> {
  const token = await tokenAccesso();
  const campi =
    'name,title,metadata,storefrontAddress,websiteUri,phoneNumbers,categories';
  const risposta = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}?readMask=${campi}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!risposta.ok) {
    throw new Error(`Scheda Google non leggibile: ${(await risposta.text()).slice(0, 200)}`);
  }

  const d = await risposta.json();
  const indirizzo = d.storefrontAddress ?? {};
  return {
    titolo: d.title || '',
    place_id: d.metadata?.placeId || '',
    maps_url: d.metadata?.mapsUri || '',
    sito: d.websiteUri || '',
    telefono: d.phoneNumbers?.primaryPhone || '',
    // `addressLines` è un elenco: Google ci mette via e civico separati quando
    // il posto li ha separati, e una riga sola quando no.
    indirizzo: (indirizzo.addressLines ?? []).join(', '),
    cap: indirizzo.postalCode || '',
    citta: indirizzo.locality || '',
    provincia: indirizzo.administrativeArea || '',
    categoria: d.categories?.primaryCategory?.displayName || '',
    rivendicata: d.metadata?.hasVoiceOfMerchant === true,
  };
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
