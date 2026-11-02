/**
 * Il mese in un click: prepara tutto, si legge, si approva una volta.
 *
 * ⚠️ PERCHE' (02/11/2026). «Io vorrei che con un CLICK, una volta letto il
 * piano editoriale del mese e approvato, non ci penso più.» Prima il mese era
 * cinque passaggi in tre pagine: costruisci il piano (slot vuoti), vai nelle
 * bozze, scrivi, carica un'immagine per ognuna, approva diciotto volte. Il
 * prezzo dei clienti piccoli (120 €/mese, vedi booking-engine/PREZZI.md) regge
 * solo se un cliente costa meno di un'ora al mese: cinque passaggi per
 * diciotto post non ci stavano.
 *
 * Ora:
 *   1. PREPARA — piano Google + articoli del sito abbinati, testi, immagini AI.
 *      Lavora a passi piccoli (`preparaPasso`): la pagina lo richiama finche'
 *      non ha finito. Un passo lungo dietro un proxy si perde a meta'; tanti
 *      passi corti riprendono da dove erano.
 *   2. LEGGI — tutto il mese in una pagina, immagine e testo.
 *   3. APPROVA — un bottone. Il router poi pubblica ognuno nel suo giorno.
 *
 * ⚠️ L'ULTIMO BOTTONE RESTA DELL'OPERATORE. Niente si approva da solo:
 * preparare scrive bozze `attesa_approvazione`, e basta. «Approva il mese» e'
 * un click di una persona che ha il mese davanti.
 *
 * ⚠️ GOOGLE + SITO INSIEME, MA COME BOZZE SEPARATE. `bozza.tipo` e' un CHECK
 * esclusivo (vedi STATO.md): non esiste una bozza con due destinazioni. Qui
 * un articolo nasce nello stesso giorno e sullo stesso tema di un post, con
 * `contenuto.coppia_di` che punta al post. Uno a settimana, non uno al
 * giorno: un blog con diciotto articoli al mese di un B&B e' rumore, e Google
 * lo tratta da rumore.
 */
import { query } from './db';
import { leggiMateria } from './materia';
import { costruisciPiano, salvaPiano } from './piano';
import { scriviBozza } from './scrivi';
import { immaginePerPost } from './immagini';
import { pcImmaginiAcceso } from './lavoratore';
import { assegnaFotoVere } from './foto';

export type FaseMese = 'non_configurato' | 'da_preparare' | 'in_preparazione' | 'da_approvare' | 'approvato';

export interface StatoMese {
  anno: number;
  mese: number;
  gbpPronto: boolean;
  blogPronto: boolean;
  fatti: number;
  /** Bozze del mese, rifiutate escluse. */
  totale: number;
  post: number;
  articoli: number;
  vuote: number;
  senzaFoto: number;
  daApprovare: number;
  /** Fra quelle da approvare: il controllo automatico ha trovato qualcosa di grave. */
  gravi: number;
  /** Il PC con ComfyUI e' acceso: le immagini arrivano da li'. */
  pcAcceso: boolean;
  /** Bozze su cui la preparazione ha fallito piu' volte: si guardano a mano. */
  bloccate: number;
  /** Fra quelle da approvare: la data e' gia' passata. */
  passate: number;
  approvate: number;
  uscite: number;
  prossima: string | null;
  fase: FaseMese;
}

export interface VoceMese {
  id: number;
  tipo: 'post_gbp' | 'articolo';
  stato: string;
  pubblica_at: string;
  titolo: string | null;
  testo: string | null;
  foto: string | null;
  grave: boolean;
  avvisi: string[];
  coppia_di: number | null;
  /** Quante volte la preparazione ha fallito su questa bozza: da 2 in su si salta. */
  errori: number;
  /** L'immagine e' generata (AI), non una foto vera. */
  foto_ai: boolean;
  /** Dove si vede, una volta uscito: il link del post su Google o dell'articolo. */
  url_uscito: string | null;
  /** L'ultimo errore di pubblicazione, se il router ci ha provato e non ce l'ha fatta. */
  errore_uscita: string | null;
}

