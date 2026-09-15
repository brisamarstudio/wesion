/**
 * Il piano editoriale Social del mese — deterministico, senza AI.
 *
 * Creato il 15/09/2026.
 * Riusa materia, pilastri e ricorrenze senza toccare il piano GBP (`piano.ts`).
 * Aggiunge le dimensioni:
 *   - canale (facebook, instagram, linkedin)
 *   - formato (post, carosello, reel, domanda)
 *   - framework di copywriting (PAS, AIDA, BAB, STAR, libero)
 */

import { query } from './db';
import { daFonte, type Materia } from './materia';
import { ricorrenzeDelMese, type TagAttivita } from './ricorrenze';
import { pilastriDisponibili, type Pilastro } from './pilastri';
import {
  type CanaleSocial,
  type FormatoSocial,
  type FrameworkSocial,
  CANALI_DEFAULT,
  FORMATI_DEFAULT,
} from './social';

export interface SlotPianoSocial {
  data: string;
  origine: 'ricorrenza' | 'pilastro';
  titolo: string;
  angolo: string;
  fatto: string;
  fonte: string;
  fattoId: string | number | null;
  canale: CanaleSocial;
  formato: FormatoSocial;
  framework: FrameworkSocial;
}

export interface EsitoPianoSocial {
  slot: SlotPianoSocial[];
  avvisi: string[];
}

export interface OpzioniPianoSocial {
  anno: number;
  mese: number;
  quantita?: number;
  ora?: number;
  canali?: CanaleSocial[];
  formati?: FormatoSocial[];
}

const FRAMEWORK_ROTAZIONE: FrameworkSocial[] = ['PAS', 'AIDA', 'BAB', 'STAR', 'libero'];

function postPerMese(anno: number, mese: number, aSettimana = 3): number {
  const giorni = new Date(anno, mese, 0).getDate();
  return Math.round((giorni / 7) * aSettimana);
}

function giorniUtili(anno: number, mese: number): number[] {
  const ultimo = new Date(anno, mese, 0).getDate();
  return Array.from({ length: ultimo }, (_, i) => i + 1);
}

function iso(anno: number, mese: number, giorno: number, ora: number): string {
  return new Date(anno, mese - 1, giorno, ora, 0, 0).toISOString();
}

function materiaPerRicorrenza(
  m: Materia,
  giro: number
): { fatto: string; fonte: string; fattoId: string | number | null } {
  const disponibili: Array<{ fonte: string; voce: { id: string | number | null; valore: string } }> = [];
  for (const fonte of ['offerta', 'punti_forza', 'materiali', 'apprezzato'] as const) {
    for (const voce of daFonte(m, fonte)) disponibili.push({ fonte, voce });
  }
  if (!disponibili.length) {
    return { fatto: m.cosa_fa?.valore ?? '', fonte: 'cosa_fa', fattoId: m.cosa_fa?.id ?? null };
  }
  const scelta = disponibili[giro % disponibili.length];
  return { fatto: scelta.voce.valore, fonte: scelta.fonte, fattoId: scelta.voce.id };
}

function materiaPerPilastro(
  m: Materia,
  p: Pilastro,
  giro: number
): { fatto: string; fonte: string; fattoId: string | number | null } {
  const voci = daFonte(m, p.fonte);
  const scelta = voci[giro % voci.length] ?? voci[0];
  return { fatto: scelta?.valore ?? '', fonte: p.fonte, fattoId: scelta?.id ?? null };
}

/**
 * Costruisce il piano social per un mese.
 * Deterministico: stesso cliente, stesso mese = identico piano.
 */
