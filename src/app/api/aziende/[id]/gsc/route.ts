/**
 * Propone la property Search Console di un cliente, invece di fargliela
 * copiare a mano da search.google.com.
 *
 * Stessa forma di `/repo-locale` e `/google`: legge e basta, il salvataggio
 * resta al bottone «Salva». A differenza di `/repo-locale` funziona ANCHE su
 * Contabo: chiede a Google (`sites.list`), non a una cartella del PC.
 *
 * Il dominio si prende dai contatti di tipo `sito`: quelli salvati, piu'
 * quelli passati in `?sito=` dal modulo aperto (magari appena corretti e non
 * ancora salvati).
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { proponiProprieta } from '@/lib/search-console';

export async function GET(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const salvati = await query<{ valore: string }>(
    `SELECT valore FROM wesion.contatto WHERE azienda_id = $1 AND tipo = 'sito'`,
    [aziendaId]
  );
  const dalModulo = new URL(richiesta.url).searchParams.getAll('sito');
  const indirizzi = [...dalModulo, ...salvati.map((c) => c.valore)];

  if (!indirizzi.length) {
    return NextResponse.json(
      { errore: 'Il cliente non ha un sito nei Contatti: aggiungilo (tipo «sito») e riprova.' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await proponiProprieta(indirizzi));
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : String(errore) },
      { status: 502 }
    );
  }
}
