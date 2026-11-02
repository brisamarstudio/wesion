/**
 * Il mese di un cliente: stato e tutte le uscite, per leggerlo prima di
 * approvarlo. Sola lettura. Vedi src/lib/mese.ts.
 */
import { NextResponse } from 'next/server';
import { statoMese, vociMese, doveEsce } from '@/lib/mese';

export async function GET(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  const p = new URL(richiesta.url).searchParams;
  const anno = Number(p.get('anno'));
  const mese = Number(p.get('mese'));
  if (!anno || !mese || mese < 1 || mese > 12) return NextResponse.json({ errore: 'servono anno e mese' }, { status: 400 });

  const [stato, voci, dove] = await Promise.all([
    statoMese(aziendaId, anno, mese),
    vociMese(aziendaId, anno, mese),
    doveEsce(aziendaId),
  ]);
  return NextResponse.json({ stato, voci, dove });
}
