/**
 * Lo scraper di Google Maps, portato da Python a Node.
 *
 * PERCHE' IN DUE TEMPI E NON IN UNO. La versione Python faceva
 * `wait_for_finish` con un timeout di venti minuti: dentro uno script da riga
 * di comando va benissimo, dentro una richiesta HTTP no — la richiesta muore
 * molto prima e il lavoro di Apify resta orfano, pagato e mai raccolto.
 *
 * Quindi: si avvia, si salva `apify_run_id` sulla campagna (la colonna esiste
 * gia' nello schema, e questo e' il motivo per cui esiste), e la raccolta e' una
 * seconda chiamata che si puo' fare quando si vuole. Anche il giorno dopo: il
 * dataset su Apify non scade insieme alla nostra pagina.
 *
 * L'IDENTITA' E' IL PLACE ID. La versione Python deduplicava su
 * (nome, citta', telefono) e il router su (telefono): due chiavi che
 * disaccordavano in silenzio. Un locale con due numeri era un lead di la' e due
 * di qua; due locali con lo stesso centralino erano due di la' e UNO SOLO di
 * qua, col secondo che sovrascriveva il primo. Qui l'unica chiave e' il posto.
 */

import { query } from './db';
import { creaSlug, estraiCap, estraiPlaceId, normalizzaSito, normalizzaTelefono } from './normalizza';

const BASE = 'https://api.apify.com/v2';
const ATTORE = (process.env.APIFY_ACTOR_ID || 'compass~crawler-google-places').replace('/', '~');

function chiave(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error('APIFY_API_TOKEN mancante: lo scraper non può partire.');
  return t;
}

export interface AvvioCampagna {
  nome: string;
  categoria: string;
  citta: string[];
  quanti: number;
}

/**
 * Avvia la ricerca su Apify e registra la campagna.
 *
 * Una riga di campagna nasce SEMPRE, anche se poi la raccolta non si fara' mai:
 * senza, un run avviato e mai raccolto e' denaro speso di cui non resta traccia
 * da nessuna parte.
 */
export async function avviaCampagna(dati: AvvioCampagna): Promise<{ campagnaId: number; runId: string }> {
  const risposta = await fetch(`${BASE}/acts/${ATTORE}/runs?token=${chiave()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: [dati.categoria],
      locationQuery: dati.citta.join(', '),
      maxCrawledPlacesPerSearch: dati.quanti,
      language: 'it',
      // Recensioni e immagini moltiplicano il costo del run e non entrano in
      // nessuna delle nostre tabelle: quello che serve alla voce del cliente
      // arriva dai fatti, non da qui.
      includeReviews: false,
      includeImages: false,
    }),
  });

  if (!risposta.ok) {
    throw new Error(`Apify ha rifiutato l'avvio (HTTP ${risposta.status}): ${(await risposta.text()).slice(0, 200)}`);
  }

  const dato = (await risposta.json())?.data ?? {};
  const runId = dato.id;
  if (!runId) throw new Error('Apify non ha restituito un id di run.');

  const [campagna] = await query<{ id: number }>(
    `INSERT INTO wesion.campagna (nome, categoria, citta, apify_run_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nome) DO UPDATE SET apify_run_id = EXCLUDED.apify_run_id
     RETURNING id`,
    [dati.nome, dati.categoria, dati.citta, runId]
  );

  return { campagnaId: campagna.id, runId };
}

export interface StatoRun {
  stato: string;
  finito: boolean;
  riuscito: boolean;
  datasetId: string | null;
}

export async function statoRun(runId: string): Promise<StatoRun> {
  const risposta = await fetch(`${BASE}/actor-runs/${runId}?token=${chiave()}`);
  if (!risposta.ok) throw new Error(`Apify non risponde sul run ${runId} (HTTP ${risposta.status}).`);

  const dato = (await risposta.json())?.data ?? {};
  const stato = String(dato.status || 'UNKNOWN');
  return {
    stato,
    finito: ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(stato),
    riuscito: stato === 'SUCCEEDED',
    datasetId: dato.defaultDatasetId ?? null,
  };
}

/** Un risultato grezzo di Apify: i nomi dei campi cambiano fra versioni dell'attore. */
type Grezzo = Record<string, unknown>;

