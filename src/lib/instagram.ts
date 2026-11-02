/**
 * Pubblicare su Instagram, dalla dashboard, con l'API di Meta.
 *
 * Nata il 02/11/2026, provata prima su @mywebby.
 *
 * ⚠️ QUESTA E' UNA ECCEZIONE DICHIARATA ALLA REGOLA DI CASA («la dashboard non
 * pubblica: scrive la bozza e il router legge»). Perche':
 *   - il router sta su Oracle e da qui non si aggiorna: una pubblicazione che
 *     passa da li' non si puo' ancora provare;
 *   - Instagram NON ha una pubblicazione programmata nell'API (si crea il
 *     contenitore e si pubblica subito), quindi la programmazione la dovra'
 *     fare comunque Wesion, e il posto giusto sara' il router.
 * Finche' non c'e' il giro del router l'unico innesco e' il bottone
 * «Pubblica su Instagram» in consolle: l'ultimo bottone e' dell'operatore.
 *
 * ⚠️ IL TOKEN STA NEL DATABASE, nella config del servizio 'social' del cliente
 * (`instagram_id`, `instagram_token`), non in un .env: come i segreti del
 * blog, e cosi' non si tocca il server a mano. Non finisce MAI in un errore
 * ne' in un log: tutte le funzioni qui sotto lo tolgono da cio' che dicono.
 *
 * ⚠️ NOTE SU META (verificate il 02/11/2026, vanno rilette se qualcosa si rompe):
 *   - le immagini devono essere JPEG su un URL pubblico (qui: media.mywebby.it),
 *     con proporzioni fra 4:5 e 1,91:1;
 *   - il token utente lungo dura 60 giorni (`scade` in config) e va rinnovato;
 *   - 100 pubblicazioni ogni 24 ore per account;
 *   - le didascalie arrivano a 2200 caratteri e 30 hashtag.
 */
import { caricaPubblico } from './waha';

const GRAPH = 'https://graph.facebook.com/v26.0';
const MAX_DIDASCALIA = 2200;
const MAX_HASHTAG = 30;
/** Proporzioni accettate da Instagram, larghezza / altezza. */
const RAPPORTO_MIN = 0.8;
const RAPPORTO_MAX = 1.91;

export interface ConfigInstagram {
  /** L'id dell'account Instagram professionale (non il nome utente). */
  id: string;
  token: string;
}

/** La config del servizio social del cliente -> quello che serve a Meta, o null se manca qualcosa. */
export function leggiConfigInstagram(config: Record<string, unknown> | null | undefined): ConfigInstagram | null {
  const id = String(config?.instagram_id ?? '').trim();
  const token = String(config?.instagram_token ?? '').trim();
  if (!/^\d{5,25}$/.test(id) || token.length < 40) return null;
  return { id, token };
}

