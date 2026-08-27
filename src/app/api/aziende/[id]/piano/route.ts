/**
 * Costruire il piano del mese per un cliente.
 *
 * GET  → mostra il piano che verrebbe fuori, senza scrivere niente.
 * POST → lo scrive come bozze vuote.
 *
 * I due sono separati perché il piano si guarda PRIMA di accettarlo: è tutto il
 * motivo per cui la pianificazione è staccata dalla scrittura. Un GET non lascia
 * traccia e non costa niente — non c'è nessuna AI di mezzo, è aritmetica su un
 * calendario.
 */
import { NextResponse } from 'next/server';
import { leggiMateria, materiaUtilizzabile } from '@/lib/materia';
import { costruisciPiano, postPerMese, salvaPiano } from '@/lib/piano';

function quando(richiesta: Request) {
  const p = new URL(richiesta.url).searchParams;
  const adesso = new Date();
  const anno = Number(p.get('anno')) || adesso.getFullYear();
  const mese = Number(p.get('mese')) || adesso.getMonth() + 1;
  // Il bundle vende 4 post a settimana: è il default, non un numero fisso.
  const aSettimana = Number(p.get('settimana')) || 4;
  const quantita = Number(p.get('quantita')) || postPerMese(anno, mese, aSettimana);
  return { anno, mese, quantita };
}

async function preparaPiano(aziendaId: number, richiesta: Request) {
  const { anno, mese, quantita } = quando(richiesta);
  const materia = await leggiMateria(aziendaId);
  const esito = costruisciPiano(materia, { anno, mese, quantita });

  return {
    anno,
    mese,
    quantita,
    // Detto esplicitamente: un piano si costruisce anche con poca materia, ma
    // esce povero, e chi lo guarda deve sapere che il problema è a monte.
    materiaSufficiente: materiaUtilizzabile(materia),
    ...esito,
  };
}

export async function GET(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  try {
    return NextResponse.json(await preparaPiano(aziendaId, richiesta));
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 400 });
  }
}

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  try {
    const piano = await preparaPiano(aziendaId, richiesta);
    if (!piano.slot.length) {
      return NextResponse.json(
        { errore: 'Non c’è niente da pianificare.', avvisi: piano.avvisi },
        { status: 409 }
      );
    }
    const scritto = await salvaPiano(aziendaId, piano.slot, piano.anno, piano.mese);
    return NextResponse.json({ ...piano, ...scritto });
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 400 });
  }
}
