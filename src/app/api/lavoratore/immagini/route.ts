/**
 * Il PC delle immagini chiede lavoro. Vedi src/lib/lavoratore.ts.
 *
 * Risponde con le bozze che non hanno un'immagine e le PRENOTA per 10 minuti
 * (`contenuto.foto_in_corso`): così il PC e OpenRouter non fanno la stessa
 * foto due volte, e se il PC si spegne a metà la bozza torna libera da sola.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verificaLavoratore } from '@/lib/lavoratore';
import { scenaPerModelloLocale } from '@/lib/immagini';

export async function GET(richiesta: Request) {
  const nome = await verificaLavoratore(richiesta);
  if (!nome) return NextResponse.json({ errore: 'token non valido' }, { status: 401 });

  const massimo = Math.min(8, Number(new URL(richiesta.url).searchParams.get('max')) || 4);

  // Prima si scelgono, poi si prenotano: un UPDATE ... FROM con sottoquery e
  // LIMIT su CockroachDB e' il genere di SQL che funziona su Postgres e non
  // la' (vedi STATO.md §19). Due passi semplici, e il WHERE della prenotazione
  // ricontrolla che nessuno l'abbia presa nel frattempo.
  const scelte = await query<{ id: number }>(
    `SELECT x.id FROM wesion.bozza x
      WHERE x.tipo IN ('post_gbp', 'articolo')
        -- Solo da approvare, e solo del mese: una foto aggiunta DOPO
        -- l'approvazione uscirebbe senza che nessuno l'abbia vista.
        AND x.stato = 'attesa_approvazione' AND x.origine = 'piano'
        AND COALESCE(x.contenuto->>'foto', '') = ''
        AND COALESCE((x.contenuto->>'prepara_errori')::int, 0) < 2
        AND (x.contenuto->'foto_in_corso' IS NULL
             OR (x.contenuto->'foto_in_corso'->>'at')::timestamptz < now() - interval '10 minutes')
      ORDER BY x.pubblica_at NULLS LAST, x.id
      LIMIT $1`,
    [massimo]
  );
  if (!scelte.length) return NextResponse.json({ lavori: [] });

  const prese = await query<{ id: number }>(
    `UPDATE wesion.bozza
        SET contenuto = contenuto || jsonb_build_object('foto_in_corso', jsonb_build_object('da', $2::text, 'at', now()))
      WHERE id = ANY($1::bigint[])
        AND COALESCE(contenuto->>'foto', '') = ''
        AND (contenuto->'foto_in_corso' IS NULL
             OR (contenuto->'foto_in_corso'->>'at')::timestamptz < now() - interval '10 minutes')
      RETURNING id`,
    [scelte.map((s) => s.id), nome]
  );
  if (!prese.length) return NextResponse.json({ lavori: [] });

  const righe = await query<{
    id: number;
    categoria: string | null;
    citta: string | null;
    titolo: string | null;
    fatto: string | null;
    angolo: string | null;
  }>(
    `SELECT b.id, a.categoria, a.citta,
            b.contenuto->>'titolo' AS titolo, b.contenuto->>'fatto' AS fatto, b.contenuto->>'angolo' AS angolo
       FROM wesion.bozza b JOIN wesion.azienda a ON a.id = b.azienda_id
      WHERE b.id = ANY($1::bigint[])`,
    [prese.map((p) => p.id)]
  );

  // ⚠️ Al PC va la SCENA in inglese, non il prompt con le regole: vedi
  // scenaPerModelloLocale in lib/immagini.ts (testo stampato e nudo, 02/11/2026).
  const lavori = await Promise.all(
    righe.map(async (r) => ({ id: Number(r.id), prompt: await scenaPerModelloLocale(r) }))
  );
  return NextResponse.json({ lavori });
}
