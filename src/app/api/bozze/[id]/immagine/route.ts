/**
 * Caricare l'immagine di copertina di una bozza.
 *
 * Va su `media.mywebby.it`, non nel nostro database: sia Google sia il blog
 * vogliono una URL PUBBLICA, e un'immagine dentro Postgres non ce l'ha. E'
 * lo stesso `upload.php` condiviso da tutti i siti — distingue i clienti col
 * campo `cliente`, quindi per un cliente nuovo non si crea niente.
 *
 * ⚠️ Il tetto e' 8 MB e il tipo deve essere un'immagine. Non e' diffidenza
 * verso chi carica: e' che una foto da telefono moderna supera tranquillamente
 * i 10 MB, e scoprirlo da un errore di upload.php dopo trenta secondi di attesa
 * e' peggio che sentirselo dire subito.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { caricaPubblico } from '@/lib/waha';

const MAX_BYTE = 8 * 1024 * 1024;

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isFinite(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const modulo = await richiesta.formData().catch(() => null);
  const file = modulo?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ errore: 'serve un file nel campo "file"' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ errore: `il file e' ${file.type || 'di tipo ignoto'}, serve un'immagine` }, { status: 400 });
  }
  if (file.size > MAX_BYTE) {
    return NextResponse.json(
      { errore: `l'immagine pesa ${Math.round(file.size / 1024 / 1024)} MB, il massimo e' 8` },
      { status: 400 }
    );
  }

  /**
   * La cartella la decide il DATABASE, non chi carica: e' un pezzo di percorso
   * sul media server, e uno slug accettato dal browser vorrebbe dire scrivere
   * dove dice il client. Se la bozza non c'e', `caricaPubblico` ripiega da solo.
   */
  const [b] = await query<{ slug: string; tipo: string }>(
    `SELECT a.slug, b.tipo FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id WHERE b.id = $1`,
    [bozzaId]
  );

  const url = await caricaPubblico(Buffer.from(await file.arrayBuffer()), file.type, {
    cliente: b?.slug,
    tipo: b?.tipo === 'post_gbp' ? 'gbp' : b?.tipo === 'articolo' ? 'blog' : 'menu',
  });
  if (!url) {
    return NextResponse.json(
      { errore: 'il media server non ha accettato il file. Controlla MEDIA_UPLOAD_TOKEN.' },
      { status: 502 }
    );
  }

  await query(
    `UPDATE wesion.bozza SET contenuto = contenuto || jsonb_build_object('foto', $2::text) WHERE id = $1`,
    [bozzaId, url]
  );

  return NextResponse.json({ url });
}

/**
 * Togliere la copertina dalla bozza.
 *
 * ⚠️ TOGLIE IL RIFERIMENTO, NON IL FILE. Su `media.mywebby.it` l'immagine resta:
 * la stessa URL puo' essere gia' finita in un post pubblicato su Google, e
 * cancellare il file lascerebbe un buco in una scheda che non controlliamo piu'.
 * Lo spazio di un jpg costa meno di una copertina rotta su un post vivo.
 */
export async function DELETE(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isFinite(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  await query(`UPDATE wesion.bozza SET contenuto = contenuto - 'foto' WHERE id = $1`, [bozzaId]);
  return NextResponse.json({ tolta: true });
}
