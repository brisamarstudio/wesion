/**
 * Leggere il testo di un sito, senza farsi usare come tramite.
 *
 * ⚠️ L'URL LO DECIDE QUALCUN ALTRO, E QUESTO CAMBIA TUTTO. Un indirizzo che
 * arriva da un form o da uno scraper puo' puntare dove vuole: `localhost:3006`
 * (WAHA), un indirizzo privato della rete, o `169.254.169.254` — che sui cloud
 * e' l'endpoint dei metadati, cioe' le credenziali della macchina. Il server
 * farebbe la richiesta per conto di chi l'ha scritto, e i pezzi della risposta
 * finirebbero dentro il testo generato.
 *
 * Due difese, e servono tutte e due:
 *   1. si controlla l'indirizzo PRIMA di chiamarlo;
 *   2. `redirect: 'error'`, perche' un indirizzo pubblico che rimanda a
 *      127.0.0.1 passerebbe il primo controllo e arriverebbe lo stesso.
 *
 * Nessun import relativo: cosi' lo puo' caricare anche il router.
 */

/**
 * Si bloccano: schemi diversi da http/https, loopback, indirizzi privati
 * (RFC1918), link-local (compreso 169.254.169.254 dei metadata cloud), e i nomi
 * senza punto — host interni tipo `router`, `nas`.
 */
