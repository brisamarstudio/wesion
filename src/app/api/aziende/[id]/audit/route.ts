/**
 * Far girare l'audit su un'azienda, adesso.
 *
 * POST e non GET perche' lascia una riga in tabella e spende una chiamata a
 * pagamento: non e' una lettura, e non deve poter partire da un prefetch del
 * browser o da un link aperto per sbaglio.
 *
 * Non risponde mai 500 per un audit fallito: il fallimento e' un esito
 * previsto, e' gia' stato scritto nello storico come tale, e chi ha premuto il
 * bottone deve leggere PERCHE' non ha funzionato invece di un errore generico.
 * Un 500 qui direbbe "l'applicazione e' rotta", che e' un'altra cosa.
 */
import { NextResponse } from 'next/server';
import { analizzaAzienda } from '@/lib/audit';

export async function POST(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) {
    return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  }

  try {
    const esito = await analizzaAzienda(aziendaId);
    return NextResponse.json(esito);
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    // Qui siamo prima dello storico: l'azienda non esiste, o il database non
    // risponde. Non c'e' niente da raccontare all'operatore se non questo.
    return NextResponse.json({ errore: motivo }, { status: 400 });
  }
}
