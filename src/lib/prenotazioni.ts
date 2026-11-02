/**
 * Dove va chi vuole prenotare? Il fatto che decide la telefonata a un hotel.
 *
 * ⚠️ PERCHE' ESISTE (02/11/2026). Con un hotel non si apre con «il tuo sito e'
 * vecchio»: si apre con quanto lascia a Booking. Ma il discorso regge solo se
 * e' VERO per quell'hotel. Chi ha gia' un motore di prenotazione (RoomCloud,
 * Kross, BookingExpert…) non paga il 18% su chi passa dal sito, e dirgli il
 * contrario al telefono brucia il contatto.
 *
 * ⚠️ SERVE UN BROWSER VERO, NON UN FETCH. Il primo giro, fatto scaricando
 * l'HTML, sull'Hotel del Parco di Vigevano NON ha visto niente: RoomCloud entra
 * da un iframe che uno script aggiunge dopo il caricamento. Con Chromium
 * headless (`--dump-dom`) l'iframe c'e'. Senza Chromium questo modulo NON
 * risponde «nessun motore»: risponde «non letto». Un «non so» detto come «no»
 * e' esattamente l'errore che si voleva evitare (vedi AGENTS.md: guarda prima
 * cosa gli hai messo davanti).
 *
 * Niente AI qui: domini e parole chiave, cose che si verificano aprendo il sito.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { indirizzoPubblico } from './leggiSito';
import { query } from './db';

export type TipoPrenotazione =
  | 'senza_sito' // nessun sito
  | 'portale' // il "sito" e' una pagina di un portale o di un social
  | 'manda_a_portale' // ha un sito, ma «Prenota» porta a Booking/Airbnb/Expedia
  | 'motore' // ha un motore di prenotazione suo
  | 'nessun_motore' // sito letto col browser, nessun motore e nessun portale trovato
  | 'non_letto'; // non siamo riusciti ad aprirlo

export interface EsitoPrenotazione {
  tipo: TipoPrenotazione;
  /** Il nome del motore o del portale, quando c'e'. */
  nome?: string;
  /** In che pagina l'abbiamo visto: per controllarlo in dieci secondi. */
  dove?: string;
  /** Come l'abbiamo letto: 'browser' o 'fetch'. Col fetch un motore puo' sfuggire. */
  metodo?: 'browser' | 'fetch';
}

/** Motori di prenotazione: chi li ha non paga commissioni su chi passa dal sito. */
const MOTORI: Array<[string, RegExp]> = [
  ['RoomCloud', /roomcloud\.net/i],
  ['Simple Booking', /simplebooking\.(it|travel)|simple-booking/i],
  ['Vertical Booking', /verticalbooking|vertical-booking/i],
  ['Octorate', /octorate\.com/i],
  ['BookingExpert', /bookingexpert\.it/i],
  ['Kross Booking', /krossbooking\.com|kross\.travel/i],
  ['WuBook', /wubook\.net|zakbooking/i],
  ['Scidoo', /scidoo\.com/i],
  ['5stelle', /5stelle\.it/i],
  ['Blastness', /blastness\.(com|it)/i],
  ['Ericsoft', /ericsoft\.(com|it)/i],
  ['iperbooking', /iperbooking\.(com|net|it)/i],
  ['iReservation', /ireservation\.it/i],
  ['Bookassist', /bookassist\.(com|org)/i],
  ['D-EDGE', /d-edge\.com|availpro\.com/i],
  ['SynXis', /synxis\.com|travelclick\.com/i],
  ['Cloudbeds', /cloudbeds\.com/i],
  ['Mews', /mews\.(li|com)\/distributor|app\.mews\.com/i],
  ['Beddy', /beddy\.io/i],
  ['Smoobu', /smoobu\.com/i],
  ['Lodgify', /lodgify\.com/i],
  ['HotelNetSolutions', /hotelnetsolutions/i],
  ['Passepartout', /passepartout\.(net|cloud)/i],
  ['Slope', /slope\.it/i],
  ['Hotel in Cloud', /hotelincloud\.com/i],
  ['Booking Designer', /bookingdesigner\.com/i],
  ['WebHotel', /webhotel\.it/i],
  ['VikBooking', /vikbooking/i],
  ['Avaibook', /avaibook\.com/i],
  ['Hotelinside', /hotelinside\.it/i],
  ['TeamSystem Hospitality', /hospitality\.teamsystem/i],
  ['MyWebby', /booking\.mywebby\.it/i],
];

