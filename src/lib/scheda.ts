/**
 * La scheda di un cliente: tutto quello che serve per farlo lavorare.
 *
 * Mette insieme le quattro cose che stanno in quattro tabelle diverse e che
 * finora si scrivevano solo in SQL: il settore, la voce, i fatti e i servizi.
 * Senza una pagina che le raccolga, "aggiungere un cliente" vuol dire aprire
 * il database — che e' esattamente il genere di cosa che si fa una volta bene
 * e la seconda di fretta.
 *
 * ⚠️ I FATTI NON SI CANCELLANO MAI, SI SPENGONO.
 *
 * `bozza.fatto_id` punta alla riga del fatto: e' cosi' che fra sei mesi si puo'
 * ancora rispondere a "su cosa si reggeva questo post?". Riscrivere l'elenco
 * cancellando e reinserendo darebbe id nuovi, e tutti i post pubblicati
 * perderebbero il loro aggancio (la chiave e' ON DELETE SET NULL, quindi in
 * silenzio). Quindi: quelli che restano si riusano per valore, quelli tolti si
 * marcano `attivo = false`, e la storia regge.
 */

import { query } from './db';
import type { TagAttivita } from './ricorrenze';

export interface FattoScheda {
  id: number;
  chiave: string;
  valore: string;
  fonte: string;
  verificato_at: string | null;
}

export interface ServizioScheda {
  tipo: string;
  attivo: boolean;
  config: Record<string, string>;
}

export interface Scheda {
  id: number;
  nome: string;
  slug: string;
  citta: string | null;
  stato: string;
  settore: TagAttivita[];
  voce: {
    voce: string;
    pubblico: string;
    /** Lo SFONDO: sceglie il taglio, non si cita mai. Vedi `voce.ts`. */
    origine: string;
    come_ragiona: string;
    apprezzato: string[];
    non_fa: string[];
    mai_dire: string[];
    parole_sue: string[];
    da_evitare: string[];
  };
  fatti: FattoScheda[];
  servizi: ServizioScheda[];
  /** Chi può dare comandi al router. */
  titolari: Array<{ id: number; tipo: string; valore: string }>;
}

export const VOCE_VUOTA: Scheda['voce'] = {
  voce: '',
  pubblico: '',
  origine: '',
  come_ragiona: '',
  apprezzato: [],
  non_fa: [],
  mai_dire: [],
  parole_sue: [],
  da_evitare: [],
};

export async function leggiScheda(aziendaId: number): Promise<Scheda | null> {
  const [azienda] = await query<{
    id: number;
    nome: string;
    slug: string;
    citta: string | null;
    stato: string;
    settore: string[];
  }>(`SELECT id, nome, slug, citta, stato, settore FROM wesion.azienda WHERE id = $1`, [aziendaId]);
  if (!azienda) return null;

  const [voce] = await query<Scheda['voce']>(
    `SELECT COALESCE(voce, '') AS voce, COALESCE(pubblico, '') AS pubblico,
            COALESCE(origine, '') AS origine, COALESCE(come_ragiona, '') AS come_ragiona,
            apprezzato, non_fa, mai_dire, parole_sue, da_evitare
       FROM wesion.voce WHERE azienda_id = $1`,
    [aziendaId]
  );

  // Solo gli ATTIVI: quelli spenti restano in tabella per non rompere i post
  // vecchi, ma non si mostrano e non generano piu' niente.
  const fatti = await query<FattoScheda>(
    `SELECT id, chiave, valore, fonte, verificato_at
       FROM wesion.fatto WHERE azienda_id = $1 AND attivo ORDER BY chiave, id`,
    [aziendaId]
  );

  const servizi = await query<ServizioScheda>(
    `SELECT tipo, attivo, config FROM wesion.servizio WHERE azienda_id = $1 ORDER BY tipo`,
    [aziendaId]
  );

  const titolari = await query<{ id: number; tipo: string; valore: string }>(
    `SELECT id, tipo, valore FROM wesion.contatto WHERE azienda_id = $1 AND e_titolare ORDER BY id`,
    [aziendaId]
  );

  return {
    ...azienda,
    settore: (azienda.settore ?? []) as TagAttivita[],
    voce: voce ?? VOCE_VUOTA,
    fatti,
    servizi,
    titolari,
  };
}

export interface ModificheScheda {
  settore?: string[];
  stato?: string;
  voce?: Partial<Scheda['voce']>;
  /** L'elenco completo: quelli non più presenti vengono spenti, non cancellati. */
  fatti?: Array<{ chiave: string; valore: string; fonte?: string }>;
  servizi?: Array<{ tipo: string; attivo: boolean; config: Record<string, string> }>;
}

