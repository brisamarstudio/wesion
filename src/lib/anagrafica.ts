/**
 * Mettere in tabella un'azienda a mano, e correggerne i dati.
 *
 * ⚠️ PERCHE' ESISTE (31/08/2026). Fino a oggi un'azienda nasceva SOLO dallo
 * scraper Apify. Il buco si e' visto provando a pubblicare su di noi: MyWebby
 * come lead su Google Maps non la trova nessuna campagna, quindi per avere la
 * nostra riga e' servito un INSERT scritto a mano nel database. Lo stesso vale
 * per il lead preso al telefono, per il cliente arrivato per passaparola e per
 * chiunque non nasca da una ricerca su Maps: o restavano fuori dallo strumento,
 * o entravano con una query — che e' il genere di cosa che si fa una volta bene
 * e la seconda di fretta.
 *
 * Le regole stanno qui e non nella pagina perche' le usano gia' due strade (il
 * modulo della dashboard e la POST) e domani un import da CSV. Se divergono, il
 * modulo accetta valori che il server poi scarta.
 */

import { query } from './db';
import { creaSlug, normalizzaTelefono, normalizzaSito, estraiCap } from './normalizza';

/** Gli stessi della CHECK sulla colonna: se non combaciano, l'INSERT esplode. */
const STATI = new Set(['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso', 'archiviato']);

/** Gli stessi della CHECK su `contatto.tipo`. */
export const TIPI_CONTATTO = ['telefono', 'whatsapp', 'lid', 'email', 'sito', 'facebook', 'instagram'] as const;
export type TipoContatto = (typeof TIPI_CONTATTO)[number];

export interface ContattoInput {
  tipo: string;
  valore: string;
  /** Chi puo' dare comandi al router. */
  e_titolare?: boolean;
}

export interface DatiAzienda {
  nome: string;
  categoria?: string | null;
  citta?: string | null;
  provincia?: string | null;
  indirizzo?: string | null;
  cap?: string | null;
  maps_url?: string | null;
  place_id?: string | null;
  stato?: string;
  campagna_id?: number | null;
  note?: string | null;
  contatti?: ContattoInput[];
}

export interface Anagrafica {
  id: number;
  nome: string;
  slug: string;
  categoria: string | null;
  citta: string | null;
  provincia: string | null;
  indirizzo: string | null;
  cap: string | null;
  maps_url: string | null;
  place_id: string | null;
  stato: string;
  fonte: string;
  note: string | null;
  contatti: Array<{ id: number; tipo: string; valore: string; normalizzato: string | null; e_titolare: boolean }>;
}

/**
 * Uno slug libero, partendo da quello naturale.
 *
 * `slug` e' UNIQUE e finisce nelle URL: due «Bar Centrale» a Pavia esistono
 * davvero, e il secondo non deve far fallire il salvataggio con un errore di
 * vincolo che a chi compila un modulo non dice niente.
 */
async function slugLibero(nome: string, citta?: string | null): Promise<string> {
  const base = creaSlug(nome, citta) || 'azienda';
  for (let n = 1; n < 60; n++) {
    const proposto = n === 1 ? base : `${base}-${n}`;
    const [preso] = await query<{ uno: number }>(`SELECT 1 AS uno FROM wesion.azienda WHERE slug = $1`, [proposto]);
    if (!preso) return proposto;
  }
  // Sessanta omonimi nella stessa citta' non sono un caso d'uso, sono un incidente.
  return `${base}-${Date.now()}`;
}

/**
 * Scrive i contatti passati, togliendo quelli spariti dall'elenco.
 *
 * ⚠️ IL NUMERO SI NORMALIZZA CON LA STESSA FUNZIONE DEL ROUTER, e non e' una
 * questione di pulizia: il router cerca il mittente in `contatto.normalizzato`.
 * Se qui il numero venisse normalizzato anche solo un po' diversamente,
 * scriveremmo una stringa che il router non ritrova mai, e il sintomo sarebbe
 * «il bot non mi risponde» su un cliente configurato benissimo. E' la stessa
 * ragione per cui `db/configura-cliente.ts` e' scritto in .ts e non in .mjs.
 *
 * I contatti si cancellano davvero, a differenza dei fatti: nessuna riga
 * pubblicata ci punta, e un numero sbagliato che resta in tabella e' peggio di
 * uno che sparisce — da li' il router accetta comandi.
 */
export async function salvaContatti(aziendaId: number, contatti: ContattoInput[]): Promise<void> {
  const validi = contatti
    .filter((c) => (TIPI_CONTATTO as readonly string[]).includes(c.tipo) && String(c.valore ?? '').trim())
    .map((c) => {
      const valore = String(c.valore).trim();
      const normalizzato =
        c.tipo === 'telefono' || c.tipo === 'whatsapp'
          ? normalizzaTelefono(valore)
          : c.tipo === 'sito'
            ? normalizzaSito(valore)
            : valore.toLowerCase();
      return { tipo: c.tipo, valore, normalizzato, e_titolare: Boolean(c.e_titolare) };
    });

  await query(`DELETE FROM wesion.contatto WHERE azienda_id = $1`, [aziendaId]);

  for (const c of validi) {
    await query(
      `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato, e_titolare, verificato_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (azienda_id, tipo, normalizzato) DO UPDATE
         SET valore = EXCLUDED.valore, e_titolare = EXCLUDED.e_titolare`,
      [aziendaId, c.tipo, c.valore, c.normalizzato, c.e_titolare]
    );
  }
}

