/**
 * Analizza il sito web del cliente per precompilare in automatico la sezione Blog.
 *
 * Rileva:
 * - CMS (WordPress vs Wesion/Astro)
 * - URL effettivo della pagina del blog
 * - Categorie reali di WordPress o generate con AI su misura per il settore
 * - Parametri tecnici di base
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { analizzaSitoPerBlog } from '@/lib/analizzaSito';

export async function POST(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isSafeInteger(aziendaId)) {
    return NextResponse.json({ ok: false, errore: 'ID azienda non valido' }, { status: 400 });
  }

  // 1. Dati azienda
  const [azienda] = await query<{ nome: string; settore: string | null }>(
    `SELECT nome, settore FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!azienda) {
    return NextResponse.json({ ok: false, errore: 'Azienda inesistente' }, { status: 404 });
  }

  // 2. Fatti dell'azienda per dare contesto all'AI (cosa fa, offerta)
  const fatti = await query<{ chiave: string; valore: string }>(
    `SELECT chiave, valore FROM wesion.fatto WHERE azienda_id = $1 AND attivo = true`,
    [aziendaId]
  );
  const cosaFa = fatti.find((f) => f.chiave === 'cosa_fa')?.valore;
  const offerta = fatti
    .filter((f) => f.chiave === 'offerta')
    .map((f) => f.valore)
    .join(', ');

  // 3. Risoluzione URL del sito
  let urlSito = '';

  // Proviamo prima a vedere se il client ci ha passato un URL esplicito nel corpo
  try {
    const corpo = (await richiesta.json()) as { url?: string };
    if (corpo?.url && typeof corpo.url === 'string') {
      urlSito = corpo.url.trim();
    }
  } catch {
    // corpo opzionale
  }

  // Se non passato nel corpo, lo cerchiamo nei contatti di tipo 'sito'
  if (!urlSito) {
    const contattiSito = await query<{ valore: string }>(
      `SELECT valore FROM wesion.contatto WHERE azienda_id = $1 AND tipo = 'sito' AND valore != '' LIMIT 1`,
      [aziendaId]
    );
    if (contattiSito.length > 0 && contattiSito[0].valore) {
      urlSito = contattiSito[0].valore.trim();
    }
  }

  // Se ancora non c'è, controlliamo se c'è una configurazione esistente o Search Console
  if (!urlSito) {
    const [servizio] = await query<{ config: Record<string, string> | null }>(
      `SELECT config FROM wesion.servizio WHERE azienda_id = $1 AND tipo = 'blog'`,
      [aziendaId]
    );
    if (servizio?.config?.wp_base) {
      urlSito = servizio.config.wp_base;
    } else if (servizio?.config?.site_blog_page) {
      try {
        const u = new URL(servizio.config.site_blog_page);
        urlSito = u.origin;
      } catch {
        // ignora
      }
    }
  }

  if (!urlSito) {
    const [sitoTab] = await query<{ gsc_proprieta: string | null }>(
      `SELECT gsc_proprieta FROM wesion.sito WHERE azienda_id = $1`,
      [aziendaId]
    );
    if (sitoTab?.gsc_proprieta) {
      const gsc = sitoTab.gsc_proprieta;
      if (gsc.startsWith('http')) {
        urlSito = gsc;
      } else if (gsc.startsWith('sc-domain:')) {
        urlSito = 'https://' + gsc.replace('sc-domain:', '');
      }
    }
  }

  if (!urlSito) {
    return NextResponse.json(
      {
        ok: false,
        errore:
          'Nessun sito web trovato per questa azienda nei Contatti o nella configurazione. Inserisci prima il sito o la pagina del blog.',
      },
      { status: 400 }
    );
  }

  try {
    const esito = await analizzaSitoPerBlog(urlSito, {
      nomeAzienda: azienda.nome,
      settore: azienda.settore ?? undefined,
      cosaFa,
      offerta,
    });

    return NextResponse.json({ ok: true, ...esito });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, errore: msg }, { status: 500 });
  }
}
