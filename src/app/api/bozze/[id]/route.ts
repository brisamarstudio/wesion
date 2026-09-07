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
import { istanteRoma } from '@/lib/quando';

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
    /** Quando deve uscire, come lo scrive una persona: «2026-09-10T10:00». */
    pubblica_at?: string | null;
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

  /**
   * Spostare la data.
   *
   * ⚠️ Serviva e non c'era: una bozza nasceva con la sua data e quella restava.
   * Per farla uscire un giorno diverso bisognava cancellarla e rifarla — cioe'
   * buttare via il testo gia' scritto e gia' letto per spostare un'ora.
   *
   * Il fuso lo mette `istanteRoma`: chi scrive «il 10 alle 10» intende le dieci
   * del mattino a Broni, e una data costruita senza fuso esce alle due di notte.
   *
   * `null` toglie la programmazione: la bozza esce al primo giro utile del
   * router dopo l'approvazione. E' diverso da «non specificato», che qui vuol
   * dire «non toccare quello che c'e'».
   */
  if (corpo.pubblica_at !== undefined) {
    const quando = corpo.pubblica_at === null ? null : istanteRoma(corpo.pubblica_at);
    if (corpo.pubblica_at !== null && !quando) {
      return NextResponse.json(
        { errore: 'la data non si legge: serve il formato 2026-09-10T10:00' },
        { status: 400 }
      );
    }
    await query(
      `UPDATE wesion.bozza SET pubblica_at = $2 WHERE id = $1 AND stato = ANY($3)`,
      [idBozza, quando, DECIDIBILI]
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

  /**
   * ⚠️ NON SI APPROVA UNA BOZZA SENZA TESTO.
   *
   * Uno slot del piano nasce `vuota`: la consolle gli mostra il COMPITO
   * («cosa deve fare», «si regge su») perche' serve a rivedere il piano, ma
   * quello non e' il post — il post non esiste ancora. Il bottone «Approva»
   * pero' c'era lo stesso, e approvandolo il router legge
   * `contenuto.summary ?? contenuto.testo` e trova la stringa vuota: prova a
   * pubblicare il niente, Google rifiuta, e resta una pubblicazione fallita
   * per una cosa che non poteva riuscire.
   *
   * La guardia sta QUI e non solo sul bottone: una regola che vale solo dove
   * l'operatore guarda non e' una regola — stessa ragione del middleware.
   * Rifiutare invece si puo': dire «questo slot non mi piace» prima di
   * spenderci una generazione e' esattamente il senso del piano.
   */
  if (corpo.azione === 'approva') {
    const [q] = await query<{ testo: string | null }>(
      `SELECT COALESCE(contenuto->>'summary', contenuto->>'testo') AS testo
         FROM wesion.bozza WHERE id = $1`,
      [idBozza]
    );
    if (!q) return NextResponse.json({ errore: 'questa bozza non c’è' }, { status: 404 });
    if (!q.testo?.trim()) {
      return NextResponse.json(
        {
          errore:
            'Questa bozza non ha ancora un testo: quello che leggi è il compito, non il post. Premi «Scrivi» prima di approvarla.',
        },
        { status: 409 }
      );
    }
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

/**
 * Buttarne via una.
 *
 * ⚠️ NON E' «rifiuta». Rifiutare vuol dire «ho guardato questa cosa e ho detto
 * no»: resta in archivio ed e' una decisione che qualcuno vorra' rileggere.
 * Cancellare vuol dire «questa non doveva proprio esistere» — uno slot nato
 * male, un piano rifatto tre volte, una data gia' passata. Tenerle tutte in
 * archivio non e' memoria, e' rumore che nasconde le decisioni vere.
 *
 * ⚠️ DA `pubblicata` E `pubblicando` NON SI CANCELLA. La prima ha una riga in
 * `pubblicazione` che punta qui e una cosa vera uscita nel mondo: sparire la
 * bozza lascerebbe uno storico che dice «e' uscito qualcosa» senza poter piu'
 * dire cosa. La seconda e' in mano al router proprio adesso.
 */
const CANCELLABILI = ['vuota', 'generata', 'attesa_approvazione', 'approvata', 'rifiutata', 'scaduta'];

export async function DELETE(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const idBozza = Number(id);
  if (!Number.isFinite(idBozza)) {
    return NextResponse.json({ errore: 'id non valido' }, { status: 400 });
  }

  /**
   * L'evento nasce dallo stesso giro della cancellazione, come per la
   * decisione: se la riga sparisce, la traccia del fatto che e' sparita resta.
   * Ci si mette dentro il titolo, perche' dopo non c'e' piu' modo di saperlo.
   */
  const [tolta] = await query<{ id: number; stato: string }>(
    `WITH via AS (
       DELETE FROM wesion.bozza
        WHERE id = $1 AND stato = ANY($2)
       RETURNING id, stato, azienda_id, tipo, contenuto
     ), tracciata AS (
       INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
       SELECT azienda_id, 'bozza_cancellata', $3,
              jsonb_build_object('bozza_id', id, 'tipo', tipo,
                                 'titolo', contenuto->>'titolo', 'stato_era', stato)
         FROM via
     )
     SELECT id, stato FROM via`,
    [idBozza, CANCELLABILI, OPERATORE]
  );

  if (!tolta) {
    const [c] = await query<{ stato: string }>(`SELECT stato FROM wesion.bozza WHERE id = $1`, [idBozza]);
    if (!c) return NextResponse.json({ errore: 'questa bozza non c’è già più' }, { status: 404 });
    return NextResponse.json(
      {
        errore:
          c.stato === 'pubblicata'
            ? 'È già uscita: cancellarla lascerebbe uno storico che non sa più dire cosa è uscito. Il post si toglie dalla scheda Google.'
            : 'Il router la sta pubblicando proprio adesso: aspetta che finisca.',
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ cancellata: tolta.id });
}