export async function leggiAnagrafica(aziendaId: number): Promise<Anagrafica | null> {
  const [a] = await query<Omit<Anagrafica, 'contatti'>>(
    `SELECT id, nome, slug, categoria, citta, provincia, indirizzo, cap, maps_url, place_id, stato, fonte, note
       FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!a) return null;

  const contatti = await query<Anagrafica['contatti'][number]>(
    `SELECT id, tipo, valore, normalizzato, e_titolare FROM wesion.contatto
      WHERE azienda_id = $1 ORDER BY e_titolare DESC, tipo, id`,
    [aziendaId]
  );
  return { ...a, contatti };
}

export interface EsitoCreazione {
  id: number;
  slug: string;
  /** Vero quando il Place ID era gia' in tabella: non e' un errore, e' un ritrovamento. */
  giaEsisteva: boolean;
}

/**
 * Crea l'azienda.
 *
 * ⚠️ IL PLACE ID E' L'IDENTITA'. Se arriva e c'e' gia', NON si crea un doppione:
 * si restituisce quella che c'e'. E' la stessa scelta di schema che ha risolto
 * il disaccordo silenzioso fra `UNIQUE(nome,citta,telefono)` di leadgen e
 * `UNIQUE(telefono)` del router — §9 di STATO.md. Un locale inserito a mano
 * oggi e scrapato domani deve restare UNA riga che cambia stato, o si torna a
 * ricopiare fra due elenchi.
 */
export async function creaAzienda(d: DatiAzienda): Promise<EsitoCreazione> {
  const nome = String(d.nome ?? '').trim();
  if (!nome) throw new Error('il nome non può essere vuoto: è l’unica cosa che non si ricava da nient’altro');

  const stato = d.stato && STATI.has(d.stato) ? d.stato : 'prospect';
  const placeId = String(d.place_id ?? '').trim() || null;

  if (placeId) {
    const [esistente] = await query<{ id: number; slug: string }>(
      `SELECT id, slug FROM wesion.azienda WHERE place_id = $1`,
      [placeId]
    );
    if (esistente) return { id: esistente.id, slug: esistente.slug, giaEsisteva: true };
  }

  const citta = String(d.citta ?? '').trim() || null;
  const indirizzo = String(d.indirizzo ?? '').trim() || null;
  const slug = await slugLibero(nome, citta);

  const [creata] = await query<{ id: number }>(
    `INSERT INTO wesion.azienda
       (slug, nome, categoria, citta, provincia, indirizzo, cap, maps_url, place_id, stato, campagna_id, fonte, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manuale',$12)
     RETURNING id`,
    [
      slug,
      nome,
      String(d.categoria ?? '').trim() || null,
      citta,
      String(d.provincia ?? '').trim() || null,
      indirizzo,
      String(d.cap ?? '').trim() || estraiCap(indirizzo),
      String(d.maps_url ?? '').trim() || null,
      placeId,
      stato,
      d.campagna_id ?? null,
      String(d.note ?? '').trim() || null,
    ]
  );

  if (d.contatti?.length) await salvaContatti(creata.id, d.contatti);

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'azienda_creata', 'dashboard', $2)`,
    [creata.id, JSON.stringify({ nome, stato, a_mano: true })]
  );

  return { id: creata.id, slug, giaEsisteva: false };
}

/**
 * Corregge i dati di una che c'e' gia'.
 *
 * COALESCE su ogni campo: quello che non arriva resta com'era. Un modulo che
 * manda solo il telefono non deve svuotare l'indirizzo.
 */
export async function aggiornaAzienda(aziendaId: number, d: Partial<DatiAzienda>): Promise<Anagrafica | null> {
  const stato = d.stato && STATI.has(d.stato) ? d.stato : null;

  await query(
    `UPDATE wesion.azienda
        SET nome       = COALESCE($2, nome),
            categoria  = COALESCE($3, categoria),
            citta      = COALESCE($4, citta),
            provincia  = COALESCE($5, provincia),
            indirizzo  = COALESCE($6, indirizzo),
            cap        = COALESCE($7, cap),
            maps_url   = COALESCE($8, maps_url),
            place_id   = COALESCE($9, place_id),
            stato      = COALESCE($10, stato),
            note       = COALESCE($11, note),
            aggiornata_at = now()
      WHERE id = $1`,
    [
      aziendaId,
      d.nome !== undefined ? String(d.nome).trim() || null : null,
      d.categoria !== undefined ? String(d.categoria ?? '').trim() || null : null,
      d.citta !== undefined ? String(d.citta ?? '').trim() || null : null,
      d.provincia !== undefined ? String(d.provincia ?? '').trim() || null : null,
      d.indirizzo !== undefined ? String(d.indirizzo ?? '').trim() || null : null,
      d.cap !== undefined ? String(d.cap ?? '').trim() || null : null,
      d.maps_url !== undefined ? String(d.maps_url ?? '').trim() || null : null,
      d.place_id !== undefined ? String(d.place_id ?? '').trim() || null : null,
      stato,
      d.note !== undefined ? String(d.note ?? '').trim() || null : null,
    ]
  );

  if (d.contatti) await salvaContatti(aziendaId, d.contatti);

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'anagrafica_modificata', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ campi: Object.keys(d) })]
  );

  return leggiAnagrafica(aziendaId);
}
