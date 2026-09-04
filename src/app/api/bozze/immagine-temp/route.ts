/**
 * Carica un'immagine per un nuovo post al volo prima che la bozza sia salvata.
 *
 * Invia il file a `media.mywebby.it` associato allo slug del cliente e restituisce la URL pubblica.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { caricaPubblico } from '@/lib/waha';

const MAX_BYTE = 8 * 1024 * 1024;

export async function POST(richiesta: Request) {
  try {
    const modulo = await richiesta.formData().catch(() => null);
    const file = modulo?.get('file');
    const aziendaIdRaw = modulo?.get('aziendaId');

    if (!(file instanceof File)) {
      return NextResponse.json({ errore: 'serve un file nel campo "file"' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ errore: `serve un'immagine, caricato: ${file.type || 'tipo ignoto'}` }, { status: 400 });
    }
    if (file.size > MAX_BYTE) {
      return NextResponse.json({ errore: `l'immagine pesa ${Math.round(file.size / 1024 / 1024)} MB, il massimo è 8 MB` }, { status: 400 });
    }

    let clienteSlug = 'wesion';
    const aziendaId = Number(aziendaIdRaw);
    if (Number.isFinite(aziendaId) && aziendaId > 0) {
      const [a] = await query<{ slug: string }>(`SELECT slug FROM wesion.azienda WHERE id = $1`, [aziendaId]);
      if (a?.slug) clienteSlug = a.slug;
    }

    const url = await caricaPubblico(Buffer.from(await file.arrayBuffer()), file.type, {
      cliente: clienteSlug,
      tipo: 'gbp',
    });

    if (!url) {
      return NextResponse.json({ errore: 'Upload fallito sul media server. Verificare MEDIA_UPLOAD_TOKEN.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, url });
  } catch (err: any) {
    console.error('Errore upload immagine temp:', err);
    return NextResponse.json({ errore: err?.message || 'Errore interno caricamento' }, { status: 500 });
  }
}