/** Portali a commissione: se «Prenota» porta qui, ogni prenotazione costa. */
const PORTALI_A_COMMISSIONE: Array<[string, RegExp]> = [
  ['Booking.com', /booking\.com\/hotel|booking\.com\/searchresults/i],
  ['Airbnb', /airbnb\.[a-z.]+\/(rooms|h)\//i],
  ['Expedia', /expedia\.[a-z.]+\/.*hotel/i],
  ['Hotels.com', /hotels\.com\/ho/i],
];

/**
 * Host che non sono un sito proprio. Il «sito» su Maps a volte e' la pagina di
 * una guida o di un portale: per noi vale come non averlo.
 */
const HOST_NON_PROPRI: Array<[string, RegExp]> = [
  ['Booking.com', /(^|\.)booking\.com$/i],
  ['Airbnb', /(^|\.)airbnb\./i],
  ['Facebook', /(^|\.)facebook\.com$/i],
  ['Instagram', /(^|\.)instagram\.com$/i],
  ['Blogspot', /\.blogspot\./i],
  ['beb.it', /(^|\.)beb\.it$/i],
  ['Stayly', /(^|\.)stayly\.it$/i],
  ['Hotelmania', /(^|\.)hotelmania\.net$/i],
  ['Tripingguide', /(^|\.)tripingguide\.com$/i],
  ['Bed-and-breakfast.it', /(^|\.)bed-and-breakfast\.it$/i],
  ['TripAdvisor', /(^|\.)tripadvisor\./i],
  ['Expedia', /(^|\.)expedia\./i],
  ['Google', /(^|\.)(business\.site|sites\.google\.com|g\.page)$/i],
  // «hotel-ducale.org.es», «saint-martins-house-vigevano.com.es»: pagine
  // generate da terzi col nome della struttura, non un sito del titolare.
  ['un clone .es fatto da terzi', /\.(com|org|net)\.es$/i],
];

/** Categorie di Maps che sono strutture ricettive: solo per loro ha senso chiedersi del motore. */
export const RICETTIVA =
  /hotel|albergo|b&b|bed|breakfast|agriturismo|affittacamere|pensione|alloggi|resort|locanda|residence|casa vacanze|ostello|relais|motel|guest ?house|appartament/i;

// ── Lettura della pagina ─────────────────────────────────────────────────────

function percorsoChromium(): string | null {
  const candidati = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean) as string[];
  return candidati.find((c) => existsSync(c)) ?? null;
}

/** Il DOM DOPO gli script. Null se Chromium non c'e' o la pagina non si apre. */
function leggiConBrowser(url: string): Promise<string | null> {
  const chromium = percorsoChromium();
  if (!chromium) return Promise.resolve(null);
  // Un profilo usa-e-getta per ogni lettura: niente cookie che si trascinano
  // da un hotel all'altro, e due letture in parallelo non si pestano.
  const profilo = mkdtempSync(path.join(tmpdir(), 'wesion-chrome-'));
  return new Promise((risolvi) => {
    execFile(
      chromium,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio',
        `--user-data-dir=${profilo}`,
        '--virtual-time-budget=10000',
        '--dump-dom',
        url,
      ],
      { timeout: 45000, maxBuffer: 20 * 1024 * 1024 },
      (errore, stdout) => {
        try {
          rmSync(profilo, { recursive: true, force: true });
        } catch {
          /* il profilo temporaneo lo pulisce il sistema */
        }
        risolvi(errore || !stdout ? null : String(stdout));
      }
    );
  });
}

async function leggiConFetch(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Wesion/1.0)' },
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

async function leggi(url: string): Promise<{ html: string; metodo: 'browser' | 'fetch' } | null> {
  if (!indirizzoPubblico(url)) return null;
  const dalBrowser = await leggiConBrowser(url);
  if (dalBrowser) return { html: dalBrowser, metodo: 'browser' };
  const dalFetch = await leggiConFetch(url);
  return dalFetch ? { html: dalFetch, metodo: 'fetch' } : null;
}

// ── Analisi ──────────────────────────────────────────────────────────────────

/** Tutti gli indirizzi che la pagina tocca: link, iframe, script, form. */
function indirizzi(html: string, base: string): string[] {
  const fuori: string[] = [];
  for (const m of html.matchAll(/(?:href|src|action|data-src)=["']([^"'#]+)["']/gi)) {
    try {
      fuori.push(new URL(m[1].replace(/&amp;/g, '&'), base).href);
    } catch {
      /* indirizzo storto: si salta */
    }
  }
  return fuori;
}

/** I link che parlano di prenotare, col loro testo. */
function linkPrenota(html: string, base: string): string[] {
  const fuori: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    if (!/prenot|book|disponib|reserv|riserv/i.test(m[1] + ' ' + m[2])) continue;
    try {
      fuori.push(new URL(m[1].replace(/&amp;/g, '&'), base).href);
    } catch {
      /* si salta */
    }
  }
  return [...new Set(fuori)];
}

function cerca(lista: Array<[string, RegExp]>, testi: string[]): { nome: string; dove: string } | null {
  for (const t of testi) {
    for (const [nome, re] of lista) if (re.test(t)) return { nome, dove: t };
  }
  return null;
}