const CHIAVI_AMMESSE = new Set(['cosa_fa', 'offerta', 'materiali', 'punti_forza']);
const FONTI_AMMESSE = new Set(['detto_dal_cliente', 'recensioni', 'sito', 'maps', 'ricerca']);

export async function salvaScheda(aziendaId: number, m: ModificheScheda): Promise<Scheda | null> {
  if (m.settore || m.stato) {
    await query(
      `UPDATE wesion.azienda
          SET settore = COALESCE($2, settore),
              stato   = COALESCE($3, stato),
              aggiornata_at = now()
        WHERE id = $1`,
      [aziendaId, m.settore ?? null, m.stato ?? null]
    );
  }

  if (m.voce) {
    const v = m.voce;
    await query(
      `INSERT INTO wesion.voce (azienda_id, voce, pubblico, apprezzato, non_fa, mai_dire, parole_sue, da_evitare, origine, come_ragiona)
       VALUES ($1, $2, $3, COALESCE($4,'{}'), COALESCE($5,'{}'), COALESCE($6,'{}'), COALESCE($7,'{}'), COALESCE($8,'{}'), $9, $10)
       ON CONFLICT (azienda_id) DO UPDATE
         SET voce = COALESCE(EXCLUDED.voce, wesion.voce.voce),
             pubblico = COALESCE(EXCLUDED.pubblico, wesion.voce.pubblico),
             origine = COALESCE(EXCLUDED.origine, wesion.voce.origine),
             come_ragiona = COALESCE(EXCLUDED.come_ragiona, wesion.voce.come_ragiona),
             apprezzato = EXCLUDED.apprezzato,
             non_fa = EXCLUDED.non_fa,
             mai_dire = EXCLUDED.mai_dire,
             parole_sue = EXCLUDED.parole_sue,
             da_evitare = EXCLUDED.da_evitare,
             aggiornata_at = now()`,
      [
        aziendaId,
        v.voce ?? null,
        v.pubblico ?? null,
        v.apprezzato ?? [],
        v.non_fa ?? [],
        v.mai_dire ?? [],
        v.parole_sue ?? [],
        v.da_evitare ?? [],
        v.origine ?? null,
        v.come_ragiona ?? null,
      ]
    );
  }

  if (m.fatti) {
    const validi = m.fatti
      .filter((f) => CHIAVI_AMMESSE.has(f.chiave) && String(f.valore).trim())
      .map((f) => ({
        chiave: f.chiave,
        valore: String(f.valore).trim(),
        fonte: FONTI_AMMESSE.has(f.fonte ?? '') ? f.fonte! : 'detto_dal_cliente',
      }));

    for (const f of validi) {
      /**
       * Per VALORE, non per id: se il fatto c'era già lo si risveglia con la
       * sua riga originale, e i post che ci puntavano restano agganciati.
       * Un fatto tolto e rimesso è lo stesso fatto, non uno nuovo.
       */
      await query(
        `INSERT INTO wesion.fatto (azienda_id, chiave, valore, fonte, verificato_at, attivo)
         SELECT $1, $2, $3, $4, now(), true
          WHERE NOT EXISTS (
            SELECT 1 FROM wesion.fatto
             WHERE azienda_id = $1 AND chiave = $2 AND valore = $3
          )`,
        [aziendaId, f.chiave, f.valore, f.fonte]
      );
      await query(
        `UPDATE wesion.fatto SET attivo = true, fonte = $4, verificato_at = now()
          WHERE azienda_id = $1 AND chiave = $2 AND valore = $3`,
        [aziendaId, f.chiave, f.valore, f.fonte]
      );
    }

    // Quelli spariti dall'elenco si SPENGONO. Restano in tabella perché
    // `bozza.fatto_id` può ancora puntarci: un post pubblicato deve poter
    // dire su cosa si reggeva, anche se quel fatto non vale più.
    await query(
      `UPDATE wesion.fatto SET attivo = false
        WHERE azienda_id = $1 AND attivo
          AND NOT (chiave || '' || valore = ANY($2))`,
      [aziendaId, validi.map((f) => `${f.chiave}${f.valore}`)]
    );
  }

  if (m.servizi) {
    for (const s of m.servizi) {
      await query(
        `INSERT INTO wesion.servizio (azienda_id, tipo, attivo, config)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (azienda_id, tipo) DO UPDATE
           SET attivo = EXCLUDED.attivo,
               config = wesion.servizio.config || EXCLUDED.config`,
        [aziendaId, s.tipo, s.attivo, JSON.stringify(s.config ?? {})]
      );
    }
  }

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio) VALUES ($1, 'scheda_modificata', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ campi: Object.keys(m) })]
  );

  return leggiScheda(aziendaId);
}
