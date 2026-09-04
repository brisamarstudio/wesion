/**
 * Rotta API per la creazione diretta di un post/articolo "al volo" (senza vincolo di Fatti o AI).
 *
 * Supporta testo libero, immagini multiple, CTA personalizzata e approvazione o programmazione diretta.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(richiesta: Request) {
  try {
    const corpo = (await richiesta.json().catch(() => ({}))) as {
      aziendaId?: number;
      tipo?: 'post_gbp' | 'articolo';
      titolo?: string;
      testo?: string;
      immagini?: string[];
      cta?: { tipo: string; url?: string };
      pubblicaAt?: string;
      approvaSubito?: boolean;
    };

    const aziendaId = Number(corpo.aziendaId);
    if (!Number.isFinite(aziendaId) || aziendaId <= 0) {
      return NextResponse.json({ errore: 'Azienda non valida' }, { status: 400 });
    }

    const testo = (corpo.testo || '').trim();
    if (!testo) {
      return NextResponse.json({ errore: 'Il testo del post è obbligatorio' }, { status: 400 });
    }

    const tipo = corpo.tipo === 'articolo' ? 'articolo' : 'post_gbp';
    const immagini = Array.isArray(corpo.immagini) ? corpo.immagini.filter((u) => typeof u === 'string' && u.trim()) : [];
    const foto = immagini[0] || null;

    const stato = corpo.approvaSubito ? 'approvata' : 'attesa_approvazione';

    let pubblicaAt: Date | null = null;
    if (corpo.pubblicaAt && corpo.pubblicaAt.trim()) {
      const isoStr = corpo.pubblicaAt.trim();
      if (isoStr.includes('T')) {
        pubblicaAt = new Date(isoStr);
      } else {
        const meseEstivo = Number(isoStr.slice(5, 7)) >= 4 && Number(isoStr.slice(5, 7)) <= 10;
        pubblicaAt = new Date(`${isoStr}T10:00:00${meseEstivo ? '+02:00' : '+01:00'}`);
      }
    } else if (corpo.approvaSubito) {
      pubblicaAt = new Date();
    }

    const contenuto: Record<string, unknown> = {
      testo,
      ...(corpo.titolo?.trim() ? { titolo: corpo.titolo.trim() } : {}),
      ...(foto ? { foto } : {}),
      ...(immagini.length > 0 ? { immagini } : {}),
      ...(corpo.cta?.tipo ? { cta: { tipo: corpo.cta.tipo, url: corpo.cta.url || null } } : {}),
    };

    const approvataAt = corpo.approvaSubito ? new Date() : null;
    const approvataDa = corpo.approvaSubito ? 'operatore_dashboard' : null;
    const approvataVia = corpo.approvaSubito ? 'dashboard' : null;

    const [bozza] = await query<{ id: number }>(
      `INSERT INTO wesion.bozza (
        azienda_id, tipo, origine, stato, contenuto, pubblica_at, approvata_at, approvata_da, approvata_via
       ) VALUES ($1, $2, 'manuale', $3, $4::jsonb, $5, $6, $7, $8)
       RETURNING id`,
      [
        aziendaId,
        tipo,
        stato,
        JSON.stringify(contenuto),
        pubblicaAt,
        approvataAt,
        approvataDa,
        approvataVia,
      ]
    );

    return NextResponse.json({ success: true, bozzaId: bozza.id, stato }, { status: 201 });
  } catch (err: any) {
    console.error('Errore creazione post al volo:', err);
    return NextResponse.json({ errore: err?.message || 'Errore interno durante la creazione' }, { status: 500 });
  }
}
