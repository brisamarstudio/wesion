/**
 * Il modulo Social di Wesion — tipi e validazione.
 *
 * Creato il 15/09/2026.
 * Ispirato al sistema operativo social di Charlie Hills (voce -> scrittura ->
 * visual -> ideazione -> valutazione), tradotto dentro Wesion.
 *
 * In Fase 1 le bozze social non hanno pubblicazione automatica: vengono approvate
 * in consolle, l'operatore le copia negli appunti («Copia per Facebook/Instagram»)
 * e le incolla in Meta Business Suite, segnandole come 'pubblicata' a mano.
 */

export type CanaleSocial = 'facebook' | 'instagram' | 'linkedin';
export type FormatoSocial = 'post' | 'carosello' | 'reel' | 'domanda';
export type FrameworkSocial = 'PAS' | 'AIDA' | 'BAB' | 'STAR' | 'libero';

export interface SlideCarosello {
  n: number;
  testo: string;
  prompt_immagine: string;
}

export interface BattutaReel {
  secondi: string;
  a_video: string;
  voce: string;
}

export interface PubblicataAMano {
  operatore: string;
  data: string;
}

export interface ContenutoSocial {
  canale: CanaleSocial;
  formato: FormatoSocial;
  framework: FrameworkSocial;
  ganci: string[];
  gancio_scelto: number;
  testo: string;
  primo_commento?: string;
  hashtag?: string[];
  slide?: SlideCarosello[];
  script_reel?: BattutaReel[];
  dati_mancanti?: string[];
  titolo?: string;
  angolo?: string;
  fatto?: string;
  fonte?: string;
  origine_slot?: string;
  pubblicata_a_mano?: PubblicataAMano;
}

export interface ConfigServizioSocial {
  canali: CanaleSocial[];
  post_a_settimana: number;
  formati?: FormatoSocial[];
  tono_social?: string;
}

export const FORMATI_DEFAULT: FormatoSocial[] = ['post', 'carosello', 'domanda', 'reel'];
export const CANALI_DEFAULT: CanaleSocial[] = ['facebook', 'instagram'];

/**
 * Validatore per `generaJson`: verifica che il modello abbia restituito
 * la struttura minima vitale di un contenuto social.
 */
export function isContenutoSocial(x: unknown): x is ContenutoSocial {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;

  if (typeof o.testo !== 'string' || !o.testo.trim()) return false;
  if (!Array.isArray(o.ganci) || o.ganci.length === 0) return false;

  return true;
}
