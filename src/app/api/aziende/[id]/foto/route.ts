/**
 * L'archivio delle foto vere di un cliente. Vedi src/lib/foto.ts.
 *
 * GET    → l'elenco
 * POST   → carica una o più foto (campo «file», anche ripetuto)
 * DELETE → ?foto=<id> la toglie dall'archivio (non dal media server: la stessa
 *          URL puo' essere gia' su un post uscito)
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { caricaFotoVera, elencoFoto, assegnaFotoVere, importaFotoGoogle, segnaFotoGoogleControllate } from '@/lib/foto';

export const maxDuration = 300;
const MAX_BYTE = 8 * 1024 * 1024;

function idAzienda(id: string): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const aziendaId = idAzienda((await contesto.params).id);
  if (!aziendaId) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  return NextResponse.json({ foto: await elencoFoto(aziendaId) });
}

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const aziendaId = idAzienda((await contesto.params).id);
  if (!aziendaId) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  // ?assegna=AAAA-MM: «usa le foto vere al posto di quelle AI» in quel mese.
  const assegna = new URL(richiesta.url).searchParams.get('assegna');
  if (assegna && /^\d{4}-\d{2}$/.test(assegna)) {
    const [anno, mese] = assegna.split('-').map(Number);
    const n = await assegnaFotoVere(
      aziendaId,
      new Date(anno, mese - 1, 1).toISOString(),
      new Date(anno, mese, 1).toISOString(),
      true
    );
    return NextResponse.json({ assegnate: n });
  }

  // ?google=1: prende le foto dalla scheda Google, a pezzi (la pagina richiama
  // finche' `restano` non e' zero).
  if (new URL(richiesta.url).searchParams.get('google')) {
    try {
      const esito = await importaFotoGoogle(aziendaId, 8);
      if (esito.restano === 0) await segnaFotoGoogleControllate(aziendaId, esito.importate);
      return NextResponse.json(esito);
    } catch (e) {
      return NextResponse.json({ errore: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  const modulo = await richiesta.formData().catch(() => null);
  const file = (modulo?.getAll('file') ?? []).filter((f): f is File => f instanceof File);
  if (!file.length) return NextResponse.json({ errore: 'nessun file nel campo "file"' }, { status: 400 });

  const caricate = [];
  const scartate: string[] = [];
  // Una alla volta: ognuna passa dal modello che la descrive, e venti
  // chiamate insieme sono il modo piu' rapido per farsene rifiutare meta'.
  for (const f of file.slice(0, 40)) {
    if (!f.type.startsWith('image/')) {
      scartate.push(`${f.name}: non è un'immagine`);
      continue;
    }
    if (f.size > MAX_BYTE) {
      scartate.push(`${f.name}: più di 8 MB`);
      continue;
    }
    try {
      caricate.push(await caricaFotoVera(aziendaId, Buffer.from(await f.arrayBuffer()), f.type, 'dashboard'));
    } catch (e) {
      scartate.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return NextResponse.json({ caricate, scartate });
}

export async function DELETE(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const aziendaId = idAzienda((await contesto.params).id);
  const fotoId = Number(new URL(richiesta.url).searchParams.get('foto'));
  if (!aziendaId || !Number.isSafeInteger(fotoId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  await query(`UPDATE wesion.foto SET attiva = false WHERE id = $1 AND azienda_id = $2`, [fotoId, aziendaId]);
  return NextResponse.json({ tolta: true });
}
