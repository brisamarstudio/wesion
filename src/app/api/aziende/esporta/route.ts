/**
 * I contatti in CSV, per chi deve telefonare.
 *
 * Non e' un ripiego in attesa di un'integrazione: chi fa le chiamate lavora su
 * un foglio, lo stampa, ci scrive sopra. Toglierglielo per eleganza vuol dire
 * che si ricopia a mano, che e' peggio.
 *
 * ⚠️ IL PUNTO E VIRGOLA, NON LA VIRGOLA. Excel in italiano apre i CSV
 * separati da virgola mettendo tutto in una colonna sola, e chi lo riceve pensa
 * che il file sia rotto. E il BOM davanti, o le accentate diventano `Ã¨`.
 */
import { query } from '@/lib/db';

const CAMPI = ['nome', 'categoria', 'citta', 'provincia', 'telefono', 'email', 'sito', 'stato', 'score', 'gancio', 'maps'];

/** Una cella CSV: virgolette raddoppiate, e sempre quotata per non pensarci. */
function cella(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function GET(richiesta: Request) {
  const p = new URL(richiesta.url).searchParams;
  const stato = p.get('stato');

  const righe = await query<Record<string, unknown>>(
    `SELECT a.nome, a.categoria, a.citta, a.provincia, a.stato, a.maps_url AS maps,
            (SELECT c.valore FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'telefono'
              ORDER BY c.e_titolare DESC, c.id LIMIT 1) AS telefono,
            (SELECT c.valore FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'email'
              ORDER BY c.id LIMIT 1) AS email,
            (SELECT c.valore FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'sito'
              ORDER BY c.id LIMIT 1) AS sito,
            u.score, u.hook AS gancio
       FROM wesion.azienda a
       LEFT JOIN LATERAL (
         SELECT x.score, x.hook FROM wesion.audit x
          WHERE x.azienda_id = a.id AND x.esito = 'ok'
          ORDER BY x.eseguito_at DESC LIMIT 1
       ) u ON true
      WHERE ($1::text IS NULL OR a.stato = $1)
      ORDER BY u.score DESC NULLS LAST, a.nome`,
    [stato]
  );

  const csv = [CAMPI.join(';'), ...righe.map((r) => CAMPI.map((c) => cella(r[c])).join(';'))].join('\r\n');
  const quando = new Date().toISOString().slice(0, 10);

  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contatti-${stato ?? 'tutti'}-${quando}.csv"`,
    },
  });
}
