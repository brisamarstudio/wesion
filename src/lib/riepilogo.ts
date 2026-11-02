/**
 * Il riepilogo del mese per il cliente: il lavoro che fa MyWebby, reso visibile.
 *
 * ⚠️ PERCHÉ (02/11/2026). «Ogni santissimo mese analizzo le query e sistemiamo
 * … sto lavoro VA PAGATO, devo farlo percepire» (Mariano, fissando a 120 € il
 * pacchetto fino a 10 camere). Post, articoli e correzioni al sito escono da
 * soli: proprio per questo il cliente non li vede, e per lui il canone paga
 * «il sito». Una volta al mese gli si dice in quattro righe cosa e' successo.
 *
 * ⚠️ NON PARTE DA SOLO. Wesion lo prepara; Mariano lo legge, se vuole lo
 * corregge, e lo manda lui con un click (apre WhatsApp col testo pronto).
 * L'ultimo bottone e' dell'operatore, e un messaggio a un cliente lo e' piu'
 * di tutto il resto.
 *
 * Solo numeri certi: post e articoli contati dalle pubblicazioni riuscite,
 * clic e impressioni da Search Console per il mese solare intero. Se un dato
 * manca la riga non c'e' — non si scrive «0 clic» a un cliente perche' la
 * Search Console non e' collegata.
 */
import { query } from './db';
import { tokenAccessoGSC } from './search-console';
import { perchéRumore } from './giro-query';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

export interface Riepilogo {
  aziendaId: number;
  nome: string;
  anno: number;
  mese: number;
  postUsciti: number;
  articoliUsciti: number;
  clic: number | null;
  clicPrima: number | null;
  impressioni: number | null;
  ricerche: string[];
  /** Il numero WhatsApp del titolare, solo cifre col prefisso; null se non c'e'. */
  whatsapp: string | null;
  testo: string;
  /** Quando Mariano ha aperto WhatsApp per mandarlo, se l'ha fatto. */
  apertoAt: string | null;
}

/**
 * ⚠️ RICERCHE DA NON SCRIVERE MAI A UN CLIENTE (02/11/2026). Fra le ricerche
 * di ottobre di Chumphon c'era «massaggi erotici binasco»: e' vera, Google l'ha
 * mostrata, ma metterla in un messaggio a una massaggiatrice thai e' un
 * insulto. Fuori tutto quello che sa di sesso, offese o concorrenza sleale.
 */
const IMPRESENTABILI =
  /\b(erotic\w*|sex\w*|sess\w*|escort|happy ?ending|nud\w*|hard|porn\w*|hot|prostitut\w*|squillo|lucciol\w*|trans|gay|incontri|truffa\w*|recension\w* negativ\w*)\b/i;

/** «1230» → «1.230»: Intl su server a volte non ha l'italiano. */
function migliaia(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Totali del mese e prime ricerche, da Search Console. */
async function datiGoogle(
  proprieta: string,
  anno: number,
  mese: number
): Promise<{ clic: number; impressioni: number; ricerche: Array<{ q: string; clic: number; impressioni: number }> }> {
  const token = await tokenAccessoGSC();
  const inizio = iso(new Date(Date.UTC(anno, mese - 1, 1)));
  const fine = iso(new Date(Date.UTC(anno, mese, 0)));
  const chiama = async (corpo: object) => {
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(proprieta)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: inizio, endDate: fine, ...corpo }),
      }
    );
    if (!r.ok) throw new Error(`Search Console: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number }> };
  };
  const [totale, perQuery] = await Promise.all([chiama({}), chiama({ dimensions: ['query'], rowLimit: 50 })]);
  const t = totale.rows?.[0];
  return {
    clic: t?.clicks ?? 0,
    impressioni: t?.impressions ?? 0,
    ricerche: (perQuery.rows ?? []).map((r) => ({
      q: r.keys?.[0] ?? '',
      clic: r.clicks ?? 0,
      impressioni: r.impressions ?? 0,
    })),
  };
}

function scriviTesto(r: Omit<Riepilogo, 'testo' | 'apertoAt' | 'whatsapp'>): string {
  const nomeMese = MESI[r.mese - 1];
  const prossimo = MESI[r.mese % 12];
  const righe: string[] = [];
  if (r.postUsciti) {
    righe.push(`• ${r.postUsciti} ${r.postUsciti === 1 ? 'post pubblicato' : 'post pubblicati'} sulla tua scheda Google`);
  }
  if (r.articoliUsciti) {
    righe.push(`• ${r.articoliUsciti} ${r.articoliUsciti === 1 ? 'articolo nuovo' : 'articoli nuovi'} sul tuo sito`);
  }
  if (r.clic !== null && r.clic > 0) {
    let confronto = '';
    if (r.clicPrima !== null && r.clicPrima > 0) {
      const delta = Math.round(((r.clic - r.clicPrima) / r.clicPrima) * 100);
      if (delta >= 5) confronto = ` (+${delta}% rispetto a ${MESI[(r.mese + 10) % 12]})`;
    }
    righe.push(
      `• ${migliaia(r.clic)} ${r.clic === 1 ? 'persona è arrivata' : 'persone sono arrivate'} sul tuo sito da Google${confronto}`
    );
  }
  if (r.impressioni !== null && r.impressioni >= 100) {
    righe.push(`• il tuo sito è comparso ${migliaia(r.impressioni)} volte nelle ricerche`);
  }
  if (r.ricerche.length) {
    righe.push(`• ti trovano cercando: ${r.ricerche.map((q) => `«${q}»`).join(', ')}`);
  }
  if (!righe.length) return '';
  return [
    `Ciao! Ecco com'è andato ${nomeMese} per ${r.nome} 👇`,
    '',
    ...righe,
    '',
    `A ${prossimo} si continua così. Per qualsiasi cosa scrivimi qui.`,
    'Mariano — MyWebby',
  ].join('\n');
}

