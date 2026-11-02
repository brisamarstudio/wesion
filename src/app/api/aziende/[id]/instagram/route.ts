/**
 * «Prova il collegamento» di Instagram: il token vede l'account? Non pubblica
 * niente e non scrive niente, e si puo' premere quante volte si vuole.
 *
 * Il token si legge dal database, mai dal corpo della richiesta: cosi' questa
 * rotta non e' un modo per far provare a Meta un token qualunque.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { leggiConfigInstagram, provaCollegamentoInstagram } from '@/lib/instagram';

export async function GET(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [s] = await query<{ config: Record<string, unknown> | null }>(
    `SELECT config FROM wesion.servizio WHERE azienda_id = $1 AND tipo = 'social'`,
    [aziendaId]
  );
  const cfg = leggiConfigInstagram(s?.config);
  if (!cfg) {
    return NextResponse.json(
      { errore: 'Mancano l’id dell’account o il token: compilali qui sopra e salva la scheda, poi riprova.' },
      { status: 409 }
    );
  }
  try {
    return NextResponse.json(await provaCollegamentoInstagram(cfg));
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
