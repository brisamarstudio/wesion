/**
 * Ricavare la voce di un cliente da quello che abbiamo gia'.
 *
 * ⚠️ ANALIZZA E BASTA: NON SALVA NIENTE.
 *
 * Qui un modello legge del materiale e ne trae conclusioni. Alcune saranno
 * giuste, altre no, e chi conosce il cliente e' dall'altra parte dello schermo.
 * Salvare direttamente vorrebbe dire scrivere in tabella l'idea che un modello
 * si e' fatto leggendo un sito — e quella roba poi finisce in ogni post che
 * scriveremo per lui, per mesi.
 *
 * Chi guarda accetta cosa gli torna e riscrive il resto, poi salva dalla scheda
 * come qualsiasi altra modifica. Come per i post: l'ultimo bottone non e' del
 * modello.
 */
import { NextResponse } from 'next/server';
import { analizzaVoce } from '@/lib/analizzaVoce';

export const maxDuration = 120;

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { incollato } = (await richiesta.json().catch(() => ({}))) as { incollato?: string };

  try {
    return NextResponse.json(await analizzaVoce(aziendaId, incollato ?? ''));
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 400 });
  }
}
