/**
 * Cosa c'è dentro l'ultima proposta SEO, e applicarla.
 *
 * ⚠️ ESISTE PERCHÉ LA FEATURE ERA A METÀ (02/09/2026). L'audit apriva una Pull
 * Request e in dashboard compariva un link: "e io che devo fare?" — domanda
 * giusta. Chi approva un post non va a leggerlo su Google, lo legge qui; per
 * il codice di un sito vale lo stesso. Qui la proposta si legge (GET) e si
 * applica (POST), senza uscire da Wesion.
 *
 * L'ultimo bottone resta dell'operatore: il POST lo chiama una persona che ha
 * appena guardato il diff, mai un giro automatico.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { leggiPR, applicaPR } from '@/lib/seo-git';

async function urlDellaPR(aziendaId: number): Promise<string | null> {
  const [sito] = await query<{ ultima_pr_url: string | null }>(
    `SELECT ultima_pr_url FROM wesion.sito WHERE azienda_id = $1`,
    [aziendaId]
  );
  return sito?.ultima_pr_url ?? null;
}

export async function GET(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { GITHUB_TOKEN } = process.env;
  if (!GITHUB_TOKEN) return NextResponse.json({ errore: 'GITHUB_TOKEN non configurato.' }, { status: 500 });

  const url = await urlDellaPR(aziendaId);
  if (!url) return NextResponse.json({ pr: null });

  try {
    return NextResponse.json({ pr: await leggiPR(url, GITHUB_TOKEN) });
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : String(errore) },
      { status: 502 }
    );
  }
}

export async function POST(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { GITHUB_TOKEN } = process.env;
  if (!GITHUB_TOKEN) return NextResponse.json({ errore: 'GITHUB_TOKEN non configurato.' }, { status: 500 });

  const url = await urlDellaPR(aziendaId);
  if (!url) return NextResponse.json({ errore: 'Non c’è nessuna proposta da applicare.' }, { status: 400 });

  const [azienda] = await query<{ nome: string }>(`SELECT nome FROM wesion.azienda WHERE id = $1`, [aziendaId]);

  try {
    await applicaPR(url, GITHUB_TOKEN, `SEO/GEO/AEO da Wesion — ${azienda?.nome ?? 'sito cliente'}`);
  } catch (errore: unknown) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    await query(`UPDATE wesion.sito SET ultimo_errore = $2 WHERE azienda_id = $1`, [
      aziendaId,
      messaggio.slice(0, 500),
    ]);
    return NextResponse.json({ errore: messaggio }, { status: 502 });
  }

  // Applicata: da qui in poi il sito vero è cambiato, e su Cloudflare Pages la
  // ricostruzione parte da sola. Resta scritto CHE è successo, e quando.
  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
     VALUES ($1, 'seo_applicato', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ pr: url })]
  );
  await query(`UPDATE wesion.sito SET ultimo_errore = NULL WHERE azienda_id = $1`, [aziendaId]);

  return NextResponse.json({ applicata: true, pr_url: url });
}