/**
 * Dove escono DAVVERO le cose di questo cliente, detto in chiaro.
 *
 * ⚠️ NASCE DA UNA DOMANDA (02/11/2026): «un recap di cosa sta facendo e dove
 * pubblica realmente». La pagina diceva «Google» su ogni riga, ma non QUALE
 * scheda, ne' su quale sito andassero gli articoli. Chi approva un mese intero
 * deve vedere il posto vero, con un link per andarci.
 */
export interface DoveEsce {
  scheda: { nome: string; link: string | null } | null;
  sito: string | null;
}

export async function doveEsce(aziendaId: number): Promise<DoveEsce> {
  const [a] = await query<{ nome: string; maps_url: string | null; sito: string | null }>(
    `SELECT a.nome, a.maps_url,
            (SELECT c.valore FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.tipo = 'sito' ORDER BY c.id LIMIT 1) AS sito
       FROM wesion.azienda a WHERE a.id = $1`,
    [aziendaId]
  );
  const servizi = await serviziPronti(aziendaId);
  return {
    scheda: servizi.gbp && a ? { nome: a.nome, link: a.maps_url } : null,
    sito: servizi.blog && a?.sito ? (/^https?:/.test(a.sito) ? a.sito : `https://${a.sito}`) : null,
  };
}

/** Dopo quanti fallimenti una bozza si lascia stare e si segnala. */
const TENTATIVI = 2;

/**
 * I confini del mese. Stessa costruzione di `salvaPiano` APPOSTA: se qui il
 * mese finisse un'ora dopo o prima di la', l'ultimo post del 31 sarebbe del
 * piano ma non del mese — e non lo approverebbe nessuno.
 */
function confini(anno: number, mese: number): [string, string] {
  return [new Date(anno, mese - 1, 1).toISOString(), new Date(anno, mese, 1).toISOString()];
}

