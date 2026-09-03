/**
 * Propone il `repo_url` di un cliente guardando dentro `SITI/`, invece di
 * farselo digitare a mano.
 *
 * Stessa forma di `/google`: legge e basta, non scrive in tabella — il
 * salvataggio resta al bottone «Salva» di sempre. Disponibile solo dove
 * `SITI_LOCAL_PATH` esiste (il PC di sviluppo): su Contabo la funzione lo dice
 * invece di rompersi, vedi `src/lib/repo-locale.ts`.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cercaRepoLocale } from '@/lib/repo-locale';

export async function GET(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [azienda] = await query<{ nome: string; slug: string }>(
    `SELECT nome, slug FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!azienda) return NextResponse.json({ errore: 'Azienda non trovata.' }, { status: 404 });

  const esito = await cercaRepoLocale(azienda.nome, azienda.slug);

  if (!esito.disponibile) {
    return NextResponse.json(
      {
        errore:
          'SITI_LOCAL_PATH non è configurato su questo server: la ricerca nelle cartelle locali funziona solo dal PC di sviluppo.',
      },
      { status: 400 }
    );
  }

  return NextResponse.json(esito);
}