const testo = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Il primo campo non vuoto fra quelli che l'attore potrebbe aver usato. */
function primo(item: Grezzo, ...chiavi: string[]): string {
  for (const c of chiavi) {
    const v = testo(item[c]);
    if (v) return v;
  }
  return '';
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function coordinate(item: Grezzo): { lat: number | null; lon: number | null } {
  const posizione = (item.location ?? {}) as Grezzo;
  return {
    lat: numero(item.lat ?? item.latitude ?? posizione.lat),
    lon: numero(item.lon ?? item.lng ?? item.longitude ?? posizione.lng ?? posizione.lon),
  };
}

export interface EsitoImportazione {
  letti: number;
  scartati: number;
  aziende: number;
  contatti: number;
}

/**
 * Scarica il dataset del run e lo travasa nelle tabelle.
 *
 * Idempotente per costruzione: rilanciarla sullo stesso run non crea doppioni,
 * perche' l'inserimento va in conflitto sul Place ID. Serve piu' spesso di
 * quanto sembri — la prima raccolta parte mentre il run e' ancora a meta'.
 */
export async function raccogliCampagna(campagnaId: number): Promise<EsitoImportazione> {
  const [campagna] = await query<{ apify_run_id: string | null; citta: string[] }>(
    `SELECT apify_run_id, citta FROM wesion.campagna WHERE id = $1`,
    [campagnaId]
  );
  if (!campagna) throw new Error(`campagna ${campagnaId} inesistente`);
  if (!campagna.apify_run_id) throw new Error('Questa campagna non ha un run di Apify da raccogliere.');

  const stato = await statoRun(campagna.apify_run_id);
  if (!stato.finito) throw new Error(`Il run è ancora in corso (${stato.stato}): riprova fra un po'.`);
  if (!stato.riuscito) throw new Error(`Il run è finito male (${stato.stato}): non c'è niente da raccogliere.`);
  if (!stato.datasetId) throw new Error('Il run è riuscito ma non ha un dataset.');

  const risposta = await fetch(`${BASE}/datasets/${stato.datasetId}/items?token=${chiave()}&clean=true&format=json`);
  if (!risposta.ok) throw new Error(`Non si riesce a leggere il dataset (HTTP ${risposta.status}).`);

  const items = await risposta.json();
  if (!Array.isArray(items)) throw new Error('Il dataset non è una lista.');

  const esito: EsitoImportazione = { letti: items.length, scartati: 0, aziende: 0, contatti: 0 };
  const cittaRipiego = campagna.citta?.[0] ?? null;

  for (const grezzo of items as Grezzo[]) {
    const nome = primo(grezzo, 'name', 'title', 'placeName');
    const placeId = estraiPlaceId(grezzo);

    // Senza nome non c'e' niente da salvare. Senza Place ID si salva lo stesso,
    // ma l'identita' ricade sullo slug: e' il caso dei risultati parziali, che
    // e' meglio avere sporchi che non avere.
    if (!nome) {
      esito.scartati++;
      continue;
    }

    const indirizzo = primo(grezzo, 'address', 'fullAddress', 'street');
    const citta = primo(grezzo, 'city') || cittaRipiego || '';
    const mapsUrl = primo(grezzo, 'googleMapsUrl', 'url', 'placeUrl', 'mapsUrl');
    const { lat, lon } = coordinate(grezzo);

    const [azienda] = await query<{ id: number }>(
      `INSERT INTO wesion.azienda
         (slug, nome, place_id, categoria, indirizzo, cap, citta, provincia, regione,
          paese, lat, lon, maps_url, campagna_id, fonte, raw_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'IT',$10,$11,$12,$13,'apify_gmaps',$14)
       ON CONFLICT (${placeId ? 'place_id' : 'slug'}) DO UPDATE
         SET nome          = EXCLUDED.nome,
             categoria     = COALESCE(EXCLUDED.categoria, wesion.azienda.categoria),
             indirizzo     = COALESCE(EXCLUDED.indirizzo, wesion.azienda.indirizzo),
             maps_url      = COALESCE(EXCLUDED.maps_url, wesion.azienda.maps_url),
             raw_json      = EXCLUDED.raw_json,
             aggiornata_at = now()
       RETURNING id`,
      [
        creaSlug(nome, citta),
        nome,
        placeId,
        primo(grezzo, 'category', 'categoryName', 'primaryCategory') || null,
        indirizzo || null,
        estraiCap(indirizzo),
        citta || null,
        primo(grezzo, 'stateCode', 'province') || null,
        primo(grezzo, 'state', 'region') || null,
        lat,
        lon,
        mapsUrl || null,
        campagnaId,
        JSON.stringify(grezzo),
      ]
    );
    esito.aziende++;

    /**
     * I contatti sono RIGHE, non colonne. Costa una JOIN e toglie di mezzo tre
     * casi speciali: un locale puo' avere il fisso, il cellulare del titolare e
     * il telefono del figlio, e il numero smette di essere l'identita'
     * dell'azienda.
     */
    const telefono = primo(grezzo, 'phone', 'phoneNumber', 'internationalPhoneNumber');
    const sito = primo(grezzo, 'website', 'webSite', 'websiteUrl');
    const contatti: Array<[string, string, string | null]> = [
      ['telefono', telefono, normalizzaTelefono(telefono)],
      ['email', primo(grezzo, 'email', 'contactEmail'), primo(grezzo, 'email', 'contactEmail').toLowerCase()],
      ['sito', sito, normalizzaSito(sito)],
    ];

    for (const [tipo, valore, normalizzato] of contatti) {
      if (!valore || !normalizzato) continue;
      const righe = await query(
        `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (azienda_id, tipo, normalizzato) DO NOTHING
         RETURNING id`,
        [azienda.id, tipo, valore, normalizzato]
      );
      esito.contatti += righe.length;
    }
  }

  return esito;
}
