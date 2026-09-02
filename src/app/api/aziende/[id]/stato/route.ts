/**
 * Cambiare lo stato commerciale di un'azienda.
 *
 * Sta in una rotta sua e non dentro `/scheda` perche' e' l'azione che si fa di
 * piu': si scorre l'elenco dopo dieci telefonate e si segnano gli esiti. Farla
 * passare dal salvataggio dell'intera scheda vorrebbe dire rileggere e
 * riscrivere fatti, voce e servizi per cambiare una parola.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const AMMESSI = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso', 'archiviato'];

// Gli stessi tipi di `contatto`, tolto 'lid': non è un posto dove si scrive
// un messaggio di apertura, è un dettaglio del router. Vedi lo schema del
// 02/09/2026.
const CANALI = ['telefono', 'whatsapp', 'email', 'sito', 'facebook', 'instagram'];

export async function PATCH(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { stato, note, canale } = (await richiesta.json().catch(() => ({}))) as {
    stato?: string;
    note?: string;
    canale?: string;
  };
  if (!stato || !AMMESSI.includes(stato)) {
    return NextResponse.json({ errore: `stato deve essere uno fra: ${AMMESSI.join(', ')}` }, { status: 400 });
  }
  if (canale && !CANALI.includes(canale)) {
    return NextResponse.json({ errore: `canale deve essere uno fra: ${CANALI.join(', ')}` }, { status: 400 });
  }

  const [prima] = await query<{ stato: string }>(`SELECT stato FROM wesion.azienda WHERE id = $1`, [aziendaId]);
  if (!prima) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });

  // Il canale, quando c'è, si registra SEMPRE con la sua data — anche se lo
  // stato non cambia (si ricontatta chi è già «in trattativa»). Senza
  // `canale` le due colonne restano quelle di prima: cambiare stato da solo
  // (es. "Perse") non deve inventare un contatto che non c'è stato.
  await query(
    `UPDATE wesion.azienda
        SET stato = $2,
            note = COALESCE($3, note),
            ultimo_contatto_canale = COALESCE($4, ultimo_contatto_canale),
            ultimo_contatto_at = CASE WHEN $4::text IS NOT NULL THEN now() ELSE ultimo_contatto_at END,
            aggiornata_at = now()
      WHERE id = $1`,
    [aziendaId, stato, note ?? null, canale ?? null]
  );

  // Il cambio di stato e' storia commerciale: fra un mese "quando l'abbiamo
  // contattato?" deve avere una risposta che non sia "boh".
  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'stato_cambiato', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ da: prima.stato, a: stato, canale: canale ?? null })]
  );

  return NextResponse.json({ id: aziendaId, stato });
}
