/**
 * La materia prima di un cliente: cosa possiamo dire di lui, e cosa no.
 *
 * È la `SchedaFatti` di gbp-autoposter, tradotta. Là era un JSONB unico
 * attaccato al cliente; qui la stessa roba sta divisa in due tabelle, e la
 * divisione non è cosmetica:
 *
 *   `fatto`  — le cose VERE, una riga ciascuna, con provenienza (`fonte`),
 *              data di verifica e scadenza. Un fatto può scadere o essere
 *              disattivato senza toccare il resto.
 *   `voce`   — il tono e i CONFINI, che non sono fatti: sono istruzioni su
 *              come scrivere e su cosa non dire mai.
 *
 * COSA CI GUADAGNAMO. Ogni valore si porta dietro il suo `id`, e quell'id
 * finisce in `bozza.fatto_id`. Vuol dire che fra sei mesi, guardando un post
 * pubblicato, si può ancora rispondere alla domanda "su cosa si reggeva?" —
 * che è la differenza fra rivedere un testo chiedendosi *è vero?* invece di
 * *è bello?*.
 *
 * Le due voci che contano di più restano `non_fa` e `mai_dire`: sono i confini.
 * Il generatore può usare solo ciò che sta qui dentro e non può contraddirle.
 */

import { query } from './db';
import type { TagAttivita } from './ricorrenze';

/** Un valore utilizzabile, con l'id della riga da cui viene (se ne ha una). */
export interface VoceFatto {
  /** Nullo per i confini, che vengono da `voce` e non sono righe di `fatto`. */
  id: number | null;
  valore: string;
}

export interface Materia {
  settore: TagAttivita[];
  /** L'attività in concreto: "falegnameria su misura". */
  cosa_fa: VoceFatto | null;
  offerta: VoceFatto[];
  materiali: VoceFatto[];
  punti_forza: VoceFatto[];
  /**
   * Cosa apprezzano i clienti, dalle recensioni.
   *
   * Non c'era in gbp-autoposter. È materiale verificato da terzi — non lo
   * diciamo noi, lo dicono loro — quindi si può usare senza chiedere conferma,
   * a differenza di tutto il resto.
   */
  apprezzato: VoceFatto[];
  /** I confini. Vengono da `voce`: non sono fatti, sono divieti. */
  non_fa: string[];
  mai_dire: string[];
  /** Come scrivere. */
  tono: string;
  pubblico: string;
  /** Lo SFONDO: sceglie il taglio, non si cita mai. Vedi `voce.ts`. */
  origine: string;
  come_ragiona: string;
  /** Le parole sue e quelle che non gli appartengono. */
  parole_sue: string[];
  da_evitare: string[];
}

/** Le chiavi di `fatto` che i pilastri sanno usare come materia prima. */
export const CHIAVI_FATTO = ['cosa_fa', 'offerta', 'materiali', 'punti_forza'] as const;

/** Da dove un pilastro può attingere. */
export type FonteMateria =
  | 'cosa_fa'
  | 'offerta'
  | 'materiali'
  | 'punti_forza'
  | 'apprezzato'
  | 'non_fa'
  | 'pubblico';

export const MATERIA_VUOTA: Materia = {
  settore: [],
  cosa_fa: null,
  offerta: [],
  materiali: [],
  punti_forza: [],
  apprezzato: [],
  non_fa: [],
  mai_dire: [],
  tono: '',
  pubblico: '',
  origine: '',
  come_ragiona: '',
  parole_sue: [],
  da_evitare: [],
};

/**
 * Qualunque fonte, sempre come lista.
 *
 * I confini e il pubblico non sono righe di `fatto` e quindi non hanno id: si
 * restituiscono con `id: null`. Chi costruisce una bozza da uno di questi non
 * potrà agganciarla a un fatto, ed è corretto — non c'è nessun fatto sotto.
 */
