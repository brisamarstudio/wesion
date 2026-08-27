/**
 * Avviare una campagna di ricerca.
 *
 * Risponde appena Apify ha accettato il lavoro, non quando il lavoro e' finito:
 * un run serio dura minuti, e tenere aperta una richiesta HTTP per tutto quel
 * tempo vuol dire perderla a meta' e non sapere piu' se il run e' partito.
 * L'id torna indietro proprio perche' la raccolta e' un secondo passo.
 */
import { NextResponse } from 'next/server';
import { avviaCampagna } from '@/lib/apify';

export async function POST(richiesta: Request) {
  const corpo = (await richiesta.json().catch(() => ({}))) as {
    nome?: string;
    categoria?: string;
    citta?: string[] | string;
    quanti?: number;
  };

  const citta = Array.isArray(corpo.citta)
    ? corpo.citta
    : String(corpo.citta ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

  if (!corpo.categoria?.trim() || citta.length === 0) {
    return NextResponse.json(
      { errore: 'Servono almeno una categoria (es. "ristoranti") e una città.' },
      { status: 400 }
    );
  }

  try {
    const esito = await avviaCampagna({
      // Il nome e' UNIQUE in tabella: se non lo si passa se ne costruisce uno
      // che dice cosa si e' cercato e quando, cosi' due ricerche uguali fatte
      // in giorni diversi restano due campagne distinte.
      nome: corpo.nome?.trim() || `${corpo.categoria.trim()} · ${citta.join(', ')} · ${new Date().toLocaleDateString('it-IT')}`,
      categoria: corpo.categoria.trim(),
      citta,
      // Un tetto c'e' sempre: senza, un refuso nel campo costa un run enorme.
      quanti: Math.min(Math.max(Number(corpo.quanti) || 50, 1), 500),
    });
    return NextResponse.json(esito);
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : String(errore) },
      { status: 400 }
    );
  }
}
