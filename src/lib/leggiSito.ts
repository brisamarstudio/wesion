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
