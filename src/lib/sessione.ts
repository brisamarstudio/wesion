/**
 * Chi entra, e come si ricorda che è entrato.
 *
 * ⚠️ QUI DENTRO SOLO WEB CRYPTO, MAI `node:crypto`.
 *
 * Questo file lo importa il middleware, che gira sul runtime Edge: `node:crypto`
 * li' non esiste e la build fallisce. Le password, che scrypt lo usano davvero,
 * stanno apposta in `password.ts` — un file che il middleware non tocca.
 *
 * Sono due meccanismi diversi per due problemi diversi: scrypt deve essere
 * LENTO (rende costoso provare un milione di parole), l'HMAC del cookie deve
 * volare (si verifica a ogni richiesta).
 *
 * Il cookie è firmato, non cifrato: dentro c'è l'email in chiaro e chiunque
 * può leggerla. Non è una svista — non c'è niente di segreto da nascondere, e
 * quello che serve è che nessuno possa FABBRICARNE uno, che è ciò che la firma
 * garantisce.
 */

export const NOME_COOKIE = 'wesion_sessione';

/** Quanto dura una sessione normale: una giornata di lavoro con un margine. */
const DURATA_ORE = 12;
/** Con "ricordami": un mese, per chi entra dallo stesso computer ogni giorno. */
const DURATA_RICORDAMI_ORE = 30 * 24;

/**
 * Esportate in secondi perche' le legge anche `route.ts`, per il `maxAge` del
 * cookie nel browser — che e' una cosa DIVERSA da `scade` qui sotto.
 *
 * ⚠️ LE DUE DURATE DEVONO MUOVERSI INSIEME. `scade` (nel payload firmato) dice
 * quanto la SESSIONE resta valida; `maxAge` (nell'header Set-Cookie) dice
 * quanto il BROWSER tiene il cookie prima di buttarlo da solo. Se il primo
 * dicesse 30 giorni e il secondo restasse a 12 ore, il browser cancellerebbe
 * il cookie a mezzanotte e il "ricordami" non ricorderebbe niente — nessun
 * errore, solo un utente disconnesso che giura di aver spuntato la casella.
 */
export const DURATA_SECONDI = DURATA_ORE * 3600;
export const DURATA_RICORDAMI_SECONDI = DURATA_RICORDAMI_ORE * 3600;

function segreto(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET mancante o troppo corta (almeno 16 caratteri).');
  }
  return s;
}

// ── Il cookie ───────────────────────────────────────────────────────────────

/**
 * Base64 "url-safe", senza `Buffer`.
 *
 * ⚠️ `Buffer` e' di Node. Sul runtime Edge, dove gira il middleware, Next lo
 * fornisce come tappabuchi ma non e' garantito: compilare non vuol dire girare.
 * `btoa`/`atob` ci sono da tutte e due le parti per contratto, quindi si usano
 * quelli e il dubbio non si pone.
 */
const b64url = (b: ArrayBuffer | Uint8Array): string => {
  const byte = b instanceof Uint8Array ? b : new Uint8Array(b);
  let grezzo = '';
  for (const c of byte) grezzo += String.fromCharCode(c);
  return btoa(grezzo).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * La firma usa Web Crypto e non `node:crypto`.
 *
 * Il middleware di Next gira sul runtime Edge, dove `node:crypto` non c'è.
 * Web Crypto c'è in tutti e due, quindi la stessa funzione verifica il cookie
 * sia nel middleware sia dentro una rotta — una copia sola, nessuna possibilità
 * che le due divergano.
 */
async function firma(dati: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segreto()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', chiave, new TextEncoder().encode(dati)));
}

export interface Sessione {
  email: string;
  nome: string | null;
  /** Quando scade, in millisecondi epoch. */
  scade: number;
}

export async function creaCookie(email: string, nome: string | null, ricordami = false): Promise<string> {
  const durataMs = (ricordami ? DURATA_RICORDAMI_SECONDI : DURATA_SECONDI) * 1000;
  const corpo: Sessione = { email, nome, scade: Date.now() + durataMs };
  const dati = b64url(new TextEncoder().encode(JSON.stringify(corpo)));
  return `${dati}.${await firma(dati)}`;
}

/**
 * Legge un cookie, o null se non è buono.
 *
 * Tre modi di non essere buono, e nessuno merita un messaggio diverso: mal
 * formato, firma sbagliata, scaduto. Dire quale dei tre aiuterebbe solo chi sta
 * provando a fabbricarne uno.
 */
export async function leggiCookie(cookie: string | undefined): Promise<Sessione | null> {
  if (!cookie) return null;
  const [dati, firmaRicevuta] = cookie.split('.');
  if (!dati || !firmaRicevuta) return null;

  if ((await firma(dati)) !== firmaRicevuta) return null;

  try {
    const grezzo = atob(dati.replace(/-/g, '+').replace(/_/g, '/'));
    const byte = Uint8Array.from(grezzo, (c) => c.charCodeAt(0));
    const s = JSON.parse(new TextDecoder().decode(byte)) as Sessione;
    if (!s.email || typeof s.scade !== 'number' || s.scade < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}