/** Testo + hashtag, nella forma che Instagram pubblica. Spiega da solo se non va. */
export function costruisciDidascalia(testo: string, hashtag?: unknown): string {
  const base = testo.trim();
  const tag = Array.isArray(hashtag)
    ? hashtag
        .map((t) => String(t).trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
    : [];
  if (tag.length > MAX_HASHTAG) {
    throw new Error(`Gli hashtag sono ${tag.length}: Instagram ne accetta al massimo ${MAX_HASHTAG}.`);
  }
  const intera = tag.length > 0 ? `${base}\n\n${tag.join(' ')}` : base;
  if (intera.length > MAX_DIDASCALIA) {
    throw new Error(`Il testo è di ${intera.length} caratteri: Instagram ne accetta al massimo ${MAX_DIDASCALIA}.`);
  }
  return intera;
}

/**
 * Meta vuole un JPEG. L'immagine della bozza puo' essere PNG o WebP (quelle
 * generate dall'AI lo sono): la scarichiamo, la convertiamo e la ricarichiamo
 * sul media server. Se le proporzioni escono dai limiti di Instagram, si taglia
 * al centro invece di farsela rifiutare.
 */
export async function immagineInJpeg(urlOriginale: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const risposta = await fetch(urlOriginale, { signal: AbortSignal.timeout(30_000) });
  if (!risposta.ok) throw new Error(`Non riesco a scaricare la foto (HTTP ${risposta.status}).`);
  const originale = Buffer.from(await risposta.arrayBuffer());

  const immagine = sharp(originale).rotate();
  const { width, height } = await immagine.metadata();
  if (!width || !height) throw new Error('La foto non si legge: non sembra un’immagine valida.');

  const rapporto = width / height;
  let lavoro = immagine.flatten({ background: '#ffffff' });
  if (rapporto < RAPPORTO_MIN || rapporto > RAPPORTO_MAX) {
    const taglia = rapporto < RAPPORTO_MIN ? RAPPORTO_MIN : RAPPORTO_MAX;
    const larghezza = Math.min(width, 1440);
    lavoro = lavoro.resize(larghezza, Math.round(larghezza / taglia), { fit: 'cover', position: 'centre' });
  } else {
    lavoro = lavoro.resize({ width: 1440, withoutEnlargement: true });
  }
  return lavoro.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

type RispostaMeta = {
  id?: string;
  permalink?: string;
  status_code?: string;
  status?: string;
  error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };
};

/** Una chiamata a Meta. Il token va nell'intestazione e non esce mai dai messaggi. */
async function meta(cfg: ConfigInstagram, metodo: 'GET' | 'POST', percorso: string, campi?: Record<string, string>): Promise<RispostaMeta> {
  const init: RequestInit = {
    method: metodo,
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: AbortSignal.timeout(60_000),
  };
  let url = `${GRAPH}/${percorso}`;
  if (metodo === 'POST') {
    init.body = new URLSearchParams(campi ?? {});
  } else if (campi) {
    url += `?${new URLSearchParams(campi)}`;
  }
  const risposta = await fetch(url, init);
  const j = (await risposta.json().catch(() => ({}))) as RispostaMeta;
  if (!risposta.ok || j.error) throw new Error(spiegaErroreMeta(j.error, risposta.status, cfg.token));
  return j;
}

/** Cosa ha detto Meta, in italiano e senza il token dentro. */
export function spiegaErroreMeta(e: RispostaMeta['error'], http: number, token?: string): string {
  const cuore = e?.error_user_msg || e?.message || `HTTP ${http}`;
  const pulito = token ? cuore.split(token).join('[token]') : cuore;
  if (e?.code === 190) {
    return 'Il token di Instagram è scaduto o non è più valido: generane uno nuovo e incollalo nella scheda del cliente (Social). Meta dice: ' + pulito;
  }
  if (e?.code === 4 || e?.code === 17 || e?.code === 32) {
    return 'Meta dice che abbiamo chiamato troppe volte: aspetta qualche minuto e riprova. ' + pulito;
  }
  return `Meta ha risposto: ${pulito}`;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EsitoInstagram {
  mediaId: string;
  permalink: string | null;
}

/**
 * Il giro vero: contenitore -> attesa -> pubblicazione -> indirizzo del post.
 * Se qualcosa non va lancia con una frase che si puo' leggere in consolle.
 */
export async function pubblicaFotoSuInstagram(
  cfg: ConfigInstagram,
  s: { urlFotoOriginale: string; didascalia: string; slugCliente: string }
): Promise<EsitoInstagram> {
  const jpeg = await immagineInJpeg(s.urlFotoOriginale);
  const urlJpeg = await caricaPubblico(jpeg, 'image/jpeg', { cliente: s.slugCliente, tipo: 'gbp' });
  if (!urlJpeg) throw new Error('Non riesco a caricare la foto sul media server (MEDIA_UPLOAD_TOKEN?).');

  const contenitore = await meta(cfg, 'POST', `${cfg.id}/media`, {
    image_url: urlJpeg,
    caption: s.didascalia,
  });
  if (!contenitore.id) throw new Error('Meta non ha restituito il contenitore del post.');

  // Meta elabora la foto: di solito pochi secondi. Si guarda ogni 3, fino a un minuto.
  let pronto = false;
  for (let i = 0; i < 20; i++) {
    const stato = await meta(cfg, 'GET', contenitore.id, { fields: 'status_code,status' });
    if (stato.status_code === 'FINISHED') {
      pronto = true;
      break;
    }
    if (stato.status_code === 'ERROR' || stato.status_code === 'EXPIRED') {
      throw new Error(`Meta non ha accettato la foto (${stato.status_code}${stato.status ? `: ${stato.status}` : ''}).`);
    }
    await pausa(3000);
  }
  if (!pronto) throw new Error('Meta sta ancora elaborando la foto dopo un minuto: non ho pubblicato. Riprova fra poco.');

  const pubblicato = await meta(cfg, 'POST', `${cfg.id}/media_publish`, { creation_id: contenitore.id });
  if (!pubblicato.id) throw new Error('Meta non ha confermato la pubblicazione.');

  // L'indirizzo e' comodo ma non indispensabile: se non arriva il post e' comunque uscito.
  const post = await meta(cfg, 'GET', pubblicato.id, { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
  return { mediaId: pubblicato.id, permalink: post.permalink ?? null };
}

/** Un controllo che non pubblica niente: il token vede l'account? Serve al bottone «Prova il collegamento». */
export async function provaCollegamentoInstagram(
  cfg: ConfigInstagram
): Promise<{ username: string; follower: number | null; quotaUsata: number | null }> {
  const profilo = (await meta(cfg, 'GET', cfg.id, { fields: 'username,followers_count' })) as RispostaMeta & {
    username?: string;
    followers_count?: number;
  };
  const quota = (await meta(cfg, 'GET', `${cfg.id}/content_publishing_limit`, { fields: 'quota_usage' }).catch(
    () => ({})
  )) as { data?: Array<{ quota_usage?: number }> };
  return {
    username: profilo.username ?? '?',
    follower: profilo.followers_count ?? null,
    quotaUsata: quota.data?.[0]?.quota_usage ?? null,
  };
}