/** Le stesse condizioni di `servizi_pronti` in SQL_BOZZE (src/lib/bozze.ts). */
async function serviziPronti(aziendaId: number): Promise<{ gbp: boolean; blog: boolean }> {
  const [r] = await query<{ gbp: boolean; blog: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = $1 AND s.tipo = 'post_gbp' AND s.attivo
                  AND COALESCE(s.config->>'gbp_account_id', '') <> ''
                  AND COALESCE(s.config->>'gbp_location_id', '') <> '') AS gbp,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = $1 AND s.tipo = 'blog' AND s.attivo
                  AND CASE WHEN s.config->>'tipo' = 'wordpress'
                           THEN COALESCE(s.config->>'wp_base', '') <> ''
                           ELSE COALESCE(s.config->>'site_blog_url', '') <> ''
                                AND s.config->>'site_blog_url' NOT LIKE '%localhost%'
                                AND s.config->>'site_blog_url' NOT LIKE '%127.0.0.1%'
                      END) AS blog`,
    [aziendaId]
  );
  return { gbp: Boolean(r?.gbp), blog: Boolean(r?.blog) };
}

export async function vociMese(aziendaId: number, anno: number, mese: number): Promise<VoceMese[]> {
  const [inizio, fine] = confini(anno, mese);
  const righe = await query<{
    id: number;
    tipo: 'post_gbp' | 'articolo';
    stato: string;
    pubblica_at: string;
    titolo: string | null;
    testo: string | null;
    foto: string | null;
    avvisi: Array<{ gravita?: string; testo?: string; messaggio?: string }> | null;
    coppia_di: string | null;
    errori: string | null;
    url_uscito: string | null;
    errore_uscita: string | null;
    foto_ai: boolean;
  }>(
    `SELECT b.id, b.tipo, b.stato, b.pubblica_at,
            b.contenuto->>'titolo' AS titolo,
            b.contenuto->>'testo'  AS testo,
            b.contenuto->>'foto'   AS foto,
            b.avvisi,
            b.contenuto->>'coppia_di' AS coppia_di,
            b.contenuto->>'prepara_errori' AS errori,
            (b.contenuto ? 'foto_ai') AS foto_ai,
            (SELECT p.url_risultato FROM wesion.pubblicazione p
              WHERE p.bozza_id = b.id AND p.esito = 'ok' AND p.url_risultato IS NOT NULL
              ORDER BY p.eseguita_at DESC LIMIT 1) AS url_uscito,
            (SELECT p.errore FROM wesion.pubblicazione p
              WHERE p.bozza_id = b.id AND p.esito = 'errore'
                AND NOT EXISTS (SELECT 1 FROM wesion.pubblicazione q WHERE q.bozza_id = b.id AND q.esito = 'ok')
              ORDER BY p.eseguita_at DESC LIMIT 1) AS errore_uscita
       FROM wesion.bozza b
      WHERE b.azienda_id = $1 AND b.origine = 'piano'
        AND b.tipo IN ('post_gbp', 'articolo')
        AND b.stato <> 'rifiutata'
        AND b.pubblica_at >= $2 AND b.pubblica_at < $3
      ORDER BY b.pubblica_at, b.tipo DESC, b.id`,
    [aziendaId, inizio, fine]
  );
  return righe.map((r) => {
    const avvisi = Array.isArray(r.avvisi) ? r.avvisi : [];
    return {
      id: Number(r.id),
      tipo: r.tipo,
      stato: r.stato,
      pubblica_at: r.pubblica_at,
      titolo: r.titolo,
      testo: r.testo,
      foto: r.foto,
      grave: avvisi.some((a) => a.gravita === 'grave'),
      avvisi: avvisi.map((a) => String(a.messaggio ?? a.testo ?? '')).filter(Boolean),
      coppia_di: r.coppia_di ? Number(r.coppia_di) : null,
      errori: Number(r.errori ?? 0),
      foto_ai: Boolean(r.foto_ai),
      url_uscito: r.url_uscito,
      errore_uscita: r.errore_uscita,
    };
  });
}

export async function statoMese(aziendaId: number, anno: number, mese: number): Promise<StatoMese> {
  const [servizi, voci, [f], pcAcceso] = await Promise.all([
    serviziPronti(aziendaId),
    vociMese(aziendaId, anno, mese),
    query<{ n: number }>(
      `SELECT count(*)::int AS n FROM wesion.fatto
        WHERE azienda_id = $1 AND attivo AND (scade_at IS NULL OR scade_at > now())`,
      [aziendaId]
    ),
    pcImmaginiAcceso(),
  ]);
  const adesso = Date.now();
  const daApprovare = voci.filter((v) => v.stato === 'attesa_approvazione');
  const s: StatoMese = {
    anno,
    mese,
    gbpPronto: servizi.gbp,
    blogPronto: servizi.blog,
    fatti: f?.n ?? 0,
    pcAcceso,
    totale: voci.length,
    post: voci.filter((v) => v.tipo === 'post_gbp').length,
    articoli: voci.filter((v) => v.tipo === 'articolo').length,
    vuote: voci.filter((v) => v.stato === 'vuota' && v.errori < TENTATIVI).length,
    senzaFoto: daApprovare.filter((v) => !v.foto && v.errori < TENTATIVI).length,
    bloccate: voci.filter(
      (v) => v.errori >= TENTATIVI && (v.stato === 'vuota' || (v.stato === 'attesa_approvazione' && !v.foto))
    ).length,
    daApprovare: daApprovare.length,
    gravi: daApprovare.filter((v) => v.grave).length,
    passate: daApprovare.filter((v) => new Date(v.pubblica_at).getTime() < adesso).length,
    approvate: voci.filter((v) => v.stato === 'approvata').length,
    uscite: voci.filter((v) => v.stato === 'pubblicata' || v.stato === 'pubblicando').length,
    prossima:
      voci
        .filter((v) => v.stato === 'approvata' && new Date(v.pubblica_at).getTime() >= adesso)
        .map((v) => v.pubblica_at)[0] ?? null,
    fase: 'da_preparare',
  };
  s.fase = !s.gbpPronto && !s.blogPronto
    ? 'non_configurato'
    : s.totale === 0
      ? 'da_preparare'
      : s.vuote > 0 || s.senzaFoto > 0
        ? 'in_preparazione'
        : s.daApprovare > 0
          ? 'da_approvare'
          : 'approvato';
  return s;
}

/** Quanti articoli al mese: uno a settimana, non uno al giorno. */
const ARTICOLI_AL_MESE = 4;

/**
 * Un passo di preparazione. Torna cosa ha fatto; `finito` quando non c'e' piu'
 * niente da fare. `avanzati = 0` e `finito = false` vuol dire «bloccato»: la
 * pagina si ferma invece di girare a vuoto.
 */
export async function preparaPasso(
  aziendaId: number,
  anno: number,
  mese: number
): Promise<{ fatto: string; avanzati: number; finito: boolean; stato: StatoMese; errori: string[] }> {
  const stato = await statoMese(aziendaId, anno, mese);
  const errori: string[] = [];

  if (stato.fase === 'non_configurato') {
    return { fatto: 'niente: né la scheda Google né il blog sono collegati', avanzati: 0, finito: true, stato, errori };
  }

  // 1. Il piano: solo se il mese e' vuoto. Un mese gia' preparato non si
  //    ricostruisce da qui — per quello c'e' lo strumento avanzato.
  if (stato.totale === 0) {
    const materia = await leggiMateria(aziendaId);
    const piano = costruisciPiano(materia, { anno, mese });
    if (!piano.slot.length) {
      return {
        fatto: 'niente da pianificare',
        avanzati: 0,
        finito: true,
        stato,
        errori: piano.avvisi.length ? piano.avvisi : ['Mancano i fatti sul cliente: riempi «Cosa è vero» nella scheda.'],
      };
    }
    let creati = 0;
    if (stato.gbpPronto) creati += (await salvaPiano(aziendaId, piano.slot, anno, mese)).creati;

    if (stato.blogPronto) {
      // Gli articoli prendono il giorno e il tema di un post ogni tanto,
      // distribuiti nel mese. `coppia_di` li lega al post dello stesso giorno.
      const [inizio, fine] = confini(anno, mese);
      const posts = stato.gbpPronto
        ? await query<{ id: number; pubblica_at: string }>(
            `SELECT id, pubblica_at FROM wesion.bozza
              WHERE azienda_id = $1 AND origine = 'piano' AND tipo = 'post_gbp'
                AND pubblica_at >= $2 AND pubblica_at < $3 ORDER BY pubblica_at`,
            [aziendaId, inizio, fine]
          )
        : [];
      const quanti = Math.min(ARTICOLI_AL_MESE, piano.slot.length);
      const passo = piano.slot.length / quanti;
      for (let i = 0; i < quanti; i++) {
        const s = piano.slot[Math.floor(i * passo)];
        const coppia = posts.find((p) => new Date(p.pubblica_at).getTime() === new Date(s.data).getTime());
        await query(
          `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato, pubblica_at)
           VALUES ($1, 'articolo', 'piano', $2, $3::jsonb, 'vuota', $4)`,
          [
            aziendaId,
            s.fattoId,
            JSON.stringify({
              titolo: s.titolo,
              fatto: s.fatto,
              fonte: s.fonte,
              angolo:
                `${s.angolo} Sviluppalo per chi cerca su Google o chiede a un assistente AI: ` +
                'rispondi a una domanda concreta che un cliente si fa davvero, con i fatti veri.',
              ...(coppia ? { coppia_di: coppia.id } : {}),
            }),
            s.data,
          ]
        );
        creati++;
      }
    }
    return { fatto: `piano creato: ${creati} uscite`, avanzati: creati, finito: false, stato, errori };
  }

  // 1-bis. Mese gia' pianificato col vecchio strumento (solo Google), blog
  //    collegato, nessun articolo: si aggiungono, abbinati ai post che ci sono.
  //    ⚠️ Visto su Chumphon il 02/11/2026: 15 post e zero articoli, perche' il
  //    piano era nato prima di questa pagina e il passo 1 qui sopra guarda
  //    solo i mesi vuoti.
  if (stato.blogPronto && stato.articoli === 0 && stato.post > 0) {
    const [inizio, fine] = confini(anno, mese);
    const posts = await query<{ id: number; pubblica_at: string; fatto_id: number | null; contenuto: Record<string, unknown> }>(
      `SELECT id, pubblica_at, fatto_id, contenuto FROM wesion.bozza
        WHERE azienda_id = $1 AND origine = 'piano' AND tipo = 'post_gbp' AND stato <> 'rifiutata'
          AND pubblica_at >= $2 AND pubblica_at < $3 AND pubblica_at > now()
        ORDER BY pubblica_at`,
      [aziendaId, inizio, fine]
    );
    const quanti = Math.min(ARTICOLI_AL_MESE, posts.length);
    if (quanti > 0) {
      const passo = posts.length / quanti;
      for (let i = 0; i < quanti; i++) {
        const p = posts[Math.floor(i * passo)];
        const c = p.contenuto;
        await query(
          `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato, pubblica_at)
           VALUES ($1, 'articolo', 'piano', $2, $3::jsonb, 'vuota', $4)`,
          [
            aziendaId,
            p.fatto_id,
            JSON.stringify({
              titolo: c.titolo ?? null,
              fatto: c.fatto ?? null,
              fonte: c.fonte ?? null,
              angolo:
                `${c.angolo ?? 'Racconta questo fatto in modo concreto.'} Sviluppalo per chi cerca su Google o chiede a un assistente AI: ` +
                'rispondi a una domanda concreta che un cliente si fa davvero, con i fatti veri.',
              coppia_di: p.id,
            }),
            p.pubblica_at,
          ]
        );
      }
      return { fatto: `aggiunti ${quanti} articoli del sito`, avanzati: quanti, finito: false, stato, errori };
    }
  }

  // 2. I testi, due alla volta.
  const voci = await vociMese(aziendaId, anno, mese);
  const vuote = voci.filter((v) => v.stato === 'vuota' && v.errori < TENTATIVI).slice(0, 2);
  if (vuote.length) {
    let fatti = 0;
    for (const v of vuote) {
      try {
        await scriviBozza(v.id);
        fatti++;
      } catch (e) {
        errori.push(`bozza ${v.id}: ${e instanceof Error ? e.message : String(e)}`);
        await segnaErrore(v.id);
      }
    }
    return { fatto: `scritti ${fatti} testi`, avanzati: fatti, finito: false, stato, errori };
  }

  // 3. Le immagini. Se il PC con ComfyUI e' acceso le fa lui, gratis (vedi
  //    src/lib/lavoratore.ts): qui ci si ferma e si lascia fare. Se e' spento,
  //    OpenRouter, due alla volta (~7 secondi l'una, ~4 centesimi).
  //    Prima di tutto le foto VERE del cliente, se ce n'e' una che c'entra
  //    (src/lib/foto.ts): il PC e OpenRouter riempiono solo quello che resta.
  {
    const [inizio, fine] = confini(anno, mese);
    const vere = await assegnaFotoVere(aziendaId, inizio, fine);
    if (vere > 0) {
      return { fatto: `messe ${vere} foto vere del cliente`, avanzati: vere, finito: false, stato, errori };
    }
  }
  if (voci.some((v) => v.stato === 'attesa_approvazione' && !v.foto) && (await pcImmaginiAcceso())) {
    return { fatto: 'le immagini le sta facendo il tuo PC', avanzati: 0, finito: true, stato, errori };
  }
  const senza = voci
    .filter((v) => v.stato === 'attesa_approvazione' && !v.foto && v.errori < TENTATIVI)
    .slice(0, 2);
  if (senza.length) {
    let fatte = 0;
    for (const v of senza) {
      try {
        await mettiImmagine(v.id);
        fatte++;
      } catch (e) {
        errori.push(`immagine ${v.id}: ${e instanceof Error ? e.message : String(e)}`);
        await segnaErrore(v.id);
      }
    }
    return { fatto: `fatte ${fatte} immagini`, avanzati: fatte, finito: false, stato, errori };
  }

  return { fatto: 'pronto da leggere', avanzati: 0, finito: true, stato: await statoMese(aziendaId, anno, mese), errori };
}

/**
 * Un fallimento in piu' su questa bozza. Senza il conteggio, una bozza che il
 * modello sbaglia sempre (visto: un articolo con JSON rotto a ogni giro)
 * terrebbe il mese fermo per sempre su «a metà».
 */
async function segnaErrore(bozzaId: number): Promise<void> {
  await query(
    `UPDATE wesion.bozza
        SET contenuto = contenuto || jsonb_build_object(
              'prepara_errori', COALESCE((contenuto->>'prepara_errori')::int, 0) + 1)
      WHERE id = $1`,
    [bozzaId]
  );
}

/**
 * Genera (o rifà) l'immagine di una bozza e la scrive in `contenuto.foto`,
 * che e' il campo che il router manda a Google e al blog.
 */
/** Cosa serve per fare l'immagine di una bozza: il soggetto e la cartella del cliente. */
export async function soggettoBozza(bozzaId: number) {
  const [b] = await query<{
    tipo: string;
    stato: string;
    slug: string;
    categoria: string | null;
    citta: string | null;
    titolo: string | null;
    fatto: string | null;
    angolo: string | null;
  }>(
    `SELECT b.tipo, b.stato, a.slug, a.categoria, a.citta,
            b.contenuto->>'titolo' AS titolo, b.contenuto->>'fatto' AS fatto, b.contenuto->>'angolo' AS angolo
       FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.id = $1`,
    [bozzaId]
  );
  return b ?? null;
}

export async function mettiImmagine(bozzaId: number): Promise<string> {
  const b = await soggettoBozza(bozzaId);
  if (!b) throw new Error('bozza inesistente');
  if (!['vuota', 'generata', 'attesa_approvazione', 'approvata'].includes(b.stato)) {
    throw new Error(`è «${b.stato}»: l'immagine di un post già partito non si cambia da qui`);
  }
  const img = await immaginePerPost(
    { categoria: b.categoria, citta: b.citta, titolo: b.titolo, fatto: b.fatto, angolo: b.angolo },
    { cliente: b.slug }
  );
  await query(
    `UPDATE wesion.bozza
        SET contenuto = (contenuto - 'prepara_errori')
              || jsonb_build_object('foto', $2::text, 'foto_ai', jsonb_build_object('modello', $3::text, 'prompt', $4::text))
      WHERE id = $1`,
    [bozzaId, img.url, img.modello, img.prompt]
  );
  return img.url;
}

