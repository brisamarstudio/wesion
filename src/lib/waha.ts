/**
 * Dialogo con WAHA: risposte al titolare e scarico delle foto.
 *
 * Il router gira sullo stesso host dei container, quindi parla direttamente con
 * la porta della sessione e non passa dal gateway pubblico.
 *
 * Nessun import relativo qui dentro, apposta: questo file lo carica sia Next
 * (che vuole gli import senza estensione) sia il router avviato con Node
 * (che le estensioni le pretende). Senza dipendenze relative il problema non
 * si pone e il file resta uno solo.
 */

const BASE = process.env.WAHA_BASE || 'http://127.0.0.1:3006';
const API_KEY = process.env.WAHA_API_KEY || '';
const SESSIONE = process.env.WAHA_SESSION || 'default';

function intestazioni(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Api-Key': API_KEY, ...extra };
}

/**
 * Manda un messaggio al titolare.
 *
 * Non lancia mai: se il messaggio non parte, il lavoro fatto finora (la bozza
 * salvata, il menu pubblicato) resta valido. Far fallire tutta la richiesta
 * perche' non e' partito un avviso e' peggio del problema.
 *
 * Restituisce se e' partito, cosi' chi chiama puo' scriverlo nello storico
 * invece di dare per scontato che sia arrivato — che e' esattamente il guasto
 * di notifica invisibile: best-effort dichiarato, non silenzioso.
 */
export async function mandaTesto(telefono: string, testo: string): Promise<boolean> {
  const url = process.env.WAHA_URL || `${BASE}/api/sendText`;
  const numero = String(telefono).replace(/\D/g, '');

  // Due contratti diversi: il gateway interno di whatsapp-suite e WAHA nudo.
  const eGateway = url.includes('/api/internal/send');
  const testa: Record<string, string> = eGateway
    ? { 'Content-Type': 'application/json', 'x-internal-key': API_KEY }
    : { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY };
  const corpo = eGateway
    ? { client_id: SESSIONE, phone: numero, message: testo }
    : { session: SESSIONE, chatId: `${numero}@c.us`, text: testo };

  try {
    const risposta = await fetch(url, { method: 'POST', headers: testa, body: JSON.stringify(corpo) });
    if (!risposta.ok) {
      console.error('[waha] invio fallito:', risposta.status, (await risposta.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (errore: unknown) {
    console.error('[waha] invio fallito:', errore instanceof Error ? errore.message : errore);
    return false;
  }
}

/**
 * Su GOWS il mittente puo' presentarsi come LID (`...@lid`) invece che col
 * numero: succede coi contatti che sono a loro volta sessioni WAHA o
 * multi-device. WAHA sa fare la traduzione, quindi gliela si chiede invece di
 * censire i LID a mano cliente per cliente.
 */
export async function risolviLid(lid: string): Promise<string | null> {
  try {
    const id = String(lid).includes('@') ? String(lid) : `${lid}@lid`;
    const risposta = await fetch(`${BASE}/api/${SESSIONE}/lids/${encodeURIComponent(id)}`, {
      headers: intestazioni(),
    });
    if (!risposta.ok) return null;
    const dati = await risposta.json();
    return dati?.pn ? String(dati.pn).split('@')[0] : null;
  } catch (errore: unknown) {
    console.error('[waha] risolviLid fallito:', errore instanceof Error ? errore.message : errore);
    return null;
  }
}

/**
 * ⚠️ WAHA dichiara l'URL del file come `http://localhost:3000/api/files/...`,
 * cioe' localhost **visto da dentro il suo container**. Il router gira
 * sull'host, dove `localhost:3000` e' un altro servizio (whatsapp-suite, e in
 * sviluppo anche questa dashboard): senza riscrivere l'host si scarica la
 * pagina HTML di quello, non la foto. Si tiene il percorso e si rimette davanti
 * la porta della sessione.
 */
function raggiungibile(url: string): string {
  try {
    const u = new URL(String(url));
    const base = new URL(BASE);
    u.protocol = base.protocol;
    u.host = base.host;
    return u.toString();
  } catch {
    return String(url);
  }
}

/**
 * Scarica il media allegato al messaggio.
 * I file stanno sul server WAHA, protetto da API key: senza header torna 401
 * e la foto non arriva mai all'OCR.
 */
export async function scaricaMedia(url: string): Promise<{ dati: Buffer; mime: string }> {
  const vero = raggiungibile(url);
  const risposta = await fetch(vero, { headers: intestazioni() });
  if (!risposta.ok) throw new Error(`download media ${risposta.status} da ${vero}`);

  let mime = risposta.headers.get('content-type') || 'image/jpeg';
  if (mime.includes('octet-stream') || mime.includes('binary')) {
    mime = vero.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg';
  }

  if (!mime.startsWith('image/') && !mime.includes('pdf')) {
    throw new Error(`il media non è un'immagine o un PDF ma ${mime} (url: ${vero})`);
  }

  return { dati: Buffer.from(await risposta.arrayBuffer()), mime };
}

/**
 * Carica la foto sul media server: Google vuole una URL pubblica per il post.
 *
 * Il contratto di upload.php e' quello usato da `admin/upload.ts` sui siti:
 * token nell'header `X-Upload-Token` (non come campo del form), campi
 * `file`/`cliente`/`tipo`, e risposta con `ok` (non `success`).
 *
 * ⚠️ Lo `User-Agent` e' OBBLIGATORIO: il WAF di Ergonet risponde 403 a chi non
 * ce l'ha, prima ancora di eseguire il PHP.
 *
 * ⚠️ `formato: jpg` e non webp: i post della scheda Google vogliono JPEG o PNG,
 * e con un webp l'API risponde 500 "Internal error" senza dire cosa non va.
 * upload.php converte in webp di default e accetta questo interruttore apposta.
 */
export async function caricaPubblico(dati: Buffer, mime: string): Promise<string | null> {
  const url = process.env.MEDIA_UPLOAD_URL || 'https://media.mywebby.it/upload.php';
  const token = process.env.MEDIA_UPLOAD_TOKEN;
  if (!token) {
    console.error('[media] MEDIA_UPLOAD_TOKEN mancante: la foto non finirà su Google');
    return null;
  }

  const estensione = String(mime).includes('png') ? 'png' : 'jpg';
  const modulo = new FormData();
  modulo.append('file', new Blob([new Uint8Array(dati)], { type: mime }), `menu-${Date.now()}.${estensione}`);
  modulo.append('cliente', process.env.MEDIA_CLIENT || 'wesion');
  modulo.append('tipo', 'menu');
  modulo.append('formato', 'jpg');

  try {
    const risposta = await fetch(url, {
      method: 'POST',
      headers: { 'X-Upload-Token': token, 'User-Agent': `Wesion/1.0 (+${url})` },
      body: modulo,
    });

    const testo = await risposta.text();
    let dato: { ok?: boolean; url?: string; error?: string };
    try {
      dato = JSON.parse(testo);
    } catch {
      console.error(`[media] risposta non JSON (HTTP ${risposta.status}):`, testo.slice(0, 200));
      return null;
    }

    if (!risposta.ok || !dato?.ok) {
      console.error(`[media] upload rifiutato (HTTP ${risposta.status}):`, dato?.error || testo.slice(0, 200));
      return null;
    }
    return dato.url || null;
  } catch (errore: unknown) {
    console.error('[media] upload fallito:', errore instanceof Error ? errore.message : errore);
    return null;
  }
}
