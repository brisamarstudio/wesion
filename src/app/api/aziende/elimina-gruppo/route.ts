/**
 * Cancellare un gruppo intero: tutti i ristoranti di Vigevano, tutti i dentisti.
 *
 * ⚠️ CANCELLA SOLO QUELLO CHE SI PUÒ CANCELLARE, e non è un compromesso: è la
 * stessa regola della cancellazione singola, applicata riga per riga. Un lead
 * che non serve si butta; del lavoro fatto no. Quindi chi è cliente, chi è in
 * trattativa, e chiunque abbia bozze, servizi o messaggi RESTA — anche se sta
 * dentro al gruppo che stai buttando.
 *
 * L'alternativa sarebbe rifiutare tutto se una sola riga è protetta, e sarebbe
 * la scelta peggiore: chi ha appena scaricato trenta lead sbagliati non può
 * ripulirli perché uno di quei trenta è diventato cliente il mese scorso. Si
 * cancella il cancellabile e si dice, con i nomi, cosa è rimasto e perché.
 *
 * Il filtro arriva come CAMPO + VALORE, non come SQL: i campi ammessi sono tre
 * e sono scritti qui sotto. Un `campo` che arriva dal browser e finisce in una
 * query è il modo classico di regalare il database a chi passa.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/** I tre modi in cui l'elenco raggruppa. Nient'altro entra nella query. */
const CAMPI: Record<string, string> = {
  campagna: 'a.campagna_id = $1::bigint',
  citta: 'a.citta = $1',
  categoria: 'a.categoria = $1',
};

export async function POST(richiesta: Request) {
  const { campo, valore } = (await richiesta.json().catch(() => ({}))) as {
    campo?: string;
    valore?: string;
  };

  const dove = CAMPI[String(campo ?? '')];
  if (!dove) return NextResponse.json({ errore: 'gruppo non valido' }, { status: 400 });
  if (!valore) return NextResponse.json({ errore: 'gruppo senza valore' }, { status: 400 });

  /**
   * Le righe del gruppo, ognuna con il motivo per cui eventualmente non si
   * tocca. Si guarda PRIMA di cancellare: così il conteggio che torna indietro
   * è quello vero, non una stima fatta dopo.
   */
  const righe = await query<{ id: number; nome: string; stato: string; lavoro: number }>(
    `SELECT a.id, a.nome, a.stato,
            (SELECT count(*)::int FROM wesion.bozza b     WHERE b.azienda_id = a.id)
          + (SELECT count(*)::int FROM wesion.servizio s  WHERE s.azienda_id = a.id)
          + (SELECT count(*)::int FROM wesion.messaggio m WHERE m.azienda_id = a.id) AS lavoro
       FROM wesion.azienda a
      WHERE ${dove}`,
    [valore]
  );

  if (!righe.length) return NextResponse.json({ errore: 'in quel gruppo non c’è niente' }, { status: 404 });

  const protette = righe.filter((r) => ['cliente', 'in_trattativa'].includes(r.stato) || r.lavoro > 0);
  const daButtare = righe.filter((r) => !protette.includes(r));

  if (daButtare.length) {
    await query(`DELETE FROM wesion.azienda WHERE id = ANY($1::bigint[])`, [daButtare.map((r) => r.id)]);
  }

  return NextResponse.json({
    cancellate: daButtare.length,
    protette: protette.length,
    // I nomi, non solo il numero: «tre non si cancellano» senza dire quali
    // costringe a cercarle a mano per capire se era giusto.
    nomiProtetti: protette.slice(0, 8).map((r) => r.nome),
  });
}
