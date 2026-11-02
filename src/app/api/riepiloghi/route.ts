/**
 * Riepiloghi del mese. POST = «ho aperto WhatsApp per mandarlo»: si segna,
 * cosi' la pagina dice a chi e' gia' andato. Il messaggio lo manda Mariano dal
 * suo WhatsApp, non questo server (vedi src/lib/riepilogo.ts).
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(richiesta: Request) {
  const corpo = (await richiesta.json().catch(() => ({}))) as { aziendaId?: number; mese?: string };
  const aziendaId = Number(corpo.aziendaId);
  if (!Number.isSafeInteger(aziendaId) || !/^\d{4}-\d{2}$/.test(corpo.mese ?? '')) {
    return NextResponse.json({ errore: 'dati non validi' }, { status: 400 });
  }
  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'riepilogo_aperto', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ mese: corpo.mese })]
  );
  return NextResponse.json({ ok: true });
}