export async function preparaRiepiloghi(anno: number, mese: number): Promise<Riepilogo[]> {
  const inizio = new Date(anno, mese - 1, 1).toISOString();
  const fine = new Date(anno, mese, 1).toISOString();
  const clienti = await query<{
    id: number;
    nome: string;
    gsc: string | null;
    post: number;
    articoli: number;
    whatsapp: string | null;
    aperto_at: string | null;
  }>(
    `SELECT a.id, a.nome,
            (SELECT s.gsc_proprieta FROM wesion.sito s WHERE s.azienda_id = a.id) AS gsc,
            (SELECT count(DISTINCT p.bozza_id)::int FROM wesion.pubblicazione p JOIN wesion.bozza b ON b.id = p.bozza_id
              WHERE b.azienda_id = a.id AND p.esito = 'ok' AND p.destinazione = 'gbp'
                AND p.eseguita_at >= $1 AND p.eseguita_at < $2) AS post,
            (SELECT count(DISTINCT p.bozza_id)::int FROM wesion.pubblicazione p JOIN wesion.bozza b ON b.id = p.bozza_id
              WHERE b.azienda_id = a.id AND p.esito = 'ok' AND p.destinazione IN ('blog', 'sito') AND b.tipo = 'articolo'
                AND p.eseguita_at >= $1 AND p.eseguita_at < $2) AS articoli,
            (SELECT c.normalizzato FROM wesion.contatto c
              WHERE c.azienda_id = a.id AND c.tipo IN ('whatsapp', 'telefono') AND c.e_titolare
              ORDER BY (c.tipo = 'whatsapp') DESC, c.id LIMIT 1) AS whatsapp,
            (SELECT max(e.creato_at)::text FROM wesion.evento e
              WHERE e.azienda_id = a.id AND e.tipo = 'riepilogo_aperto'
                AND e.dettaglio->>'mese' = $3) AS aperto_at
       FROM wesion.azienda a
      WHERE a.stato = 'cliente'
      ORDER BY a.nome`,
    [inizio, fine, `${anno}-${String(mese).padStart(2, '0')}`]
  );

  const meseP = mese === 1 ? 12 : mese - 1;
  const annoP = mese === 1 ? anno - 1 : anno;

  return Promise.all(
    clienti.map(async (c) => {
      let clic: number | null = null;
      let clicPrima: number | null = null;
      let impressioni: number | null = null;
      let ricerche: string[] = [];
      if (c.gsc) {
        try {
          const [ora, prima] = await Promise.all([
            datiGoogle(c.gsc, anno, mese),
            datiGoogle(c.gsc, annoP, meseP).catch(() => null),
          ]);
          clic = ora.clic;
          impressioni = ora.impressioni;
          clicPrima = prima?.clic ?? null;
          // Le ricerche vere, non il rumore (vedi giro-query): prima quelle che
          // portano clic, poi le piu' viste. Tre bastano.
          ricerche = ora.ricerche
            .filter((r) => r.q && !perchéRumore(r.q, false) && !IMPRESENTABILI.test(r.q))
            .sort((a, b) => b.clic - a.clic || b.impressioni - a.impressioni)
            .slice(0, 3)
            .map((r) => r.q);
        } catch {
          /* Search Console giu' o non autorizzata: quelle righe semplicemente non ci sono */
        }
      }
      const base = {
        aziendaId: Number(c.id),
        nome: c.nome,
        anno,
        mese,
        postUsciti: c.post,
        articoliUsciti: c.articoli,
        clic,
        clicPrima,
        impressioni,
        ricerche,
      };
      return {
        ...base,
        whatsapp: c.whatsapp ? c.whatsapp.replace(/\D/g, '') : null,
        testo: scriviTesto(base),
        apertoAt: c.aperto_at,
      };
    })
  );
}
