/**
 * Scrivere tutti gli slot vuoti di un cliente.
 *
 * È il bottone "genera il mese": dopo che il piano è stato guardato e va bene,
 * si riempiono i testi in un colpo solo.
 *
 * ⚠️ Ci mette parecchio, di proposito: le generazioni vanno in SERIE (vedi
 * `scriviTutte`). Diciotto slot a un paio di secondi l'uno sono circa mezzo
 * minuto — molto meglio di metà mese generato e metà no per un 429.
 *
 * Se questa rotta va in timeout dietro un proxy, la cura non è parallelizzare:
 * è chiamarla più volte, perché è idempotente — lavora solo su ciò che è ancora
 * `vuota`, quindi una seconda chiamata riprende da dove si era fermata.
 */
import { NextResponse } from 'next/server';
import { scriviTutte } from '@/lib/scrivi';

export const maxDuration = 300;

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const massimo = Number(new URL(richiesta.url).searchParams.get('massimo')) || 20;

  try {
    const fatte = await scriviTutte(aziendaId, massimo);
    return NextResponse.json({
      scritte: fatte.length,
      // Quante avrebbero bisogno di un occhio prima di essere approvate.
      conAvvisiGravi: fatte.filter((f) => f.avvisiGravi > 0).length,
      modelli: [...new Set(fatte.map((f) => f.modello))],
      bozze: fatte.map((f) => ({ id: f.bozzaId, modello: f.modello, ms: f.ms, avvisiGravi: f.avvisiGravi })),
    });
  } catch (errore: unknown) {
    return NextResponse.json({ errore: errore instanceof Error ? errore.message : String(errore) }, { status: 400 });
  }
}
