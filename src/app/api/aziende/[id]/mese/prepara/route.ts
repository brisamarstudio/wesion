/**
 * Un passo della preparazione del mese (piano, testi, immagini). La pagina la
 * richiama finche' non risponde `finito`. Passi corti apposta: vedi la nota
 * in cima a src/lib/mese.ts. Non approva niente.
 */
import { NextResponse } from 'next/server';
import { preparaPasso } from '@/lib/mese';

export const maxDuration = 120;

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  const corpo = (await richiesta.json().catch(() => ({}))) as { anno?: number; mese?: number };
  const anno = Number(corpo.anno);
  const mese = Number(corpo.mese);
  if (!anno || !mese || mese < 1 || mese > 12) return NextResponse.json({ errore: 'servono anno e mese' }, { status: 400 });

  try {
    return NextResponse.json(await preparaPasso(aziendaId, anno, mese));
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 500 });
  }
}