export function daFonte(m: Materia, fonte: FonteMateria): VoceFatto[] {
  switch (fonte) {
    case 'cosa_fa':
      return m.cosa_fa ? [m.cosa_fa] : [];
    case 'offerta':
      return m.offerta;
    case 'materiali':
      return m.materiali;
    case 'punti_forza':
      return m.punti_forza;
    case 'apprezzato':
      return m.apprezzato;
    case 'non_fa':
      return m.non_fa.map((v) => ({ id: null, valore: v }));
    case 'pubblico':
      return m.pubblico ? [{ id: null, valore: m.pubblico }] : [];
  }
}

/**
 * La materia di un'azienda, letta dal database.
 *
 * Solo i fatti ATTIVI e NON SCADUTI. È il motivo per cui quelle due colonne
 * esistono: un'offerta stagionale finita a settembre non deve continuare a
 * generare post a novembre, e nessuno si ricorda di cancellarla a mano.
 */
export async function leggiMateria(aziendaId: number): Promise<Materia> {
  const [voce] = await query<{
    voce: string | null;
    pubblico: string | null;
    origine: string | null;
    come_ragiona: string | null;
    apprezzato: string[];
    non_fa: string[];
    mai_dire: string[];
    parole_sue: string[];
    da_evitare: string[];
  }>(
    `SELECT voce, pubblico, origine, come_ragiona, apprezzato, non_fa, mai_dire, parole_sue, da_evitare
       FROM wesion.voce WHERE azienda_id = $1`,
    [aziendaId]
  );

  const [azienda] = await query<{ settore: string[] }>(
    `SELECT settore FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );

  const fatti = await query<{ id: number; chiave: string; valore: string }>(
    `SELECT id, chiave, valore
       FROM wesion.fatto
      WHERE azienda_id = $1
        AND attivo
        AND (scade_at IS NULL OR scade_at > now())
      ORDER BY id`,
    [aziendaId]
  );

  const per = (chiave: string): VoceFatto[] =>
    fatti.filter((f) => f.chiave === chiave).map((f) => ({ id: f.id, valore: f.valore }));

  return {
    settore: (azienda?.settore ?? []) as TagAttivita[],
    cosa_fa: per('cosa_fa')[0] ?? null,
    offerta: per('offerta'),
    materiali: per('materiali'),
    punti_forza: per('punti_forza'),
    apprezzato: (voce?.apprezzato ?? []).map((v) => ({ id: null, valore: v })),
    non_fa: voce?.non_fa ?? [],
    mai_dire: voce?.mai_dire ?? [],
    tono: voce?.voce ?? '',
    pubblico: voce?.pubblico ?? '',
    origine: voce?.origine ?? '',
    come_ragiona: voce?.come_ragiona ?? '',
    parole_sue: voce?.parole_sue ?? [],
    da_evitare: voce?.da_evitare ?? [],
  };
}

/**
 * Vero se c'è abbastanza sostanza per generare contenuti non generici.
 *
 * La soglia è la stessa di gbp-autoposter: sapere cosa fa, più almeno tre cose
 * concrete da dire. Sotto quella, il generatore non ha di che parlare e
 * produce le frasi che si potrebbero incollare sul profilo di chiunque.
 */
export function materiaUtilizzabile(m: Materia): boolean {
  return Boolean(m.cosa_fa?.valore) && m.offerta.length + m.materiali.length + m.punti_forza.length >= 3;
}

/**
 * La materia vista come voce, per `vocePerPrompt`.
 *
 * Esiste solo perche' la stessa cosa ha due nomi in due posti: qui e'
 * `tono`, in `voce.ts` (e in tabella) e' `voce`. Un adattatore di tre righe e'
 * meglio di rinominare una colonna a cui punta gia' del codice — ma se un
 * giorno si rinomina, questa funzione sparisce e nessuno se ne accorge.
 */
export function voceDi(m: Materia): import('./voce').VoceCliente {
  return {
    origine: m.origine,
    come_ragiona: m.come_ragiona,
    voce: m.tono,
    pubblico: m.pubblico,
    apprezzato: m.apprezzato.map((v) => v.valore),
    parole_sue: m.parole_sue,
    da_evitare: m.da_evitare,
  };
}
