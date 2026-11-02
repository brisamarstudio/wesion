/**
 * Il PC delle immagini riconsegna una foto (corpo = i byte dell'immagine),
 * oppure dice che non ci è riuscito (corpo JSON { errore }).
 *
 * Il caricamento sul media server lo fa il SERVER, non il PC: il token del
 * media server resta dov'è, e sul PC c'è solo il suo.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verificaLavoratore } from '@/lib/lavoratore';
import { caricaPubblico } from '@/lib/waha';

const MAX_BYTE = 12 * 1024 * 1024;

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const nome = await verificaLavoratore(richiesta);
  if (!nome) return NextResponse.json({ errore: 'token non valido' }, { status: 401 });
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isSafeInteger(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const tipo = richiesta.headers.get('content-type') ?? '';

  if (tipo.includes('application/json')) {
    const { errore } = (await richiesta.json().catch(() => ({}))) as { errore?: string };
    await query(
      `UPDATE wesion.bozza
          SET contenuto = (contenuto - 'foto_in_corso') || jsonb_build_object(
                'prepara_errori', COALESCE((contenuto->>'prepara_errori')::int, 0) + 1)
        WHERE id = $1`,
      [bozzaId]
    );
    await query(`UPDATE wesion.lavoratore SET ultimo_errore = $2 WHERE nome = $1`, [
      nome,
      String(errore ?? '').slice(0, 500),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (!tipo.startsWith('image/')) return NextResponse.json({ errore: 'serve un file immagine' }, { status: 400 });
  const dati = Buffer.from(await richiesta.arrayBuffer());
  if (!dati.length || dati.length > MAX_BYTE) {
    return NextResponse.json({ errore: 'immagine vuota o troppo grande' }, { status: 400 });
  }

  const [b] = await query<{ slug: string }>(
    `SELECT a.slug FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id WHERE b.id = $1`,
    [bozzaId]
  );
  if (!b) return NextResponse.json({ errore: 'bozza inesistente' }, { status: 404 });

  const url = await caricaPubblico(dati, tipo, { cliente: b.slug, tipo: 'gbp' });
  if (!url) return NextResponse.json({ errore: 'media server non disponibile' }, { status: 502 });

  const modello = richiesta.headers.get('x-modello') ?? 'comfyui';
  // Solo se è ancora senza foto: se nel frattempo qualcuno l'ha messa a mano
  // (o l'ha rifatta OpenRouter) vince quella, non questa.
  await query(
    `UPDATE wesion.bozza
        SET contenuto = (contenuto - 'foto_in_corso' - 'prepara_errori')
              || jsonb_build_object('foto', $2::text, 'foto_ai', jsonb_build_object('modello', $3::text, 'da', $4::text))
      WHERE id = $1 AND COALESCE(contenuto->>'foto', '') = ''
        AND stato = 'attesa_approvazione'`,
    [bozzaId, url, modello, nome]
  );
  await query(`UPDATE wesion.lavoratore SET ultimo_errore = NULL WHERE nome = $1`, [nome]);
  return NextResponse.json({ url });
}