export function costruisciPianoSocial(materia: Materia, opzioni: OpzioniPianoSocial): EsitoPianoSocial {
  const {
    anno,
    mese,
    quantita = postPerMese(anno, mese),
    ora = 11, // orario social mattutino ideale
    canali = CANALI_DEFAULT,
    formati = FORMATI_DEFAULT,
  } = opzioni;

  const avvisi: string[] = [];
  const canaliAttivi = canali.length ? canali : CANALI_DEFAULT;
  const formatiAttivi = formati.length ? formati : FORMATI_DEFAULT;

  const settori: TagAttivita[] = materia.settore.length ? materia.settore : [];
  if (!settori.length) {
    avvisi.push('Settore non indicato: si usano solo temi generici.');
  }

  const pilastri = pilastriDisponibili(materia, settori);
  if (!pilastri.length) {
    avvisi.push('Nessun tema disponibile: la materia prima è troppo vuota per generare contenuti social.');
    return { slot: [], avvisi };
  }

  const suoi = new Set<TagAttivita>([...settori, 'tutti']);
  const ricorrenze = ricorrenzeDelMese(anno, mese).filter((r) => r.tag.some((t) => suoi.has(t)));

  const utili = giorniUtili(anno, mese);
  const massimoRicorrenze = Math.floor(quantita / 2);

  const presi = new Set<number>();
  const slot: SlotPianoSocial[] = [];

  // 1. Ricorrenze pertinenti
  let giroRicorrenza = 0;
  for (const r of ricorrenze.slice(0, massimoRicorrenze)) {
    const giorno = r.giorno[1];
    if (presi.has(giorno)) continue;
    presi.add(giorno);

    const indiceSlot = slot.length;
    slot.push({
      data: iso(anno, mese, giorno, ora),
      origine: 'ricorrenza',
      titolo: r.nome,
      angolo: r.angolo,
      canale: canaliAttivi[indiceSlot % canaliAttivi.length],
      formato: formatiAttivi[indiceSlot % formatiAttivi.length],
      framework: FRAMEWORK_ROTAZIONE[indiceSlot % FRAMEWORK_ROTAZIONE.length],
      ...materiaPerRicorrenza(materia, giroRicorrenza++),
    });
  }

  // 2. Pilastri sui giorni rimanenti
  const mancanti = Math.max(0, quantita - slot.length);
  const liberi = utili.filter((g) => !presi.has(g));

  if (mancanti > liberi.length) {
    avvisi.push(
      `Richiesti ${quantita} post ma il mese offre ${slot.length + liberi.length} giorni utili: ne verranno pianificati meno.`
    );
  }

  const passo = mancanti > 0 ? liberi.length / mancanti : 0;
  for (let i = 0; i < Math.min(mancanti, liberi.length); i++) {
    const giorno = liberi[Math.floor(i * passo)];
    const pilastro = pilastri[i % pilastri.length];
    const indiceSlot = slot.length;

    slot.push({
      data: iso(anno, mese, giorno, ora),
      origine: 'pilastro',
      titolo: pilastro.nome,
      angolo: pilastro.angolo,
      canale: canaliAttivi[indiceSlot % canaliAttivi.length],
      formato: formatiAttivi[indiceSlot % formatiAttivi.length],
      framework: FRAMEWORK_ROTAZIONE[indiceSlot % FRAMEWORK_ROTAZIONE.length],
      ...materiaPerPilastro(materia, pilastro, i),
    });
  }

  slot.sort((a, b) => a.data.localeCompare(b.data));
  return { slot, avvisi };
}

/**
 * Salva il piano social come bozze vuote (stato='vuota', tipo='social').
 * Idempotente sul mese selezionato: pulisce gli slot vuoti precedenti e li riscrive.
 */
export async function salvaPianoSocial(
  aziendaId: string | number,
  slot: SlotPianoSocial[],
  anno: number,
  mese: number
): Promise<{ creati: number; rimossi: number }> {
  const inizio = new Date(anno, mese - 1, 1).toISOString();
  const fine = new Date(anno, mese, 1).toISOString();

  const rimossi = await query<{ id: string | number }>(
    `DELETE FROM wesion.bozza
      WHERE azienda_id = $1 AND tipo = 'social' AND origine = 'piano' AND stato = 'vuota'
        AND pubblica_at >= $2 AND pubblica_at < $3
      RETURNING id`,
    [aziendaId, inizio, fine]
  );

  let creati = 0;
  for (const s of slot) {
    await query(
      `INSERT INTO wesion.bozza (azienda_id, tipo, origine, fatto_id, contenuto, stato, pubblica_at)
       VALUES ($1, 'social', 'piano', $2, $3, 'vuota', $4)`,
      [
        aziendaId,
        s.fattoId,
        JSON.stringify({
          titolo: s.titolo,
          angolo: s.angolo,
          fatto: s.fatto,
          fonte: s.fonte,
          canale: s.canale,
          formato: s.formato,
          framework: s.framework,
          origine_slot: s.origine,
        }),
        s.data,
      ]
    );
    creati++;
  }

  await query(
    `INSERT INTO wesion.evento (azienda_id, tipo, attore, dettaglio)
     VALUES ($1, 'piano_social_costruito', 'dashboard', $2)`,
    [aziendaId, JSON.stringify({ anno, mese, creati, rimossi: rimossi.length })]
  );

  return { creati, rimossi: rimossi.length };
}
