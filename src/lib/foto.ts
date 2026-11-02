/**
 * Le foto VERE di un cliente: un archivio da cui il mese pesca prima di
 * generare.
 *
 * ⚠️ PERCHE' (02/11/2026). Le immagini AI vanno bene come riempitivo, ma
 * l'immagine di un post dovrebbe essere il locale com'e': chi arriva trova
 * quello che ha visto, e Google premia le foto vere sulla scheda. Mariano:
 * «manca la possibilità di uploadare le REAL IMAGES». Una foto per post,
 * caricata a mano ogni mese, sarebbe di nuovo il lavoro che il mese in un
 * click ha tolto. Quindi: si caricano una volta venti-trenta foto, e il mese
 * le assegna da solo, una per post, senza ripeterle nello stesso mese.
 *
 * COME SCEGLIE. Ogni foto, appena caricata, viene descritta da un modello che
 * vede le immagini (poche parole + parole chiave). Per ogni post senza foto si
 * confrontano le parole del suo tema con quelle delle foto: vince la foto con
 * piu' parole in comune, a parita' quella usata meno. Se nessuna c'entra, il
 * post resta all'AI — una foto vera sbagliata (la sala per un post sul pesce)
 * e' peggio di una generata giusta.
 */
import { query } from './db';
import { caricaPubblico } from './waha';

const MODELLO_VISTA = process.env.FOTO_MODELLO_VISTA || 'google/gemini-3.5-flash-lite';

export interface FotoVera {
  id: number;
  url: string;
  descrizione: string | null;
  parole: string[];
  usata: number;
  creata_at: string;
}

const VUOTE = new Set(
  'il lo la i gli le un uno una di a da in con su per tra fra del della dei delle dello al alla ai alle nel nella e o ma che si non come piu più anche questo questa sono è ed per noi nostro nostra vostro vostra tuo tua'.split(
    ' '
  )
);

export function parole(testo: string): string[] {
  return [
    ...new Set(
      testo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 4 && !VUOTE.has(p))
        // «massaggi»/«massaggio», «camere»/«camera»: basta la radice.
        .map((p) => p.slice(0, 6))
    ),
  ];
}

/** Descrive la foto in italiano: una riga e le parole chiave. */
export async function descrivi(dati: Buffer, mime: string, contesto: string): Promise<{ descrizione: string; chiavi: string }> {
  const chiave = process.env.OPENROUTER_API_KEY;
  if (!chiave) return { descrizione: '', chiavi: '' };
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO_VISTA,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Questa è una foto vera di ${contesto}. Descrivila in italiano per sceglierla come immagine di un post. ` +
                  'Rispondi SOLO con un JSON: {"descrizione": "una frase, max 20 parole, cosa si vede", ' +
                  '"chiavi": "8-12 parole chiave in italiano separate da virgola: oggetti, ambienti, piatti, servizi, atmosfera"}. ' +
                  'Non inventare: solo quello che si vede.',
              },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${dati.toString('base64')}` } },
            ],
          },
        ],
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
    const t = j.choices?.[0]?.message?.content ?? '';
    const m = t.match(/\{[\s\S]*\}/);
    const o = m ? (JSON.parse(m[0]) as { descrizione?: string; chiavi?: string }) : {};
    return { descrizione: String(o.descrizione ?? '').slice(0, 300), chiavi: String(o.chiavi ?? '').slice(0, 400) };
  } catch {
    // Senza descrizione la foto si salva lo stesso: semplicemente il mese non
    // sapra' a quale post darla, e la si puo' comunque mettere a mano.
    return { descrizione: '', chiavi: '' };
  }
}

