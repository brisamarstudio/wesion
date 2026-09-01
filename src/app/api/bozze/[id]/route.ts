/**
 * L'ultimo bottone. Qui si scrive cosa ha deciso una persona, e basta.
 *
 * PERCHE' QUESTA ROTTA NON PUBBLICA NIENTE. La dashboard gira su Contabo, il
 * router WhatsApp su Oracle dietro `172.17.0.1`, che da internet non e'
 * raggiungibile — ed e' una difesa gia' pagata, non una svista da correggere.
 * Quindi i due non si chiamano: qui si scrive `stato='approvata'`, di la' si
 * legge con l'indice parziale `idx_bozza_approvate`. Nessuna porta nuova.
 *
 * Conseguenza da tenere a mente: dopo un 200 di questa rotta la cosa NON e'
 * pubblicata, e' solo autorizzata. Chi guarda deve vederlo scritto — per questo
 * la consolle dice "approvata, in attesa che il router la pubblichi" e non
 * "fatto".
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Finche' non c'e' la pagina di login (tabella `utente` gia' pronta, pagina no)
 * la firma e' questa. E' scritta com'e' invece di lasciare NULL perche' un campo
 * vuoto si legge come "non lo sappiamo", mentre qui lo sappiamo: e' stato un
 * umano dalla dashboard. Diventa l'email vera quando arriva l'autenticazione.
 */
const OPERATORE = 'dashboard';

/** Gli stati da cui si puo' ancora decidere. Da 'pubblicata' non si torna. */
const DECIDIBILI = ['vuota', 'generata', 'attesa_approvazione'];

export async function PATCH(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const idBozza = Number(id);
  if (!Number.isFinite(idBozza)) {
    return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  }

  const corpo = (await richiesta.json().catch(() => ({}))) as {
    azione?: string;
    testo?: string;
    /** Il bottone scelto per QUESTA bozza, che vince su quello del cliente. */
    cta?: { tipo?: string; url?: string } | null;
  };

  /**
   * ⚠️ L'AZIONE E' FACOLTATIVA (01/09/2026). Prima era obbligatoria, e aveva
   * senso finche' questa rotta serviva solo a dire si' o no. Ma correggere il
   * testo o scegliere il bottone sono modifiche al CONTENUTO, non decisioni
   * sul suo destino: obbligare a decidere per salvarle vorrebbe dire che per
   * cambiare un bottone bisogna approvare — cioe' far uscire una cosa nel
   * mondo per sistemarne un dettaglio.
   */
  const decide = corpo.azione === 'approva' || corpo.azione === 'rifiuta';
  if (corpo.azione !== undefined && !decide && corpo.azione !== 'nessuna') {
    return NextResponse.json({ errore: "azione deve essere 'approva' o 'rifiuta'" }, { status: 400 });
  }

  // Il testo corretto a mano si salva PRIMA di decidere: se l'operatore ha
  // tolto il telefono dal post e poi approva, deve uscire quello che ha letto
  // lui, non quello che aveva scritto il modello.
  /**
   * Il bottone della singola bozza.
   *
   * Si scrive dentro `contenuto.cta` e vince su quello di serie del cliente
   * (`servizio.post_gbp.cta_*`). `null` lo toglie: e' diverso da "non
   * specificato", che vuol dire "usa quello del cliente".
   */
  if (corpo.cta !== undefined) {
    await query(
      `UPDATE wesion.bozza
          SET contenuto = CASE WHEN $2::jsonb IS NULL
                               THEN contenuto - 'cta'
                               ELSE contenuto || jsonb_build_object('cta', $2::jsonb) END
        WHERE id = $1 AND stato = ANY($3)`,
      [idBozza, corpo.cta ? JSON.stringify(corpo.cta) : null, DECIDIBILI]
    );
  }

  if (typeof corpo.testo === 'string') {
    await query(
      `UPDATE wesion.bozza
          SET contenuto = contenuto || jsonb_build_object('testo', $2::text)
        WHERE id = $1 AND stato = ANY($3)`,
      [idBozza, corpo.testo, DECIDIBILI]
    );
  }

  // Solo contenuto, nessuna decisione: si e' gia' scritto quello che c'era da
  // scrivere e si esce senza toccare lo stato.
  if (!decide) {
    return NextResponse.json({ salvato: true });
  }

  const nuovoStato = corpo.azione === 'approva' ? 'approvata' : 'rifiutata';

  /**
   * Una sola andata al database, e la riga dell'evento nasce dallo stesso
   * UPDATE: se la decisione entra, la sua traccia entra con lei. Scritte in due
   * volte, prima o poi si trova un'approvazione senza evento e non si sa piu'
   * chi l'ha fatta.
   *
   * La scadenza si controlla nel WHERE e non prima: fra il momento in cui la
   * pagina ha disegnato il bottone e il momento del click possono passare i
   * quindici minuti del menu, e sarebbe proprio il caso che vogliamo evitare —
   * un SI tardivo che pubblica il menu di ieri.
   */
  const [aggiornata] = await query<{ id: number; stato: string; azienda_id: number }>(
    `WITH decisa AS (
       UPDATE wesion.bozza
          SET stato         = $2,
              approvata_da  = CASE WHEN $2 = 'approvata' THEN $3 ELSE approvata_da END,
              approvata_via = CASE WHEN $2 = 'approvata' THEN 'dashboard' ELSE approvata_via END,
              approvata_at  = CASE WHEN $2 = 'approvata' THEN now() ELSE approvata_at END
        WHERE id = $1
          AND stato = ANY($4)
          AND (scade_at IS NULL OR scade_at > now())
        RETURNING id, stato, azienda_id, tipo
     ), tracciata AS (
       INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
       SELECT azienda_id, 'bozza_' || $2, $3,
              jsonb_build_object('bozza_id', id, 'tipo', tipo)
         FROM decisa
     )
     SELECT id, stato, azienda_id FROM decisa`,
    [idBozza, nuovoStato, OPERATORE, DECIDIBILI]
  );

  if (!aggiornata) {
    /**
     * Nessuna riga aggiornata: o e' gia' stata decisa da qualcun altro, o e'
     * scaduta mentre la pagina era aperta. Rileggiamo per dirlo com'e' — un
     * "non e' andata" senza motivo fa ricliccare, e ricliccare non risolve.
     */
    const [attuale] = await query<{ stato: string; scaduta: boolean }>(
      `SELECT stato, (scade_at IS NOT NULL AND scade_at <= now()) AS scaduta
         FROM wesion.bozza WHERE id = $1`,
      [idBozza]
    );
    if (!attuale) return NextResponse.json({ errore: 'bozza inesistente' }, { status: 404 });
    return NextResponse.json(
      {
        errore: attuale.scaduta
          ? 'La bozza è scaduta mentre era aperta: non si pubblica più, va rigenerata.'
          : `La bozza non è più decidibile: adesso è "${attuale.stato}".`,
        stato: attuale.stato,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: aggiornata.id, stato: aggiornata.stato });
}
