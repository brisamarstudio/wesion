/**
 * Scrivere il testo di uno slot vuoto.
 *
 * POST perché spende una chiamata a un modello e cambia lo stato della bozza:
 * non deve poter partire da un prefetch del browser o da un link aperto per
 * sbaglio.
 *
 * Non pubblica niente e non approva niente: porta la bozza da `vuota` a
 * `attesa_approvazione`, cioè la mette in fila davanti a una persona.
 */
import { NextResponse } from 'next/server';
import { scriviBozza } from '@/lib/scrivi';

export async function POST(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const bozzaId = Number(id);
  if (!Number.isFinite(bozzaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  try {
    return NextResponse.json(await scriviBozza(bozzaId));
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json({ errore: motivo }, { status: 400 });
  }
}
