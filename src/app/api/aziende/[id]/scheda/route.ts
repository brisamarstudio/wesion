/**
 * La scheda di un cliente: leggerla e salvarla.
 *
 * PUT e non PATCH perché il corpo può contenere l'elenco COMPLETO dei fatti e
 * dei servizi: quello che non c'è viene spento. Un PATCH prometterebbe una
 * modifica parziale che qui non è quello che succede.
 */
import { NextResponse } from 'next/server';
import { leggiScheda, salvaScheda, type ModificheScheda } from '@/lib/scheda';

export async function GET(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const scheda = await leggiScheda(aziendaId);
  if (!scheda) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });
  return NextResponse.json(scheda);
}

export async function PUT(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  try {
    const corpo = (await richiesta.json()) as ModificheScheda;
    const scheda = await salvaScheda(aziendaId, corpo);
    if (!scheda) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });
    return NextResponse.json(scheda);
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 400 });
  }
}