/**
 * IL click. Approva tutto quello che nel mese e' pronto da approvare.
 *
 * Restano fuori, e si dice quali:
 *   - quelle con un avviso GRAVE del controllo automatico (numeri inventati,
 *     telefono sbagliato…): si guardano una per una, non passano in blocco;
 *   - quelle con la data gia' passata: un post di Halloween approvato il 5
 *     novembre uscirebbe subito, ed e' peggio di non uscire;
 *   - quelle senza testo (non dovrebbero esserci, ma la guardia sta qui).
 *
 * Stessa forma della rotta di approvazione singola (CTE con RETURNING e
 * count): su CockroachDB una CTE che scrive senza essere guardata puo' non
 * eseguire, e la traccia dell'evento sparirebbe. Vedi STATO.md §19.
 */
export async function approvaMese(
  aziendaId: number,
  anno: number,
  mese: number,
  operatore: string
): Promise<{ approvate: number; saltateGravi: number; saltatePassate: number }> {
  const [inizio, fine] = confini(anno, mese);
  const voci = await vociMese(aziendaId, anno, mese);
  const daApprovare = voci.filter((v) => v.stato === 'attesa_approvazione');
  const adesso = Date.now();
  const ids = daApprovare
    .filter((v) => !v.grave && new Date(v.pubblica_at).getTime() >= adesso && (v.testo ?? '').trim())
    .map((v) => v.id);

  let approvate = 0;
  if (ids.length) {
    const [r] = await query<{ approvate: string; tracciati: string }>(
      `WITH decisa AS (
         UPDATE wesion.bozza
            SET stato = 'approvata', approvata_da = $2, approvata_via = 'dashboard', approvata_at = now()
          WHERE id = ANY($1::bigint[]) AND azienda_id = $3 AND stato = 'attesa_approvazione'
            AND pubblica_at >= $4 AND pubblica_at < $5
            AND (scade_at IS NULL OR scade_at > now())
          RETURNING id, azienda_id, tipo
       ), tracciata AS (
         INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
         SELECT azienda_id, 'bozza_approvata', $2,
                jsonb_build_object('bozza_id', id, 'tipo', tipo, 'via', 'mese_in_un_click')
           FROM decisa
         RETURNING id
       )
       SELECT (SELECT count(*) FROM decisa) AS approvate, (SELECT count(*) FROM tracciata) AS tracciati`,
      [ids, operatore, aziendaId, inizio, fine]
    );
    approvate = Number(r?.approvate ?? 0);
  }

  return {
    approvate,
    saltateGravi: daApprovare.filter((v) => v.grave).length,
    saltatePassate: daApprovare.filter((v) => !v.grave && new Date(v.pubblica_at).getTime() < adesso).length,
  };
}
