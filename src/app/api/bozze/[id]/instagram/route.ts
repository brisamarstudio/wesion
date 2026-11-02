/**
 * «Pubblica su Instagram» — l'ultimo bottone, quello dell'operatore.
 *
 * Una bozza social, con testo e foto, esce su Instagram ADESSO. Niente parte da
 * sola: serve il click e serve `conferma: true` nel corpo, cosi' un
 * ripasso involontario della rotta non pubblica nulla.
 *
 * ORDINE DELLE COSE, e perche':
 *  1. si PRENDE la bozza (`pubblicando`) con un UPDATE condizionato: due click
 *     ravvicinati o due schede aperte non pubblicano due volte lo stesso post;
 *  2. si parla con Meta;
 *  3. riuscito -> `pubblicata`, con l'indirizzo del post dentro la bozza e una
 *     riga nella traccia; fallito -> la bozza torna com'era, con l'errore in
 *     chiaro. Mai una bozza lasciata in `pubblicando` ne' un errore muto.
 *
 * Vedi la nota in cima a `lib/instagram.ts` sul perche' questa rotta pubblica
 * invece di lasciarlo al router.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { costruisciDidascalia, leggiConfigInstagram, pubblicaFotoSuInstagram } from '@/lib/instagram';

const OPERATORE = 'dashboard';
/** Da quali stati si puo' pubblicare: tutti tranne quelli che dicono «finita». */
const PUBBLICABILI = ['vuota', 'generata', 'attesa_approvazione', 'approvata'];

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isSafeInteger(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const corpo = (await richiesta.json().catch(() => ({}))) as { conferma?: boolean };
  if (corpo.conferma !== true) {
    return NextResponse.json({ errore: 'manca la conferma: nulla è stato pubblicato' }, { status: 400 });
  }

  const [b] = await query<{
    id: number;
    azienda_id: number;
    tipo: string;
    stato: string;
    contenuto: Record<string, unknown>;
    slug: string;
    config: Record<string, unknown> | null;
  }>(
    `SELECT b.id, b.azienda_id, b.tipo, b.stato, b.contenuto, a.slug, s.config
       FROM wesion.bozza b
       JOIN wesion.azienda a ON a.id = b.azienda_id
       LEFT JOIN wesion.servizio s ON s.azienda_id = b.azienda_id AND s.tipo = 'social' AND s.attivo
      WHERE b.id = $1`,
    [bozzaId]
  );
  if (!b) return NextResponse.json({ errore: 'questa bozza non c’è' }, { status: 404 });

  if (b.tipo !== 'social') {
    return NextResponse.json({ errore: 'Solo i post social escono su Instagram.' }, { status: 409 });
  }
  if (String(b.contenuto.canale ?? 'instagram') !== 'instagram') {
    return NextResponse.json({ errore: 'Questo post è per un altro canale, non per Instagram.' }, { status: 409 });
  }
  if ((b.contenuto.instagram as { media_id?: string } | undefined)?.media_id) {
    return NextResponse.json({ errore: 'Questo post è già uscito su Instagram.' }, { status: 409 });
  }
  if (!PUBBLICABILI.includes(b.stato)) {
    return NextResponse.json({ errore: `La bozza non si può pubblicare: adesso è "${b.stato}".`, stato: b.stato }, { status: 409 });
  }

  const cfg = leggiConfigInstagram(b.config);
  if (!cfg) {
    return NextResponse.json(
      { errore: 'Instagram non è collegato a questo cliente: nella scheda, sezione Social, mancano l’id dell’account e il token.' },
      { status: 409 }
    );
  }

  const testo = String(b.contenuto.testo ?? b.contenuto.summary ?? '').trim();
  if (!testo) return NextResponse.json({ errore: 'Questa bozza non ha ancora un testo.' }, { status: 409 });
  const foto = String(b.contenuto.foto ?? b.contenuto.foto_ai ?? '').trim();
  if (!/^https:\/\//.test(foto)) {
    return NextResponse.json({ errore: 'Instagram non pubblica senza foto: aggiungi una copertina alla bozza.' }, { status: 409 });
  }

  let didascalia: string;
  try {
    didascalia = costruisciDidascalia(testo, b.contenuto.hashtag);
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }

  // 1. LA PRESA
  const presa = await query<{ id: number }>(
    `UPDATE wesion.bozza SET stato = 'pubblicando' WHERE id = $1 AND stato = ANY($2) RETURNING id`,
    [bozzaId, PUBBLICABILI]
  );
  if (presa.length === 0) {
    return NextResponse.json({ errore: 'Qualcun altro la sta già pubblicando o è appena cambiata: ricarica.' }, { status: 409 });
  }

  // 2. META
  try {
    const esito = await pubblicaFotoSuInstagram(cfg, { urlFotoOriginale: foto, didascalia, slugCliente: b.slug });

    // 3. RIUSCITO
    const info = { media_id: esito.mediaId, permalink: esito.permalink, pubblicata_at: new Date().toISOString(), operatore: OPERATORE };
    await query(
      `UPDATE wesion.bozza SET stato = 'pubblicata', contenuto = contenuto || jsonb_build_object('instagram', $2::jsonb) WHERE id = $1`,
      [bozzaId, JSON.stringify(info)]
    );
    await query(
      `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'bozza_pubblicata_instagram', $2, $3::jsonb)`,
      [b.azienda_id, OPERATORE, JSON.stringify({ bozza_id: bozzaId, media_id: esito.mediaId, permalink: esito.permalink })]
    );
    return NextResponse.json({ ok: true, permalink: esito.permalink });
  } catch (e) {
    // FALLITO: la bozza torna com'era, e l'errore resta scritto dove si vede.
    const messaggio = e instanceof Error ? e.message : String(e);
    await query(`UPDATE wesion.bozza SET stato = $2 WHERE id = $1 AND stato = 'pubblicando'`, [bozzaId, b.stato]);
    await query(
      `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'bozza_instagram_fallita', $2, $3::jsonb)`,
      [b.azienda_id, OPERATORE, JSON.stringify({ bozza_id: bozzaId, errore: messaggio.slice(0, 500) })]
    ).catch(() => undefined);
    return NextResponse.json({ errore: messaggio }, { status: 502 });
  }
}
