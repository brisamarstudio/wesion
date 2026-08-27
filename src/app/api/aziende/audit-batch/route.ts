/**
 * L'audit su piu' aziende in un colpo solo.
 *
 * Con 46 lead, farlo uno alla volta sono 46 clic e 46 attese. Ma resta
 * un'azione CHIESTA da una persona e non un automatismo: ogni audit spende una
 * chiamata a un modello, e farlo partire da solo allo scorrimento di una
 * pagina vorrebbe dire pagare per guardare.
 *
 * ⚠️ IN SERIE E CON UN TETTO. In parallelo si prende un 429 dal piano gratuito
 * e si finisce con meta' lista analizzata e meta' no, senza sapere quale meta'.
 * Il tetto a 25 esiste perche' una richiesta che dura dieci minuti la si perde
 * comunque per strada: si richiama, ed e' idempotente nel senso che conta —
 * ogni giro aggiunge una riga allo storico, non sovrascrive niente.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { analizzaAzienda } from '@/lib/audit';

export const maxDuration = 300;

export async function POST(richiesta: Request) {
  const corpo = (await richiesta.json().catch(() => ({}))) as { ids?: number[]; soloSenzaAudit?: boolean };
  const tetto = 25;

  let ids = Array.isArray(corpo.ids) ? corpo.ids.map(Number).filter(Number.isFinite) : [];

  // Senza elenco esplicito: quelle che un audit riuscito non ce l'hanno ancora.
  // E' il caso normale — "analizza quelle che mancano".
  if (!ids.length) {
    const righe = await query<{ id: number }>(
      `SELECT a.id FROM wesion.azienda a
        WHERE NOT EXISTS (SELECT 1 FROM wesion.audit x WHERE x.azienda_id = a.id AND x.esito = 'ok')
        ORDER BY a.nome LIMIT $1`,
      [tetto]
    );
    ids = righe.map((r) => r.id);
  }

  ids = ids.slice(0, tetto);
  if (!ids.length) {
    return NextResponse.json({ analizzate: 0, riuscite: 0, messaggio: 'Non c’è nessuna azienda da analizzare.' });
  }

  const esiti: Array<{ id: number; esito: string; score: number | null; errore: string | null }> = [];
  for (const id of ids) {
    try {
      const e = await analizzaAzienda(id);
      esiti.push({ id, esito: e.esito, score: e.score, errore: e.errore });
    } catch (errore: unknown) {
      // Una che esplode non ferma le altre ventiquattro.
      esiti.push({ id, esito: 'errore', score: null, errore: errore instanceof Error ? errore.message : String(errore) });
    }
  }

  return NextResponse.json({
    analizzate: esiti.length,
    riuscite: esiti.filter((e) => e.esito === 'ok').length,
    esiti,
  });
}
