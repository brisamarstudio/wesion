/**
 * Rifà l'immagine AI di una bozza. Per quando quella uscita non va: un click,
 * ~7 secondi, ~4 centesimi. Vedi src/lib/immagini.ts.
 */
import { NextResponse } from 'next/server';
import { mettiImmagine } from '@/lib/mese';

export const maxDuration = 120;

export async function POST(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isSafeInteger(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  try {
    return NextResponse.json({ foto: await mettiImmagine(bozzaId) });
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 409 });
  }
}
