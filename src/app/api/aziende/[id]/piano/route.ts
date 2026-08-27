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
import { query } from '@/lib/db';
import { leggiMateria, materiaUtilizzabile } from '@/lib/materia';
import { costruisciPiano, postPerMese, salvaPiano } from '@/lib/piano';

/**
 * Cosa e' GIA' programmato per questo cliente in questo mese.
 *
 * ⚠️ Mancava, e la mancanza si vedeva: l'anteprima diceva "18 slot" senza dire
 * che diciotto c'erano gia'. Chi guardava non sapeva se stava costruendo il
 * piano o guardando quello che aveva gia' costruito ieri — che sono due
 * situazioni opposte con lo stesso schermo davanti.
 */
async function giaProgrammati(aziendaId: number, anno: number, mese: number) {
  const inizio = new Date(anno, mese - 1, 1).toISOString();
  const fine = new Date(anno, mese, 1).toISOString();
  return query<{
    id: number;
    stato: string;
    pubblica_at: string;
    titolo: string | null;
    testo: string | null;
    pubblicata: boolean;
  }>(
    `SELECT b.id, b.stato, b.pubblica_at,
            b.contenuto->>'titolo' AS titolo,
            b.contenuto->>'testo'  AS testo,
            EXISTS (SELECT 1 FROM wesion.pubblicazione p
                     WHERE p.bozza_id = b.id AND p.esito = 'ok') AS pubblicata
       FROM wesion.bozza b
      WHERE b.azienda_id = $1 AND b.origine = 'piano'
        AND b.pubblica_at >= $2 AND b.pubblica_at < $3
      ORDER BY b.pubblica_at`,
    [aziendaId, inizio, fine]
  );
}

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

  const esistenti = await giaProgrammati(aziendaId, anno, mese);

  return {
    anno,
    mese,
    quantita,
    esistenti,
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
