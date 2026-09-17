/**
 * Rotta API per la creazione diretta di un post/articolo "al volo" (senza vincolo di Fatti o AI).
 *
 * Supporta testo libero, immagini multiple, CTA personalizzata e approvazione o programmazione diretta.
 *
 * ⚠️ IL 16/09/2026 QUESTA ROTTA HA PUBBLICATO UN POST CHE GOOGLE HA RESPINTO
 * (telefono, sito ed 8 emoji nel testo — lo stesso schema del guasto del
 * 20/07/2026, vedi controlloTesto.ts). `avvisi` restava `'[]'` per difetto di
 * colonna: il controllo esiste da mesi, ma su questa rotta non girava mai —
 * non "ha passato il controllo", non e' MAI STATO CHIAMATO. Chi scriveva un
 * post "al volo" con «approva subito» pubblicava alla cieca, senza che
 * l'avviso "Approva lo stesso" (che c'e' ovunque altrove) potesse comparire:
 * non c'era nessuna consolle di mezzo a mostrarlo.
 *
 * La correzione NON aggiunge un blocco che il resto del progetto non ha (la
 * regola qui e' "segnala, non decide" — vedi schema.sql riga 162): aggiunge
 * il controllo che gia' esiste, e se trova avvisi GRAVI rifiuta solo di
 * saltare la revisione umana con «approva subito». La bozza si salva comunque,
 * finisce in coda con gli avvisi accesi, e il bottone "Approva lo stesso" resta
 * dell'operatore — esattamente come per un post scritto dall'AI.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { controllaBozza } from '@/lib/controlloTesto';

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

    const avvisi = controllaBozza(tipo, testo, []);
    const haAvvisiGravi = avvisi.some((a) => a.gravita === 'grave');

    // "Approva subito" salta la consolle: se ci sono avvisi gravi, saltarla
    // vuol dire pubblicare senza che nessuno li abbia mai visti. La bozza
    // resta comunque salvata — finisce in coda, con gli stessi avvisi che
    // vedrebbe un post scritto dall'AI, e il bottone "Approva lo stesso" lo
    // preme un operatore, non lo decide il codice.
    const approvaDavvero = Boolean(corpo.approvaSubito) && !haAvvisiGravi;
    const stato = approvaDavvero ? 'approvata' : 'attesa_approvazione';

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

    const approvataAt = approvaDavvero ? new Date() : null;
    const approvataDa = approvaDavvero ? 'operatore_dashboard' : null;
    const approvataVia = approvaDavvero ? 'dashboard' : null;

    const [bozza] = await query<{ id: number }>(
      `INSERT INTO wesion.bozza (
        azienda_id, tipo, origine, stato, contenuto, avvisi, pubblica_at, approvata_at, approvata_da, approvata_via
       ) VALUES ($1, $2, 'manuale', $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
       RETURNING id`,
      [
        aziendaId,
        tipo,
        stato,
        JSON.stringify(contenuto),
        JSON.stringify(avvisi),
        pubblicaAt,
        approvataAt,
        approvataDa,
        approvataVia,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        bozzaId: bozza.id,
        stato,
        avvisi,
        // Così la UI può dire "non l'ho pubblicata subito, guarda perché" invece
        // di far sembrare che il click su "approva subito" non abbia funzionato.
        bloccataInRevisione: Boolean(corpo.approvaSubito) && !approvaDavvero,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Errore creazione post al volo:', err);
    return NextResponse.json({ errore: err?.message || 'Errore interno durante la creazione' }, { status: 500 });
  }
}
