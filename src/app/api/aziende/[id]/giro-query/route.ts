/**
 * Il giro sulle query, in lettura — vedi STATO.md §14.3.
 *
 * ⚠️ VOLUTAMENTE READ-ONLY. Non clona repo, non apre PR, non tocca niente:
 * legge Search Console, classifica, risponde. Il classificatore è appena nato
 * (giro-query.ts, 17/09/2026) — prima si guarda se i segnali sono davvero
 * utili su più clienti, poi eventualmente entra nell'audit SEO che scrive.
 * Vedi [[decisioni-secche-sono-regole]].
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { rendimentoDettagliato } from '@/lib/search-console';
import { classificaGiroQuery, raggruppaGiroQuery, verdettoGiroQuery } from '@/lib/giro-query';

export async function GET(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [azienda] = await query<{ nome: string }>(`SELECT nome FROM wesion.azienda WHERE id = $1`, [aziendaId]);
  if (!azienda) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });

  const [sito] = await query<{ gsc_proprieta: string | null }>(
    `SELECT gsc_proprieta FROM wesion.sito WHERE azienda_id = $1`,
    [aziendaId]
  );
  if (!sito?.gsc_proprieta) {
    return NextResponse.json(
      { errore: 'Search Console non collegata: apri "Modifica" e compila la Property Search Console.' },
      { status: 400 }
    );
  }

  try {
    const righe = await rendimentoDettagliato(sito.gsc_proprieta, 90, ['query', 'page']);
    if (!righe.length) {
      return NextResponse.json({ errore: 'Nessun dato negli ultimi 90 giorni: troppo poco traffico per un giro utile.' }, { status: 200 });
    }
    const classificate = classificaGiroQuery(azienda.nome, righe);
    const gruppi = raggruppaGiroQuery(classificate);
    const verdetto = verdettoGiroQuery(gruppi);
    return NextResponse.json({ gruppi, verdetto, righeTotali: righe.length });
  } catch (errore: unknown) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json({ errore: messaggio }, { status: 500 });
  }
}