export async function rilevaPrenotazione(sito: string | null): Promise<EsitoPrenotazione> {
  if (!sito) return { tipo: 'senza_sito' };
  const url = /^https?:\/\//i.test(sito) ? sito : `https://${sito}`;

  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return { tipo: 'non_letto', dove: sito };
  }
  const nonProprio = HOST_NON_PROPRI.find(([, re]) => re.test(host));
  if (nonProprio) return { tipo: 'portale', nome: nonProprio[0], dove: url };

  const home = await leggi(url);
  if (!home) return { tipo: 'non_letto', dove: url };

  // 1. La home. Il motore spesso e' gia' qui (il modulo date in testata).
  const tuttiHome = indirizzi(home.html, url);
  const motoreHome = cerca(MOTORI, [...tuttiHome, home.html]);
  if (motoreHome) return { tipo: 'motore', nome: motoreHome.nome, dove: url, metodo: home.metodo };

  // 2. La pagina «Prenota» del sito stesso, se c'e'.
  const prenota = linkPrenota(home.html, url);
  const interna = prenota.find((l) => {
    try {
      return new URL(l).hostname.replace(/^www\./, '') === host;
    } catch {
      return false;
    }
  });
  let tuttiPrenota: string[] = [];
  // Il «sito» su Maps a volte e' gia' la pagina prenotazioni (Le Gronde).
  let conModulo = /prenot|book|reserv/i.test(url) && /<form/i.test(home.html);
  let metodo = home.metodo;
  if (interna) {
    const pagina = await leggi(interna);
    if (pagina) {
      tuttiPrenota = indirizzi(pagina.html, interna);
      conModulo = /<form/i.test(pagina.html);
      if (pagina.metodo === 'fetch') metodo = 'fetch';
      const motore = cerca(MOTORI, [...tuttiPrenota, pagina.html]);
      if (motore) return { tipo: 'motore', nome: motore.nome, dove: interna, metodo };
      // Un iframe di un altro dominio nella pagina di prenotazione e' quasi
      // sempre un motore che non abbiamo in elenco: meglio dirlo motore
      // («sconosciuto») che vendergli quello che ha gia'.
      const iframe = [...pagina.html.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)]
        .map((m) => m[1])
        .find((s) => {
          try {
            const h = new URL(s, interna).hostname;
            return !h.endsWith(host) && !/google|youtube|vimeo|facebook|maps|recaptcha|hcaptcha|cookie|iubenda|stripe|paypal|tiktok|instagram/i.test(h);
          } catch {
            return false;
          }
        });
      if (iframe) {
        return { tipo: 'motore', nome: `motore su ${new URL(iframe, interna).hostname}`, dove: interna, metodo };
      }
    }
  }

  // 3. «Prenota» porta a un portale a commissione?
  const aPortale = cerca(PORTALI_A_COMMISSIONE, [...prenota, ...tuttiHome, ...tuttiPrenota]);
  if (aPortale) return { tipo: 'manda_a_portale', nome: aPortale.nome, dove: aPortale.dove, metodo };

  // Letto solo col fetch: un motore caricato da script ci sfugge. Non e' un «no».
  if (metodo === 'fetch') return { tipo: 'non_letto', dove: url, metodo };
  return {
    tipo: 'nessun_motore',
    nome: conModulo ? 'solo un modulo di richiesta' : undefined,
    dove: interna ?? url,
    metodo,
  };
}

/** Le parole per l'operatore, una per tipo. */
export const ETICHETTA_PRENOTAZIONE: Record<TipoPrenotazione, string> = {
  senza_sito: 'senza sito',
  portale: 'solo portali',
  manda_a_portale: 'Prenota → portale',
  motore: 'ha un motore',
  nessun_motore: 'nessun motore',
  non_letto: 'da verificare',
};

/**
 * Legge il sito di un'azienda e scrive l'esito. Torna l'esito, o null se
 * l'azienda non e' una struttura ricettiva (per un ristorante la domanda non
 * ha senso, e non si spende un Chromium per niente).
 */
export async function salvaPrenotazione(aziendaId: string | number): Promise<EsitoPrenotazione | null> {
  const [a] = await query<{ categoria: string | null; sito: string | null }>(
    `SELECT a.categoria,
            (SELECT c.valore FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.tipo = 'sito' ORDER BY c.id LIMIT 1) AS sito
       FROM wesion.azienda a WHERE a.id = $1`,
    [aziendaId]
  );
  if (!a || !RICETTIVA.test(a.categoria ?? '')) return null;
  const esito = await rilevaPrenotazione(a.sito);
  await query(
    `UPDATE wesion.azienda SET prenotazione = $2::jsonb, prenotazione_at = now() WHERE id = $1`,
    [aziendaId, JSON.stringify(esito)]
  );
  return esito;
}