export function indirizzoPubblico(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (!host.includes('.') && !host.includes(':')) return false;

  if (host.includes(':')) {
    return !(host === '::1' || host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd'));
  }

  const ottetti = host.split('.');
  const eIPv4 = ottetti.length === 4 && ottetti.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
  if (!eIPv4) return true; // e' un nome di dominio: lo risolve la rete

  const [a, b] = ottetti.map(Number);
  if (a === 127 || a === 0 || a === 10) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

/**
 * Il testo leggibile di una pagina, tagliato corto.
 *
 * ⚠️ IL TETTO NON E' PER RISPARMIARE TOKEN. Serve a sapere cosa vende, non a
 * dettare il tono: piu' testo del sito entra, piu' il gergo da vetrina pesa
 * sull'analisi. Sulla prova vera del 21/07/2026 un sito da 18.000 caratteri ha
 * coperto una descrizione da cinquecento, e fra le "parole sue" del cliente
 * sono usciti "prodotti impeccabili" e "soddisfazione totale" — cioe' proprio
 * il tono da cui stiamo scappando.
 */
export async function leggiTestoSito(url: string, massimo = 10000): Promise<string> {
  let indirizzo = (url || '').trim();
  if (!indirizzo) return '';
  if (!/^https?:\/\//i.test(indirizzo)) indirizzo = 'https://' + indirizzo;

  if (!indirizzoPubblico(indirizzo)) {
    console.warn(`[sito] indirizzo rifiutato perché non pubblico: ${indirizzo}`);
    return '';
  }

  try {
    const risposta = await fetch(indirizzo, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!risposta.ok) return '';

    const html = await risposta.text();
    return html
      // Via quello che non e' testo per un lettore: se entra nell'analisi, il
      // modello ci trova dentro nomi di funzioni e li scambia per parole sue.
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, massimo);
  } catch (errore: unknown) {
    console.warn('[sito] non letto:', errore instanceof Error ? errore.message : errore);
    return '';
  }
}

/**
 * Il telefono e l'email scritti sul sito.
 *
 * ⚠️ PERCHE' ESISTE (31/08/2026). L'audit scaricava l'HTML della home,
 * controllava due cose (viewport, form di prenotazione) e lo BUTTAVA. Poi la
 * scheda del lead mostrava «Telefono —» ed «Email —» accanto all'indirizzo del
 * sito su cui quei due numeri erano scritti in chiaro. Chi doveva telefonare
 * apriva il sito a mano e li copiava: lo strumento aveva letto la pagina e
 * fatto finta di niente.
 *
 * SI PRENDONO DAI LINK, NON DAL TESTO. `mailto:` e `tel:` sono dichiarazioni:
 * qualcuno ha scritto li' dentro un recapito perche' vuole essere contattato
 * cosi'. Cercare numeri nel testo con una regex pesca anche partite IVA, REA,
 * codici fiscali e prezzi — e un numero sbagliato in una lista di chiamate
 * costa piu' di un numero mancante, perche' qualcuno lo chiama davvero.
 *
 * Restano fuori apposta i numeri scritti solo come testo: se il sito non li ha
 * messi in un link, li leggera' una persona.
 */
export function estraiRecapiti(html: string): { telefoni: string[]; email: string[] } {
  const telefoni = new Set<string>();
  const email = new Set<string>();

  for (const trovato of String(html || '').matchAll(/href=["']\s*(mailto|tel):([^"'?]+)/gi)) {
    const schema = trovato[1].toLowerCase();
    const valore = decodeURIComponent(trovato[2].trim());
    if (!valore) continue;

    if (schema === 'mailto') {
      // Le email di servizio dei temi e dei plugin non sono del cliente.
      if (/^(info|mail)@(example|dominio|tuosito|test)\./i.test(valore)) continue;
      if (valore.includes('@')) email.add(valore.toLowerCase());
    } else {
      const pulito = valore.replace(/[^\d+]/g, '');
      // Sotto le otto cifre non e' un numero da chiamare: e' un interno, un
      // prefisso lasciato a meta', o un anno finito dentro un link.
      if (pulito.replace(/\D/g, '').length >= 8) telefoni.add(pulito);
    }
  }

  return { telefoni: [...telefoni].slice(0, 5), email: [...email].slice(0, 5) };
}

/**
 * L'indirizzo della pagina «contatti», se il sito ne ha una.
 *
 * Serve all'audit: sulla home il recapito spesso non c'e' (sta nel piede, o
 * dietro un bottone che apre un modulo), e una richiesta in piu' su UNA pagina
 * sola e' un prezzo onesto per non lasciare un lead senza numero.
 */
export function paginaContatti(html: string, base: string): string | null {
  for (const trovato of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    if (!/contatt|contact/i.test(trovato[1])) continue;
    try {
      const assoluto = new URL(trovato[1], base);
      if (assoluto.host !== new URL(base).host) continue;
      assoluto.hash = '';
      return assoluto.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Le parole che promettono una pagina utile. NON sono un filtro: sono un
 * ORDINE DI PRECEDENZA.
 *
 * ⚠️ La prima versione (31/08/2026) le usava come whitelist, e su mywebby.it
 * ha letto tre pagine su sei: si e' persa `/realizzazione-siti-web-pavia` e
 * `/social-ads`, che sono le due pagine dove c'e' scritto cosa vende davvero.
 * Le pagine di servizio, sui siti fatti per Google, hanno il nome del servizio
 * e della citta' — non la parola "servizi". Una whitelist di parole non puo'
 * indovinarle, quindi non deve provarci: si leggono tutte, cominciando da
 * quelle che promettono meglio.
 */
const PAGINE_CHE_PROMETTONO =
  /(servizi|services|cosa-facciamo|chi-siamo|about|prodotti|products|menu|listino|portfolio|lavori|progetti|realizzazioni|soluzioni|offerta|azienda|studio|team)/i;

/**
 * Queste no: sono testo che parla di tutto tranne che dell'attivita'. Il
 * legale in particolare e' il peggiore — e' lungo, e' uguale su tutti i siti,
 * e riempirebbe l'analisi di parole che non sono di nessuno.
 */
const DA_SALTARE =
  /(privacy|cookie|termini|condizioni|carrello|cart|checkout|login|accedi|area-riservata|account|admin|feed|sitemap|\/tag\/|\/category\/|\.pdf$|\.jpg$|\.png$|\.webp$|\.zip$|^mailto:|^tel:)/i;

/**
 * Il sito letto su piu' pagine, per capire cosa fa un'attivita'.
 *
 * ⚠️ QUESTO NON VA USATO PER LA VOCE, e la ragione e' scritta sopra a
 * `leggiTestoSito`: il 21/07/2026 un sito da 18.000 caratteri ha coperto una
 * descrizione da cinquecento e ha fatto uscire "prodotti impeccabili" fra le
 * parole del cliente. Piu' testo di vetrina peggiora la voce.
 *
 * Per i FATTI vale il contrario: cosa vende, con che materiali, cosa lo
 * distingue: sta sparso fra «servizi», «chi siamo» e «lavori», e una home da
 * sola non basta a metterne insieme quattro veri. Da qui la separazione:
 * `estraiVoce` non vede il sito, `estraiFatti` lo vede tutto.
 *
 * ⚠️ SOLO PAGINE DELLO STESSO HOST. Non e' pulizia: seguire un link esterno
 * vorrebbe dire farsi guidare in giro per la rete da un sito che non e'
 * nostro, con la nostra macchina — e le difese di `leggiTestoSito` proteggono
 * dagli indirizzi privati, non dall'essere usati come tramite verso terzi.
 */
export async function leggiSitoIntero(
  url: string,
  { pagine = 6, perPagina = 6000 }: { pagine?: number; perPagina?: number } = {}
): Promise<{ testo: string; lette: string[] }> {
  let radice = (url || '').trim();
  if (!radice) return { testo: '', lette: [] };
  if (!/^https?:\/\//i.test(radice)) radice = 'https://' + radice;
  if (!indirizzoPubblico(radice)) return { testo: '', lette: [] };

  const home = await leggiTestoSito(radice, perPagina);
  if (!home) return { testo: '', lette: [] };

  const pezzi = [`PAGINA: ${radice}\n${home}`];
  const lette = [radice];

  let html = '';
  try {
    const risposta = await fetch(radice, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (risposta.ok) html = await risposta.text();
  } catch {
    // La home l'abbiamo gia': se il secondo giro non riesce, si torna con quella.
    return { testo: pezzi.join('\n\n'), lette };
  }

  const base = new URL(radice);
  const candidate: string[] = [];
  for (const trovato of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    let assoluto: URL;
    try {
      assoluto = new URL(trovato[1], base);
    } catch {
      continue;
    }
    assoluto.hash = '';
    const indirizzo = assoluto.toString();
    if (assoluto.host !== base.host) continue;
    if (DA_SALTARE.test(indirizzo)) continue;
    // Solo il primo livello: una pagina profonda e' quasi sempre un articolo
    // o una scheda prodotto, cioe' un dettaglio, non il quadro d'insieme.
    if (assoluto.pathname.split('/').filter(Boolean).length > 1) continue;
    if (lette.includes(indirizzo) || candidate.includes(indirizzo)) continue;
    candidate.push(indirizzo);
  }

  // Prima quelle che promettono, poi le altre nell'ordine in cui stanno nel
  // menu — che e' gia' un ordine di importanza deciso da chi ha fatto il sito.
  const inOrdine = [
    ...candidate.filter((u) => PAGINE_CHE_PROMETTONO.test(new URL(u).pathname)),
    ...candidate.filter((u) => !PAGINE_CHE_PROMETTONO.test(new URL(u).pathname)),
  ];

  for (const indirizzo of inOrdine.slice(0, Math.max(0, pagine - 1))) {
    const testo = await leggiTestoSito(indirizzo, perPagina);
    if (!testo) continue;
    pezzi.push(`PAGINA: ${indirizzo}\n${testo}`);
    lette.push(indirizzo);
  }

  return { testo: pezzi.join('\n\n'), lette };
}
