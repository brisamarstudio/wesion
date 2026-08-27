/**
 * Raccogliere i risultati di una campagna gia' avviata.
 *
 * Si puo' chiamare quante volte si vuole: l'inserimento va in conflitto sul
 * Place ID, quindi rilanciarla non crea doppioni. Serve piu' spesso di quanto
 * sembri — la prima volta si prova quasi sempre mentre il run e' ancora a meta',
 * e in quel caso la risposta dice di riprovare invece di importare meta' lista.
 */
import { NextResponse } from 'next/server';
import { raccogliCampagna } from '@/lib/apify';

export async function POST(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const campagnaId = Number(id);
  if (!Number.isFinite(campagnaId)) {
    return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  }

  try {
    return NextResponse.json(await raccogliCampagna(campagnaId));
  } catch (errore: unknown) {
    // "Il run è ancora in corso" non è un guasto: è la risposta giusta a una
    // domanda fatta presto. Un 409 lo dice senza far pensare a un errore.
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json({ errore: motivo }, { status: motivo.includes('ancora in corso') ? 409 : 400 });
  }
}
