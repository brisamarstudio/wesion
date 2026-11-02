/**
 * «Approva il mese»: l'ultimo bottone, uno solo per tutto il mese.
 *
 * Come la rotta di approvazione singola, qui NON si pubblica niente: si scrive
 * `approvata`, e il router pubblica ogni uscita nel suo giorno. Restano fuori
 * gli avvisi gravi e le date passate (vedi `approvaMese`).
 */
import { NextResponse } from 'next/server';
import { approvaMese } from '@/lib/mese';

/** Come in api/bozze/[id]/route.ts: la firma di chi decide dalla dashboard. */
const OPERATORE = 'dashboard';

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  const corpo = (await richiesta.json().catch(() => ({}))) as { anno?: number; mese?: number };
  const anno = Number(corpo.anno);
  const mese = Number(corpo.mese);
  if (!anno || !mese || mese < 1 || mese > 12) return NextResponse.json({ errore: 'servono anno e mese' }, { status: 400 });

  try {
    return NextResponse.json(await approvaMese(aziendaId, anno, mese, OPERATORE));
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 500 });
  }
}
