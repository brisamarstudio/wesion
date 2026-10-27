/**
 * Propone il `repo_url` di un cliente guardando:
 * 1. Nelle cartelle di `SITI/` in locale.
 * 2. Tramite l'API di GitHub (con GITHUB_TOKEN_BRISAMAR) se online o se non presente in locale.
 *
 * Utilizza sia nome/slug, sia il dominio del sito web del cliente per fare il match esatto.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { cercaRepoLocale } from '@/lib/repo-locale';

export async function GET(r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [azienda] = await query<{ nome: string; slug: string }>(
    `SELECT nome, slug FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!azienda) return NextResponse.json({ errore: 'Azienda non trovata.' }, { status: 404 });

  // Controlliamo se nella request è passato ?sito=..., altrimenti leggiamo dal database
  const urlReq = new URL(r.url);
  let sitoUrl = urlReq.searchParams.get('sito')?.trim();

  if (!sitoUrl) {
    const [contattoSito] = await query<{ valore: string }>(
      `SELECT valore FROM wesion.contatto WHERE azienda_id = $1 AND tipo = 'sito' AND valore != '' LIMIT 1`,
      [aziendaId]
    );
    if (contattoSito?.valore) {
      sitoUrl = contattoSito.valore.trim();
    }
  }

  const esito = await cercaRepoLocale(azienda.nome, azienda.slug, sitoUrl);

  if (!esito.disponibile) {
    return NextResponse.json(
      {
        errore:
          'Nessun repository trovato né in locale in SITI/ né su GitHub.',
      },
      { status: 400 }
    );
  }

  return NextResponse.json(esito);
}