export async function caricaFotoVera(
  aziendaId: number,
  dati: Buffer,
  mime: string,
  fonte: 'dashboard' | 'whatsapp'
): Promise<FotoVera> {
  const [a] = await query<{ slug: string; nome: string; categoria: string | null; citta: string | null }>(
    `SELECT slug, nome, categoria, citta FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!a) throw new Error('azienda inesistente');
  const url = await caricaPubblico(dati, mime, { cliente: a.slug, tipo: 'gbp' });
  if (!url) throw new Error('il media server non ha accettato la foto');
  const { descrizione, chiavi } = await descrivi(
    dati,
    mime,
    `«${a.nome}»${a.categoria ? `, ${a.categoria}` : ''}${a.citta ? ` a ${a.citta}` : ''}`
  );
  const [f] = await query<{ id: number; creata_at: string }>(
    `INSERT INTO wesion.foto (azienda_id, url, descrizione, chiavi, fonte)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, creata_at`,
    [aziendaId, url, descrizione || null, chiavi || null, fonte]
  );
  return { id: Number(f.id), url, descrizione: descrizione || null, parole: parole(`${descrizione} ${chiavi}`), usata: 0, creata_at: f.creata_at };
}

export async function elencoFoto(aziendaId: number): Promise<FotoVera[]> {
  const righe = await query<{ id: number; url: string; descrizione: string | null; chiavi: string | null; usata: number; creata_at: string }>(
    `SELECT id, url, descrizione, chiavi, usata, creata_at FROM wesion.foto
      WHERE azienda_id = $1 AND attiva ORDER BY creata_at DESC`,
    [aziendaId]
  );
  return righe.map((r) => ({
    id: Number(r.id),
    url: r.url,
    descrizione: r.descrizione,
    parole: parole(`${r.descrizione ?? ''} ${r.chiavi ?? ''}`),
    usata: Number(r.usata),
    creata_at: r.creata_at,
  }));
}

/**
 * Dà una foto vera ai post del mese che non ne hanno, quando ce n'e' una che
 * c'entra. Torna quante ne ha assegnate.
 */
export async function assegnaFotoVere(
  aziendaId: number,
  inizio: string,
  fine: string,
  /** Anche sopra le immagini GENERATE (mai sopra una foto messa a mano). */
  sopraAI = false
): Promise<number> {
  const foto = await elencoFoto(aziendaId);
  if (!foto.length) return 0;

  const posts = await query<{ id: number; testo: string; foto_vera: string | null; foto: string | null; foto_ai: string | null; stato: string }>(
    `SELECT id, stato, contenuto->>'foto' AS foto, contenuto->>'foto_vera' AS foto_vera, contenuto->>'foto_ai' AS foto_ai,
            concat_ws(' ', contenuto->>'titolo', contenuto->>'fatto', contenuto->>'angolo', contenuto->>'testo') AS testo
       FROM wesion.bozza
      WHERE azienda_id = $1 AND origine = 'piano' AND tipo IN ('post_gbp', 'articolo')
        AND stato <> 'rifiutata' AND pubblica_at >= $2 AND pubblica_at < $3
      ORDER BY pubblica_at`,
    [aziendaId, inizio, fine]
  );

  /**
   * ⚠️ LE PAROLE DEL MESTIERE NON CONTANO (02/11/2026). Per un falegname
   * «legno» e «falegnameria» stanno in ogni post: con un conteggio semplice
   * ogni foto del laboratorio andava bene per ogni post, e vinceva a caso.
   * Ogni parola pesa per quanto e' RARA fra i post del mese: «laccato» o
   * «cabina armadio» decidono, «legno» quasi no.
   */
  const parolePost = posts.map((p) => parole(p.testo));
  const inQuanti = new Map<string, number>();
  for (const ws of parolePost) for (const w of ws) inQuanti.set(w, (inQuanti.get(w) ?? 0) + 1);
  const peso = (w: string) => 1 - (inQuanti.get(w) ?? 0) / Math.max(1, posts.length) + 0.05;

  // Le foto gia' usate in questo mese non si ripetono.
  const giaUsate = new Set(posts.map((p) => Number(p.foto_vera)).filter(Boolean));
  let assegnate = 0;

  for (const [i, p] of posts.entries()) {
    if (p.stato !== 'attesa_approvazione') continue;
    const libera = !p.foto || (sopraAI && Boolean(p.foto_ai) && !p.foto_vera);
    if (!libera) continue;
    const sue = parolePost[i];
    let migliore: { f: FotoVera; punti: number } | null = null;
    for (const f of foto) {
      if (giaUsate.has(f.id)) continue;
      const comuni = f.parole.filter((w) => sue.includes(w));
      // Almeno due parole in comune, e almeno una che non sia del mestiere.
      if (comuni.length < 2) continue;
      const punti = comuni.reduce((t, w) => t + peso(w), 0);
      if (punti < 0.5) continue;
      if (!migliore || punti > migliore.punti || (punti === migliore.punti && f.usata < migliore.f.usata)) {
        migliore = { f, punti };
      }
    }
    if (!migliore) continue;
    await query(
      `UPDATE wesion.bozza
          SET contenuto = (contenuto - 'foto_in_corso' - 'foto_ai')
                || jsonb_build_object('foto', $2::text, 'foto_vera', $3::bigint)
        WHERE id = $1 AND stato = 'attesa_approvazione'
          AND (COALESCE(contenuto->>'foto', '') = '' OR (contenuto ? 'foto_ai' AND NOT contenuto ? 'foto_vera'))`,
      [p.id, migliore.f.url, migliore.f.id]
    );
    await query(`UPDATE wesion.foto SET usata = usata + 1, usata_at = now() WHERE id = $1`, [migliore.f.id]);
    giaUsate.add(migliore.f.id);
    assegnate++;
  }
  return assegnate;
}
